import { PHOTO_ID_PATTERN, variantPaths, type Photo } from '@vinyl/shared';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { HttpError } from '../errors.ts';
import { sanitizeOriginal } from '../images/sanitizeOriginal.ts';
import { InvalidImageError, makeVariants } from '../images/variants.ts';
import type { PhotoStorage, UploadTarget } from '../storage/types.ts';

export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;
const MAX_FILES = 50;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const UploadRequest = z.object({
  files: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        contentType: z.string(),
        size: z.number().int().min(0),
      }),
    )
    .min(1)
    .max(MAX_FILES),
});

export type UploadResult =
  | { photoId: string; objectPath: string; upload: UploadTarget }
  | { fileName: string; error: 'unsupported_type' | 'too_large' };

export type UploadsDeps = {
  photoStore: PhotoStorage;
  maxUploadBytes?: number;
  maxInputPixels?: number;
};

/** Routes for direct-to-bucket uploads; the caller mounts them behind requireAdmin. */
export function uploadsRouter(deps: UploadsDeps): Router {
  const router = Router();
  const maxBytes = deps.maxUploadBytes ?? MAX_UPLOAD_BYTES;
  const store = deps.photoStore;

  router.post('/', async (req, res) => {
    const parsed = UploadRequest.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'invalid_input', 'Invalid input', { issues: parsed.error.issues });
    }
    const results = await Promise.all(
      parsed.data.files.map(async (file): Promise<UploadResult> => {
        if (!ALLOWED_TYPES.has(file.contentType)) {
          return { fileName: file.fileName, error: 'unsupported_type' };
        }
        if (file.size > maxBytes) return { fileName: file.fileName, error: 'too_large' };
        const photoId = randomUUID().replaceAll('-', '');
        const objectPath = variantPaths(photoId).original;
        const upload = await store.createUploadTarget(objectPath, file.contentType);
        return { photoId, objectPath, upload };
      }),
    );
    res.json({ files: results });
  });

  router.post('/:photoId/complete', async (req, res) => {
    const { photoId } = req.params;
    if (!PHOTO_ID_PATTERN.test(photoId)) {
      throw new HttpError(400, 'invalid_photo_id', 'Invalid photo id');
    }
    const paths = variantPaths(photoId);
    const size = await store.size(paths.original);
    if (size === null) throw new HttpError(404, 'not_uploaded', 'Original has not been uploaded');
    if (size > maxBytes) {
      await store.deleteObject(paths.original);
      throw new HttpError(422, 'too_large', 'File is too large');
    }
    const processed = await prepare(await store.read(paths.original), paths.original);
    await Promise.all([
      store.write(paths.original, processed.original.data, processed.original.contentType),
      store.write(paths.w1000, processed.variants.w1000, 'image/jpeg'),
      store.write(paths.w300, processed.variants.w300, 'image/jpeg'),
    ]);
    const { width, height } = processed.original;
    const photo: Photo = { id: photoId, width, height, paths };
    res.json(photo);
  });

  /** Strips metadata and builds variants; a bad image is deleted, any other failure becomes a 500. */
  async function prepare(raw: Buffer, path: string) {
    const limits = { limitInputPixels: deps.maxInputPixels };
    try {
      const original = await sanitizeOriginal(raw, limits);
      const variants = await makeVariants(original.data, limits);
      return { original, variants };
    } catch (err) {
      if (!(err instanceof InvalidImageError)) throw err;
      console.error(`Rejected upload ${path}`, err.message);
      await store.deleteObject(path);
      throw new HttpError(422, 'not_an_image', 'File is not a decodable image');
    }
  }

  return router;
}
