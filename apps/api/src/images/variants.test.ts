import sharp from 'sharp';
import { describe, expect, it } from 'vite-plus/test';
import { jpeg } from '../test/images.ts';
import { InvalidImageError, makeVariants } from './variants.ts';

async function dimensions(data: Buffer) {
  const { width, height, format } = await sharp(data).metadata();
  return { width, height, format };
}

describe('makeVariants', () => {
  it('reports the original size and resizes to 1000 and 300px wide JPEGs', async () => {
    const result = await makeVariants(await jpeg(2000, 1333));
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1333);
    expect(await dimensions(result.w1000)).toEqual({ width: 1000, height: 667, format: 'jpeg' });
    expect(await dimensions(result.w300)).toEqual({ width: 300, height: 200, format: 'jpeg' });
  });

  it('never upscales a small input', async () => {
    const result = await makeVariants(await jpeg(600, 400));
    expect((await dimensions(result.w1000)).width).toBe(600);
    expect((await dimensions(result.w300)).width).toBe(300);
  });

  it('applies EXIF orientation to the reported size and variants', async () => {
    const result = await makeVariants(await jpeg(2000, 1000, 6));
    expect(result.width).toBe(1000);
    expect(result.height).toBe(2000);
    expect(await dimensions(result.w300)).toEqual({ width: 300, height: 600, format: 'jpeg' });
  });

  it('rejects data that is not an image', async () => {
    await expect(makeVariants(Buffer.from('definitely not an image'))).rejects.toThrow(
      InvalidImageError,
    );
  });

  it('rejects an image over the pixel limit', async () => {
    await expect(makeVariants(await jpeg(600, 400), { limitInputPixels: 1000 })).rejects.toThrow(
      InvalidImageError,
    );
  });
});
