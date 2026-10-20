import sharp from 'sharp';
import { describe, expect, it } from 'vite-plus/test';
import { jpegWithGps } from '../test/images.ts';
import { sanitizeOriginal } from './sanitizeOriginal.ts';
import { stripJpegMetadata } from './stripMetadata.ts';
import { InvalidImageError } from './variants.ts';

const raw = (data: Buffer) => sharp(data).raw().toBuffer();

describe('stripJpegMetadata', () => {
  it('removes EXIF segments and keeps the entropy-coded data byte-identical', async () => {
    const input = await jpegWithGps(300, 200);
    const output = stripJpegMetadata(input);
    expect(output.length).toBeLessThan(input.length);
    const scan = (data: Buffer) => data.subarray(data.indexOf(Buffer.from([0xff, 0xda])));
    expect(scan(output).equals(scan(input))).toBe(true);
    expect((await sharp(output).metadata()).exif).toBeUndefined();
  });

  const segment = (marker: number, payload: string) => {
    const body = Buffer.from(payload, 'latin1');
    const header = Buffer.from([0xff, marker, 0, 0]);
    header.writeUInt16BE(body.length + 2, 2);
    return Buffer.concat([header, body]);
  };
  const scanStarts = (jpeg: Buffer) => {
    const starts: number[] = [];
    for (let i = 0; i < jpeg.length - 1; i++) {
      if (jpeg[i] === 0xff && jpeg[i + 1] === 0xda) starts.push(i);
    }
    return starts;
  };

  it('removes APP1 and COM segments injected between progressive scans', async () => {
    const base = await sharp({
      create: { width: 200, height: 150, channels: 3, background: '#a0b0c0' },
    })
      .jpeg({ progressive: true })
      .toBuffer();
    const starts = scanStarts(base);
    expect(starts.length).toBeGreaterThan(1);
    const second = starts[1] as number;
    const injected = Buffer.concat([
      base.subarray(0, second),
      segment(0xe1, 'Exif\0\0hidden-gps'),
      segment(0xfe, 'hidden-comment'),
      base.subarray(second),
    ]);
    const output = stripJpegMetadata(injected);
    expect(output.includes(Buffer.from('hidden'))).toBe(false);
    expect((await raw(output)).equals(await raw(base))).toBe(true);
  });

  it('drops everything after the first EOI', async () => {
    const main = await jpegWithGps(100, 80);
    const preview = await jpegWithGps(20, 20);
    const output = stripJpegMetadata(Buffer.concat([main, preview]));
    expect(output.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
    expect(output.includes(Buffer.from('Exif'))).toBe(false);
    expect((await sharp(output).metadata()).width).toBe(100);
  });

  it('rejects data that is not a JPEG', () => {
    expect(() => stripJpegMetadata(Buffer.from('nope'))).toThrow(InvalidImageError);
  });
});

describe('sanitizeOriginal', () => {
  it('keeps the pixels of an upright JPEG', async () => {
    const input = await jpegWithGps(300, 200);
    const result = await sanitizeOriginal(input);
    expect(result).toMatchObject({ contentType: 'image/jpeg', width: 300, height: 200 });
    expect((await raw(result.data)).equals(await raw(input))).toBe(true);
  });

  it('re-encodes a rotated JPEG upright', async () => {
    const result = await sanitizeOriginal(await jpegWithGps(300, 200, 6));
    expect(result).toMatchObject({ width: 200, height: 300 });
    expect((await sharp(result.data).metadata()).orientation).toBeUndefined();
  });

  it('re-encodes PNG and WebP in their own format without metadata', async () => {
    const base = sharp({ create: { width: 50, height: 40, channels: 3, background: '#123456' } });
    const png = await sanitizeOriginal(await base.clone().png().toBuffer());
    const webp = await sanitizeOriginal(await base.clone().webp().toBuffer());
    expect(png).toMatchObject({ contentType: 'image/png', width: 50, height: 40 });
    expect(webp).toMatchObject({ contentType: 'image/webp', width: 50, height: 40 });
  });

  it('rejects non-images and images over the pixel limit as InvalidImageError', async () => {
    await expect(sanitizeOriginal(Buffer.from('plain text'))).rejects.toThrow(InvalidImageError);
    const big = await jpegWithGps(300, 200);
    await expect(sanitizeOriginal(big, { limitInputPixels: 1000 })).rejects.toThrow(
      InvalidImageError,
    );
  });
});
