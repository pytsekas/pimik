/** The part of the photo store that post routes depend on. */
export type PhotoDeleter = {
  deletePhoto(photoId: string): Promise<void>;
};

export type UploadTarget = {
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
};

/**
 * Everything the upload routes need from object storage. Browsers upload to a private staging
 * bucket (the `*Upload` methods); only sanitized photos are written to the public photo bucket.
 */
export type PhotoStorage = PhotoDeleter & {
  createUploadTarget(uploadPath: string, contentType: string): Promise<UploadTarget>;
  /** Size in bytes of the staged upload, or null when it does not exist. */
  uploadSize(uploadPath: string): Promise<number | null>;
  readUpload(uploadPath: string): Promise<Buffer>;
  deleteUpload(uploadPath: string): Promise<void>;
  /** Writes a public object to the photo bucket. */
  write(path: string, data: Buffer, contentType: string): Promise<void>;
};
