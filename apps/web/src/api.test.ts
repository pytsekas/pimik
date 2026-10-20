import { describe, expect, it } from 'vite-plus/test';
import { ApiError, createApiClient, isNotFoundError } from './api.ts';

function fakeFetch(status: number, body: unknown, seen: string[]): typeof fetch {
  return async (input) => {
    seen.push(input instanceof Request ? input.url : input.toString());
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
}

describe('createApiClient', () => {
  it('builds list queries from the given filters', async () => {
    const seen: string[] = [];
    const api = createApiClient('http://api.test', fakeFetch(200, { items: [] }, seen));
    await api.listPosts({ page: 2, category: 'vinyl' });
    await api.listPosts({ page: 1, tag: 'rock & roll' });
    expect(seen).toEqual([
      'http://api.test/v1/posts?page=2&category=vinyl',
      'http://api.test/v1/posts?page=1&tag=rock+%26+roll',
    ]);
  });

  it('encodes slugs and legacy image path segments', async () => {
    const seen: string[] = [];
    const api = createApiClient('http://api.test', fakeFetch(200, {}, seen));
    await api.getPostBySlug('david-bowie-★');
    await api.legacyImage('2019/01/a b.jpg');
    expect(seen).toEqual([
      'http://api.test/v1/posts/by-slug/david-bowie-%E2%98%85',
      'http://api.test/v1/legacy-images/2019/01/a%20b.jpg',
    ]);
  });

  it('returns null for a missing item', async () => {
    const api = createApiClient('http://api.test', fakeFetch(404, { error: 'not_found' }, []));
    expect(await api.getPostBySlug('nope')).toBeNull();
    expect(await api.getPostByWpId(1)).toBeNull();
  });

  it('throws NotFoundError for a list that does not exist', async () => {
    const api = createApiClient('http://api.test', fakeFetch(404, { error: 'not_found' }, []));
    const error: unknown = await api.listPosts({ page: 9 }).catch((caught: unknown) => caught);
    expect(isNotFoundError(error)).toBe(true);
  });

  it('throws ApiError for other failures', async () => {
    const api = createApiClient('http://api.test', fakeFetch(500, { error: 'internal' }, []));
    await expect(api.getPostBySlug('x')).rejects.toBeInstanceOf(ApiError);
    await expect(api.listCategories()).rejects.toMatchObject({ status: 500 });
  });
});
