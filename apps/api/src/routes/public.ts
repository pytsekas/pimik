import { parseWpImagePath, pickVariant, variantPaths } from '@vinyl/shared';
import { Router, type RequestHandler } from 'express';
import type { Config } from '../config.ts';
import { HttpError } from '../errors.ts';
import type { PhotoIndexRepo } from '../repo/photoIndex.ts';
import type { PostRepo } from '../repo/posts.ts';
import type { TermRepo } from '../repo/terms.ts';

export type PublicDeps = {
  config: Config;
  posts: PostRepo;
  categories: TermRepo;
  tags: TermRepo;
  photoIndex: PhotoIndexRepo;
};

const notFound = () => new HttpError(404, 'not_found', 'Not found');

/** Wraps an async handler so rejections reach the error middleware. */
function route(handler: (...args: Parameters<RequestHandler>) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

function singleString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parsePage(value: unknown): number {
  if (value === undefined) return 1;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || Number(value) < 1) {
    throw new HttpError(400, 'invalid_page', 'page must be an integer of at least 1');
  }
  return Number(value);
}

export function publicRouter(deps: PublicDeps): Router {
  const router = Router();

  router.get(
    '/posts',
    route(async (req, res) => {
      const page = parsePage(req.query.page);
      const category = singleString(req.query.category);
      const tag = singleString(req.query.tag);
      const result = await deps.posts.listPublished({ page, category, tag });
      const filtered = category !== undefined || tag !== undefined;
      if (
        (filtered && result.totalPages === 0) ||
        (result.totalPages > 0 && page > result.totalPages)
      ) {
        throw notFound();
      }
      res.json(result);
    }),
  );

  router.get(
    '/posts/by-slug/:slug',
    route(async (req, res) => {
      const post = await deps.posts.getBySlug(String(req.params.slug));
      if (!post || post.status !== 'published') throw notFound();
      res.json(post);
    }),
  );

  router.get(
    '/posts/by-wp-id/:wpId',
    route(async (req, res) => {
      const raw = String(req.params.wpId);
      if (!/^\d+$/.test(raw)) throw notFound();
      const post = await deps.posts.getByWpId(Number(raw));
      if (!post || post.status !== 'published') throw notFound();
      res.json({ categorySlug: post.categorySlug, slug: post.slug });
    }),
  );

  router.get(
    '/categories',
    route(async (_req, res) => {
      res.json(await deps.categories.listNonEmpty());
    }),
  );

  router.get(
    '/tags',
    route(async (_req, res) => {
      res.json(await deps.tags.listNonEmpty());
    }),
  );

  router.get(
    '/legacy-images/*path',
    route(async (req, res) => {
      const segments = req.params.path as unknown as string[];
      const { basePath, requestedWidth } = parseWpImagePath(segments.join('/'));
      const entry = await deps.photoIndex.get(basePath);
      if (!entry) throw notFound();
      const variant = variantPaths(entry.photoId)[pickVariant(requestedWidth)];
      res.json({ url: `${deps.config.imageBaseUrl}/${variant}` });
    }),
  );

  return router;
}
