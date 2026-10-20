import {
  PHOTO_ID_PATTERN,
  PostInput,
  slugify,
  variantPaths,
  type Photo,
  type Post,
  type Term,
} from '@vinyl/shared';
import type { Auth } from 'firebase-admin/auth';
import { Router } from 'express';
import type { Config } from '../config.ts';
import { HttpError } from '../errors.ts';
import { requireAdmin } from '../auth.ts';
import {
  PostNotFoundError,
  SlugTakenError,
  type PostFields,
  type PostRepo,
} from '../repo/posts.ts';
import type { TermRepo } from '../repo/terms.ts';
import type { PhotoStorage } from '../storage/types.ts';
import { uploadsRouter } from './uploads.ts';

export type AdminDeps = {
  config: Config;
  auth: Auth;
  posts: PostRepo;
  categories: TermRepo;
  tags: TermRepo;
  photoStore: PhotoStorage;
  maxUploadBytes?: number;
  maxInputPixels?: number;
};

const postNotFound = () => new HttpError(404, 'not_found', 'Post not found');

type Resolved = { fields: PostFields; categories: Term[]; tags: Term[] };

function parseInput(raw: unknown): Resolved {
  const parsed = PostInput.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, 'invalid_input', 'Invalid input', { issues: parsed.error.issues });
  }
  const { categoryName, tagNames, categorySlug, tagSlugs, photos, ...rest } = parsed.data;
  const badPhoto = photos.find((photo) => !PHOTO_ID_PATTERN.test(photo.id));
  if (badPhoto) {
    throw new HttpError(400, 'invalid_photo_id', 'Photo ids may only use letters, digits, - and _');
  }
  const categories: Term[] = [];
  if (categoryName !== undefined) {
    categories.push({ slug: slugify(categoryName), name: categoryName });
  }
  const tags: Term[] = (tagNames ?? []).map((name) => ({ slug: slugify(name), name }));
  const fields: PostFields = {
    ...rest,
    categorySlug: categories[0]?.slug ?? categorySlug,
    tagSlugs: [...new Set([...tagSlugs, ...tags.map((tag) => tag.slug)])],
    photos: photos.map((photo): Photo => ({ ...photo, paths: variantPaths(photo.id) })),
  };
  return { fields, categories, tags };
}

export function adminRouter(deps: AdminDeps): Router {
  const router = Router();
  router.use(requireAdmin(deps.auth, deps.config.adminEmails));
  router.use('/uploads', uploadsRouter(deps));

  router.get('/posts', async (_req, res) => {
    res.json(await deps.posts.listAll());
  });

  router.get('/posts/:id', async (req, res) => {
    const post = await deps.posts.getById(req.params.id);
    if (!post) throw postNotFound();
    res.json(post);
  });

  router.get('/categories', async (_req, res) => {
    res.json(await deps.categories.listAll());
  });

  router.get('/tags', async (_req, res) => {
    res.json(await deps.tags.listAll());
  });

  router.post('/posts', async (req, res) => {
    const resolved = await prepare(req.body);
    try {
      const post = await deps.posts.create(resolved.fields);
      await upsertTerms(resolved);
      res.status(201).json(post);
    } catch (err) {
      throw translate(err);
    }
  });

  router.put('/posts/:id', async (req, res) => {
    const resolved = await prepare(req.body);
    let before: Post | null;
    let post: Post;
    try {
      before = await deps.posts.getById(req.params.id);
      if (!before) throw postNotFound();
      post = await deps.posts.update(req.params.id, resolved.fields);
      await upsertTerms(resolved);
    } catch (err) {
      throw translate(err);
    }
    const kept = new Set(post.photos.map((photo) => photo.id));
    await deletePhotos(before.photos.filter((photo) => !kept.has(photo.id)));
    res.json(post);
  });

  router.delete('/posts/:id', async (req, res) => {
    const deleted = await deps.posts.delete(req.params.id);
    if (!deleted) throw postNotFound();
    await deletePhotos(deleted.photos);
    res.status(204).end();
  });

  /** Parses the body and checks that a bare categorySlug refers to a known category. */
  async function prepare(raw: unknown): Promise<Resolved> {
    const resolved = parseInput(raw);
    if (resolved.categories.length === 0) {
      const known = await deps.categories.get(resolved.fields.categorySlug);
      if (!known) {
        throw new HttpError(400, 'unknown_category', 'Unknown category');
      }
    }
    return resolved;
  }

  async function upsertTerms(resolved: Resolved): Promise<void> {
    await Promise.all([
      deps.categories.upsert(resolved.categories),
      deps.tags.upsert(resolved.tags),
    ]);
  }

  /**
   * Storage cleanup runs after the DB write; failures leave orphans rather than failing the request.
   * Photos another post still references are kept.
   */
  async function deletePhotos(candidates: Photo[]): Promise<void> {
    if (candidates.length === 0) return;
    const inUse = await deps.posts.photoIdsInUse();
    const photos = candidates.filter((photo) => !inUse.has(photo.id));
    const results = await Promise.allSettled(
      photos.map((photo) => deps.photoStore.deletePhoto(photo.id)),
    );
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        console.error(`Failed to delete photo ${photos[index]?.id}`, result.reason);
      }
    });
  }

  return router;
}

function translate(err: unknown): unknown {
  if (err instanceof SlugTakenError) {
    return new HttpError(409, 'slug_taken', 'Slug already in use');
  }
  if (err instanceof PostNotFoundError) {
    return postNotFound();
  }
  return err;
}
