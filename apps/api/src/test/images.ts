import sharp from 'sharp';

/** A flat grey JPEG of the given size; EXIF orientation can be set to test auto-rotation. */
export async function jpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: '#888888' } }).jpeg();
  return (orientation === undefined ? image : image.withMetadata({ orientation })).toBuffer();
}
