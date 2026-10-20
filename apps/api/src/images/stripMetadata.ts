import { InvalidImageError } from './variants.ts';

const SOI = 0xd8;
const SOS = 0xda;
const ICC_SIGNATURE = Buffer.from('ICC_PROFILE\0', 'latin1');
const JFXX_SIGNATURE = Buffer.from('JFXX\0', 'latin1');

/** Segments that never carry descriptive data: markers without a payload length. */
const isStandalone = (marker: number) => marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8);

function keepSegment(marker: number, payload: Buffer): boolean {
  if (marker === 0xe0) return !payload.subarray(0, 5).equals(JFXX_SIGNATURE);
  if (marker === 0xe2) return payload.subarray(0, 12).equals(ICC_SIGNATURE);
  if (marker === 0xee) return true;
  const isOtherApp = marker >= 0xe1 && marker <= 0xef;
  return !isOtherApp && marker !== 0xfe;
}

/**
 * Losslessly removes EXIF/XMP (APP1), IPTC (APP13), comments, extension
 * thumbnails and other APPn segments from a JPEG, keeping JFIF, ICC and Adobe
 * segments. Entropy-coded image data is copied untouched.
 */
export function stripJpegMetadata(jpeg: Buffer): Buffer {
  if (jpeg[0] !== 0xff || jpeg[1] !== SOI) throw new InvalidImageError('Not a JPEG');
  const parts: Buffer[] = [jpeg.subarray(0, 2)];
  let pos = 2;
  while (pos < jpeg.length) {
    if (jpeg[pos] !== 0xff) throw new InvalidImageError('Corrupt JPEG segment');
    const marker = jpeg[pos + 1];
    if (marker === undefined) throw new InvalidImageError('Truncated JPEG');
    if (marker === 0xff) {
      pos += 1;
      continue;
    }
    if (isStandalone(marker)) {
      parts.push(jpeg.subarray(pos, pos + 2));
      pos += 2;
      continue;
    }
    if (pos + 4 > jpeg.length) throw new InvalidImageError('Truncated JPEG');
    const end = pos + 2 + jpeg.readUInt16BE(pos + 2);
    if (end > jpeg.length) throw new InvalidImageError('Truncated JPEG');
    if (marker === SOS) {
      parts.push(jpeg.subarray(pos));
      return Buffer.concat(parts);
    }
    if (keepSegment(marker, jpeg.subarray(pos + 4, end))) parts.push(jpeg.subarray(pos, end));
    pos = end;
  }
  throw new InvalidImageError('JPEG has no image data');
}
