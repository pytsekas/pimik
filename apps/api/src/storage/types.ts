/** The part of the photo store that post routes depend on. */
export type PhotoDeleter = {
  deletePhoto(photoId: string): Promise<void>;
};
