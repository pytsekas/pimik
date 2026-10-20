import type { Page, Post, Term } from '@vinyl/shared';

export type ListPostsQuery = { page: number; category?: string; tag?: string };

export type ApiClient = {
  /** Throws `NotFoundError` when the filter matches nothing or the page is out of range. */
  listPosts(query: ListPostsQuery): Promise<Page<Post>>;
  getPostBySlug(slug: string): Promise<Post | null>;
  getPostByWpId(wpId: number): Promise<{ categorySlug: string; slug: string } | null>;
  listCategories(): Promise<Term[]>;
  listTags(): Promise<Term[]>;
  legacyImage(path: string): Promise<{ url: string } | null>;
};

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/**
 * The server and the SSR bundle load this module separately, so `instanceof`
 * cannot be trusted across that boundary; the error name can.
 */
export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof Error && error.name === 'NotFoundError';
}

const TIMEOUT_MS = 10_000;

/** `baseUrl` is the api origin on the server and the page origin in the browser (proxied `/v1`). */
export function createApiClient(baseUrl: string, fetchImpl: typeof fetch = fetch): ApiClient {
  async function get<T>(path: string): Promise<T> {
    const res = await fetchImpl(`${baseUrl}/v1${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) throw new NotFoundError(`Not found: ${path}`);
    if (!res.ok) throw new ApiError(res.status, `GET ${path} failed with ${res.status}`);
    return (await res.json()) as T;
  }

  async function getOrNull<T>(path: string): Promise<T | null> {
    try {
      return await get<T>(path);
    } catch (error) {
      if (isNotFoundError(error)) return null;
      throw error;
    }
  }

  return {
    listPosts({ page, category, tag }) {
      const params = new URLSearchParams({ page: String(page) });
      if (category !== undefined) params.set('category', category);
      if (tag !== undefined) params.set('tag', tag);
      return get(`/posts?${params}`);
    },
    getPostBySlug: (slug) => getOrNull(`/posts/by-slug/${encodeURIComponent(slug)}`),
    getPostByWpId: (wpId) => getOrNull(`/posts/by-wp-id/${wpId}`),
    listCategories: () => get('/categories'),
    listTags: () => get('/tags'),
    legacyImage: (path) =>
      getOrNull(`/legacy-images/${path.split('/').map(encodeURIComponent).join('/')}`),
  };
}
