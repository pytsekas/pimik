import { randomUUID } from 'node:crypto';
import { variantPaths, type Photo } from '@vinyl/shared';
import { loadConfig } from '@vinyl/api/config';
import { initFirebase } from '@vinyl/api/firebase';
import { sanitizeOriginal } from '@vinyl/api/images/sanitizeOriginal';
import { makeVariants } from '@vinyl/api/images/variants';
import { PhotoIndexRepo } from '@vinyl/api/repo/photoIndex';
import { PostRepo, SlugTakenError, type PostFields } from '@vinyl/api/repo/posts';
import { TermRepo } from '@vinyl/api/repo/terms';
import { PhotoStore } from '@vinyl/api/storage/bucket';
import type { PhotoStorage } from '@vinyl/api/storage/types';
import {
  parseWpPost,
  termsOf,
  wpPathOf,
  type ImportedPost,
  type WpPost,
  type WpTerm,
} from './parse.ts';

const PER_PAGE = 100;
const IMAGE_CONCURRENCY = 4;
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 30_000;

export type ImportDeps = {
  posts: PostRepo;
  categories: TermRepo;
  tags: TermRepo;
  photoIndex: PhotoIndexRepo;
  store: Pick<PhotoStorage, 'write'>;
  log?: (message: string) => void;
  /** Base delay between download attempts; doubles each retry. */
  backoffMs?: number;
};

export type ImportOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  deps: ImportDeps;
};

export type ImportStats = {
  /** Posts created or updated. */
  posts: number;
  /** Photos downloaded and stored by this run; photos reused from earlier runs are not counted. */
  photos: number;
  /** Posts skipped because their slug belongs to another post. */
  skipped: number;
  /** Posts imported without any photo. */
  noPhotos: number;
  /** Images that could not be downloaded or decoded. */
  failedImages: number;
};

type Context = {
  deps: ImportDeps;
  fetchImpl: typeof fetch;
  log: (message: string) => void;
  /** Photos already imported, by wpPath, from earlier runs and from this one. */
  known: Map<string, Photo>;
  stats: ImportStats;
};

export async function runImport(options: ImportOptions): Promise<ImportStats> {
  const { baseUrl = 'https://vinyl.rehab', fetchImpl = fetch, deps } = options;
  const [wpPosts, wpCategories, wpTags] = await Promise.all([
    fetchAll<WpPost>(fetchImpl, baseUrl, 'posts'),
    fetchAll<WpTerm>(fetchImpl, baseUrl, 'categories'),
    fetchAll<WpTerm>(fetchImpl, baseUrl, 'tags'),
  ]);
  const categories = termsOf(wpCategories);
  const tags = termsOf(wpTags);
  await Promise.all([
    deps.categories.upsert([...categories.values()]),
    deps.tags.upsert([...tags.values()]),
  ]);

  const stats: ImportStats = { posts: 0, photos: 0, skipped: 0, noPhotos: 0, failedImages: 0 };
  const known = new Map<string, Photo>();
  for (const post of await deps.posts.listAll()) {
    for (const photo of post.photos) {
      if (photo.wpPath) known.set(photo.wpPath, photo);
    }
  }
  const ctx: Context = { deps, fetchImpl, log: deps.log ?? (() => {}), known, stats };
  for (const wp of wpPosts) {
    await importPost(ctx, parseWpPost(wp, categories, tags));
  }
  return stats;
}

