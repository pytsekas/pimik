import sharp from 'sharp';

const JPEG_QUALITY = 85;

export type Variants = { width: number; height: number; w1000: Buffer; w300: Buffer };

async function resized(input: Buffer, width: number): Promise<Buffer> {
  return sharp(input)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Decodes the image (honouring EXIF orientation) and produces the 1000px and
 * 300px wide JPEG variants. Width/height describe the oriented original.
 * Throws when the input is not a decodable image.
 */
export async function makeVariants(input: Buffer): Promise<Variants> {
  const { info } = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const [w1000, w300] = await Promise.all([resized(input, 1000), resized(input, 300)]);
  return { width: info.width, height: info.height, w1000, w300 };
}
