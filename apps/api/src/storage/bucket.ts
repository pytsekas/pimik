import { Storage, type Bucket } from '@google-cloud/storage';
import type { Config } from '../config.ts';
import { silenceStorageStreamWarning } from './quietStreamWarnings.ts';
import type { PhotoStorage, UploadTarget } from './types.ts';

export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
silenceStorageStreamWarning();

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

const EMULATOR_VARIABLE = 'STORAGE_EMULATOR_HOST';

/**
 * The client also reads STORAGE_EMULATOR_HOST itself and then uses it as the full base URL,
 * without /storage/v1, which breaks fake-gcs-server when `apiEndpoint` is given too. The
 * endpoint comes from our config, so the variable is hidden while the client is constructed.
 */
function createStorage(config: Config): Storage {
  if (!config.storageEmulatorHost) return new Storage({ projectId: config.projectId });
  const inherited = process.env[EMULATOR_VARIABLE];
  delete process.env[EMULATOR_VARIABLE];
  try {
    return new Storage({ projectId: config.projectId, apiEndpoint: config.storageEmulatorHost });
  } finally {
    if (inherited !== undefined) process.env[EMULATOR_VARIABLE] = inherited;
  }
}

/** Photo objects in GCS, or in fake-gcs-server when STORAGE_EMULATOR_HOST is set. */
export class PhotoStore implements PhotoStorage {
  private readonly config: Config;
  private readonly photos: Bucket;
  private readonly uploads: Bucket;

  constructor(config: Config) {
    this.config = config;
    const storage = createStorage(config);
    this.photos = storage.bucket(config.bucket);
    this.uploads = storage.bucket(config.uploadBucket);
  }

  /** Creates both buckets when missing; only meant for the local emulator. */
  async ensureBucket(): Promise<void> {
    for (const bucket of [this.photos, this.uploads]) {
      const [exists] = await bucket.exists();
      if (!exists) await bucket.create();
    }
  }

  async createUploadTarget(uploadPath: string, contentType: string): Promise<UploadTarget> {
    const headers = { 'Content-Type': contentType };
    const host = this.config.storageEmulatorHost;
    if (host) {
      const name = encodeURIComponent(uploadPath);
      const url = `${host}/upload/storage/v1/b/${this.config.uploadBucket}/o?uploadType=media&name=${name}`;
      return { url, method: 'POST', headers };
    }
    const [url] = await this.uploads.file(uploadPath).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + SIGNED_URL_TTL_MS,
      contentType,
    });
    return { url, method: 'PUT', headers };
  }

  async uploadSize(uploadPath: string): Promise<number | null> {
    const file = this.uploads.file(uploadPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [metadata] = await file.getMetadata();
    return Number(metadata.size);
  }

  async readUpload(uploadPath: string): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of this.uploads.file(uploadPath).createReadStream()) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }

  async deleteUpload(uploadPath: string): Promise<void> {
    await this.uploads.file(uploadPath).delete({ ignoreNotFound: true });
  }

  async write(path: string, data: Buffer, contentType: string): Promise<void> {
    await this.photos.file(path).save(data, {
      resumable: false,
      metadata: { contentType, cacheControl: CACHE_CONTROL },
    });
  }

  async deletePhoto(photoId: string): Promise<void> {
    await this.photos.deleteFiles({ prefix: `photos/${photoId}/`, force: true });
  }

  publicUrl(path: string): string {
    return `${this.config.imageBaseUrl}/${path}`;
  }
}