async function importPost(ctx: Context, post: ImportedPost): Promise<void> {
  const { deps, stats, log } = ctx;
  const existing = await deps.posts.getByWpId(post.wpId);
  const imported = await mapLimit(post.imageUrls, IMAGE_CONCURRENCY, (url) =>
    importImage(ctx, url),
  );
  const wpPhotos = imported.filter((photo): photo is Photo => photo !== null);
  const adminPhotos = existing?.photos.filter((photo) => !photo.wpPath) ?? [];
  const photos = [...wpPhotos, ...adminPhotos];

  const fields: PostFields = {
    slug: post.slug,
    title: post.title,
    categorySlug: post.categorySlug,
    tagSlugs: post.tagSlugs,
    publishedAt: post.publishedAt,
    status: 'published',
    photos,
    wpId: post.wpId,
  };
  if (post.discogsUrl) fields.discogsUrl = post.discogsUrl;
  if (post.text) fields.text = post.text;

  try {
    await (existing ? deps.posts.update(existing.id, fields) : deps.posts.create(fields));
  } catch (err) {
    if (!(err instanceof SlugTakenError)) throw err;
    stats.skipped += 1;
    log(`skipped wp ${post.wpId}: slug already in use: ${post.slug}`);
    return;
  }
  stats.posts += 1;
  if (photos.length === 0) {
    stats.noPhotos += 1;
    log(`wp ${post.wpId} (${post.slug}) has no photos`);
  }
}

/** Returns the already imported photo for the URL, or downloads and stores it; null on failure. */
async function importImage(ctx: Context, url: string): Promise<Photo | null> {
  const wpPath = wpPathOf(url);
  if (wpPath === null) {
    ctx.log(`ignored image outside wp-content/uploads: ${url}`);
    return null;
  }
  const cached = ctx.known.get(wpPath);
  if (cached) return cached;
  try {
    const photo = await storePhoto(ctx, url, wpPath);
    ctx.known.set(wpPath, photo);
    ctx.stats.photos += 1;
    return photo;
  } catch (err) {
    ctx.stats.failedImages += 1;
    ctx.log(`image failed ${url}: ${messageOf(err)}`);
    return null;
  }
}

async function storePhoto(ctx: Context, url: string, wpPath: string): Promise<Photo> {
  const { store, photoIndex } = ctx.deps;
  const original = await sanitizeOriginal(await download(ctx, url));
  const variants = await makeVariants(original.data);
  const id = randomUUID().replaceAll('-', '');
  const paths = variantPaths(id);
  await Promise.all([
    store.write(paths.original, original.data, original.contentType),
    store.write(paths.w1000, variants.w1000, 'image/jpeg'),
    store.write(paths.w300, variants.w300, 'image/jpeg'),
  ]);
  try {
    await photoIndex.put(wpPath, id);
  } catch (err) {
    ctx.log(`legacy index skipped for ${wpPath}: ${messageOf(err)}`);
  }
  return { id, width: original.width, height: original.height, paths, wpPath };
}

async function download(ctx: Context, url: string): Promise<Buffer> {
  const backoff = ctx.deps.backoffMs ?? 500;
  let lastError: unknown;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const res = await ctx.fetchImpl(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      if (attempt < DOWNLOAD_ATTEMPTS) await sleep(backoff * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function fetchAll<T>(
  fetchImpl: typeof fetch,
  baseUrl: string,
  resource: string,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const url = `${baseUrl}/wp-json/wp/v2/${resource}?per_page=${PER_PAGE}&page=${page}`;
    const res = await fetchImpl(url);
    if (!res.ok) throw new Error(`WordPress ${resource} page ${page} failed: HTTP ${res.status}`);
    const batch = (await res.json()) as T[];
    items.push(...batch);
    const totalPages = Number(res.headers.get('x-wp-totalpages'));
    const last = totalPages > 0 ? page >= totalPages : batch.length < PER_PAGE;
    if (last) return items;
  }
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  // @google-cloud/storage also reads this variable and then drops /storage/v1 from the
  // endpoint it was given explicitly, so bucket calls 404 when both are set.
  delete process.env.STORAGE_EMULATOR_HOST;
  const { db } = initFirebase(config);
  const store = new PhotoStore(config);
  if (config.storageEmulatorHost) await store.ensureBucket();
  const stats = await runImport({
    baseUrl: process.env.WP_BASE_URL ?? 'https://vinyl.rehab',
    deps: {
      posts: new PostRepo(db),
      categories: new TermRepo(db, 'categories'),
      tags: new TermRepo(db, 'tags'),
      photoIndex: new PhotoIndexRepo(db),
      store,
      log: (message) => console.log(message),
    },
  });
  console.log(JSON.stringify(stats));
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
