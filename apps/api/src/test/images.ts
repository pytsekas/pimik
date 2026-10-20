import sharp from 'sharp';

/** A flat grey JPEG of the given size; EXIF orientation can be set to test auto-rotation. */
export async function jpeg(width: number, height: number, orientation?: number): Promise<Buffer> {
  const image = sharp({ create: { width, height, channels: 3, background: '#888888' } }).jpeg();
  return (orientation === undefined ? image : image.withMetadata({ orientation })).toBuffer();
}

/** A JPEG carrying camera EXIF including GPS coordinates. */
export async function jpegWithGps(
  width: number,
  height: number,
  orientation?: number,
): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: '#888888' } })
    .jpeg()
    .withMetadata({
      ...(orientation === undefined ? {} : { orientation }),
      exif: {
        IFD0: { Make: 'TestCam' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '59/1 25/1 0/1' },
      },
    })
    .toBuffer();
}
