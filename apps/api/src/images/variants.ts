import sharp, { type Metadata } from 'sharp';

const JPEG_QUALITY = 85;
export const MAX_INPUT_PIXELS = 100_000_000;

export type Variants = { width: number; height: number; w1000: Buffer; w300: Buffer };
export type ImageLimits = { limitInputPixels?: number | undefined };

/** Thrown for input that is not a decodable image or exceeds the pixel limit. */
export class InvalidImageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidImageError';
  }
}

/** Sharp reports bad input through plain Errors; only those messages mean "not a usable image". */
const BAD_INPUT = /unsupported image format|pixel limit|corrupt|truncated|premature end|vips\w*:/i;

export function asInvalidImage(err: unknown): unknown {
  if (err instanceof InvalidImageError) return err;
  if (err instanceof Error && BAD_INPUT.test(err.message)) {
    return new InvalidImageError(err.message, { cause: err });
  }
  return err;
}

export function limitOf(limits: ImageLimits): number {
  return limits.limitInputPixels ?? MAX_INPUT_PIXELS;
}

/** Orientations 5-8 swap the axes when displayed upright. */
export function orientedSize(meta: Metadata): { width: number; height: number } {
  const { width, height, orientation = 1 } = meta;
  return orientation >= 5 ? { width: height, height: width } : { width, height };
}

/**
 * Decodes the image (honouring EXIF orientation) and produces the 1000px and
 * 300px wide JPEG variants. Width/height describe the oriented original.
 * Throws InvalidImageError when the input is not a decodable image or is too large.
 */
export async function makeVariants(input: Buffer, limits: ImageLimits = {}): Promise<Variants> {
  try {
    const limitInputPixels = limitOf(limits);
    const base = sharp(input, { limitInputPixels }).rotate();
    const { width, height } = orientedSize(await sharp(input, { limitInputPixels }).metadata());
    const variant = (target: number) =>
      base
        .clone()
        .resize({ width: target, withoutEnlargement: true })
        .jpeg({ quality: JPEG_QUALITY })
        .toBuffer();
    const [w1000, w300] = await Promise.all([variant(1000), variant(300)]);
    return { width, height, w1000, w300 };
  } catch (err) {
    throw asInvalidImage(err);
  }
}
