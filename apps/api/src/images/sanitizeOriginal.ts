import sharp, { type Sharp } from 'sharp';
import { stripJpegMetadata } from './stripMetadata.ts';
import {
  InvalidImageError,
  asInvalidImage,
  limitOf,
  orientedSize,
  type ImageLimits,
} from './variants.ts';

const REENCODE_QUALITY = 92;

export type SanitizedOriginal = {
  data: Buffer;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  width: number;
  height: number;
};

/**
 * Prepares an uploaded original for public serving without camera metadata
 * (EXIF/GPS). Upright JPEGs are stripped losslessly; rotated JPEGs, PNGs and
 * WebPs are re-encoded once in the same format, upright, keeping the ICC profile.
 */
export async function sanitizeOriginal(
  input: Buffer,
  limits: ImageLimits = {},
): Promise<SanitizedOriginal> {
  try {
    const limitInputPixels = limitOf(limits);
    const meta = await sharp(input, { limitInputPixels }).metadata();
    const size = orientedSize(meta);
    if (size.width * size.height > limitInputPixels) {
      throw new InvalidImageError('Input image exceeds pixel limit');
    }
    if (meta.format === 'jpeg' && (meta.orientation ?? 1) === 1) {
      return { data: stripJpegMetadata(input), contentType: 'image/jpeg', ...size };
    }
    const pipeline = sharp(input, { limitInputPixels }).rotate().keepIccProfile();
    switch (meta.format) {
      case 'jpeg':
        return reencode(pipeline.jpeg({ quality: REENCODE_QUALITY }), 'image/jpeg');
      case 'webp':
        return reencode(pipeline.webp({ quality: REENCODE_QUALITY }), 'image/webp');
      case 'png':
        return reencode(pipeline.png(), 'image/png');
      default:
        throw new InvalidImageError(`Unsupported image format: ${meta.format}`);
    }
  } catch (err) {
    throw asInvalidImage(err);
  }
}

async function reencode(
  pipeline: Sharp,
  contentType: SanitizedOriginal['contentType'],
): Promise<SanitizedOriginal> {
  const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
  return { data, contentType, width: info.width, height: info.height };
}
