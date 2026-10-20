import type { ApiClient } from './api.ts';

/** What to answer for an old WordPress URL; `null` means the URL is not a legacy one. */
export type LegacyResult = { status: 301; location: string } | { status: 404 } | null;

export type LegacyOptions = {
  /** Legacy image redirects may only leave the site towards this origin. */
  imageBaseUrl: string;
};

const RESERVED_PREFIXES = new Set(['category', 'tag', 'page', 'admin', 'feed', 'wp-content']);
const UPLOADS_PREFIX = '/wp-content/uploads/';
const CATEGORY_TTL_MS = 60_000;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const DATE_ARCHIVE = /^\/(\d{4})(?:\/(\d{2}))?(?:\/page\/(\d+))?\/?$/;

const moved = (location: string): LegacyResult => ({ status: 301, location });
const gone: LegacyResult = { status: 404 };

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Origin of an absolute URL, or `null` when it does not parse. */
function originOf(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

async function legacyImage(
  pathname: string,
  api: ApiClient,
  options: LegacyOptions,
): Promise<LegacyResult> {
  const path = decode(pathname.slice(UPLOADS_PREFIX.length));
  const segments = path?.split('/');
  if (!segments || segments.some((part) => part === '' || part === '.' || part === '..')) {
    return gone;
  }
  if (path?.includes('\\')) return gone;
  const image = await api.legacyImage(segments.join('/'));
  if (!image) return gone;
  // Defence in depth: never redirect anywhere but the configured image host.
  const target = originOf(image.url);
  return target !== null && target === originOf(options.imageBaseUrl) ? moved(image.url) : gone;
}

async function legacyPostId(searchParams: URLSearchParams, api: ApiClient): Promise<LegacyResult> {
  const values = searchParams.getAll('p');
  const id = values[0];
  if (values.length !== 1 || id === undefined || !POSITIVE_INTEGER.test(id)) return null;
  const wpId = Number(id);
  if (!Number.isSafeInteger(wpId)) return null;
  const post = await api.getPostByWpId(wpId);
  if (!post) return gone;
  return moved(`/${encodeURIComponent(post.categorySlug)}/${encodeURIComponent(post.slug)}/`);
}

function attachmentPage(pathname: string, categories: Set<string>): LegacyResult {
  const segments = pathname.replace(/\/$/, '').split('/').slice(1);
  if (segments.length !== 3 || segments.some((part) => part === '')) return null;
  const [rawCategory = '', rawSlug = ''] = segments;
  const category = decode(rawCategory);
  if (category === null || RESERVED_PREFIXES.has(category) || !categories.has(category)) {
    return null;
  }
  return moved(`/${rawCategory}/${rawSlug}/`);
}

function dateArchive(pathname: string): LegacyResult {
  const match = DATE_ARCHIVE.exec(pathname);
  if (!match) return null;
  const [, year = '', month, page] = match;
  if (Number(year) < 1990 || Number(year) > 2099) return null;
  if (month !== undefined && (Number(month) < 1 || Number(month) > 12)) return null;
  if (page !== undefined && !POSITIVE_INTEGER.test(page)) return null;
  return moved('/');
}

/**
 * Maps an old WordPress URL to a 301 target (or a 404 for a legacy URL that no longer
 * resolves). Anything that is not a legacy URL gives `null` and is left to the normal routes.
 */
export async function resolveLegacy(
  url: URL,
  api: ApiClient,
  categories: Set<string>,
  options: LegacyOptions,
): Promise<LegacyResult> {
  const { pathname } = url;
  if (pathname.startsWith(UPLOADS_PREFIX)) return legacyImage(pathname, api, options);
  if (pathname === '/wp-sitemap.xml') return moved('/sitemap.xml');
  if (pathname === '/') return legacyPostId(url.searchParams, api);
  return attachmentPage(pathname, categories) ?? dateArchive(pathname);
}

export type CategoryCache = {
  get(): Promise<Set<string>>;
  clear(): void;
};

/**
 * Category slugs for the attachment-page check, kept for 60 s so legacy checks don't hit the
 * api on every request. If the api fails the last known set (or none) is used: the check
 * only decides whether to redirect, it must not take ordinary pages down.
 */
export function createCategoryCache(
  api: ApiClient,
  ttlMs: number = CATEGORY_TTL_MS,
  now: () => number = Date.now,
): CategoryCache {
  let cached: { slugs: Set<string>; expires: number } | undefined;
  return {
    async get() {
      if (cached && cached.expires > now()) return cached.slugs;
      try {
        const terms = await api.listCategories();
        cached = { slugs: new Set(terms.map((term) => term.slug)), expires: now() + ttlMs };
      } catch {
        cached ??= { slugs: new Set(), expires: 0 };
      }
      return cached.slugs;
    },
    clear() {
      cached = undefined;
    },
  };
}
