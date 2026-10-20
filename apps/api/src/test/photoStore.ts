import type { PhotoStorage } from '../storage/types.ts';

const unexpected = (name: string) => async (): Promise<never> => {
  throw new Error(`unexpected PhotoStorage.${name} call`);
};

/** A PhotoStorage whose methods throw unless overridden; for tests that do not touch uploads. */
export function stubPhotoStore(overrides: Partial<PhotoStorage> = {}): PhotoStorage {
  return {
    createUploadTarget: unexpected('createUploadTarget'),
    size: unexpected('size'),
    read: unexpected('read'),
    write: unexpected('write'),
    deleteObject: unexpected('deleteObject'),
    deletePhoto: async () => {},
    ...overrides,
  };
}
