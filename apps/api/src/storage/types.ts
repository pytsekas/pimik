/** The part of the photo store that post routes depend on. */
export type PhotoDeleter = {
  deletePhoto(photoId: string): Promise<void>;
};

export type UploadTarget = {
  url: string;
  method: 'PUT' | 'POST';
  headers: Record<string, string>;
};

/** Everything the upload routes need from object storage. */
export type PhotoStorage = PhotoDeleter & {
  createUploadTarget(objectPath: string, contentType: string): Promise<UploadTarget>;
  /** Size in bytes of the stored object, or null when it does not exist. */
  size(path: string): Promise<number | null>;
  read(path: string): Promise<Buffer>;
  write(path: string, data: Buffer, contentType: string): Promise<void>;
  /** Applies the long-lived cache header to an object uploaded by the browser. */
  markCacheable(path: string): Promise<void>;
  deleteObject(path: string): Promise<void>;
};
