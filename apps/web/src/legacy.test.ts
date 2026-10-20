import { describe, expect, it, vi } from 'vite-plus/test';
import type { ApiClient } from './api.ts';
import { createCategoryCache, resolveLegacy } from './legacy.ts';

const options = { imageBaseUrl: 'http://images.test/bucket' };
const categories = new Set(['vinyl']);

function apiWith(overrides: Partial<ApiClient> = {}): ApiClient {
  return {
    listPosts: async () => ({ items: [], page: 1, totalPages: 1 }),
    getPostBySlug: async () => null,
    getPostByWpId: async () => null,
    listCategories: async () => [{ slug: 'vinyl', name: 'Vinyl' }],
    listTags: async () => [],
    legacyImage: async () => null,
    ...overrides,
  };
}

const resolve = (path: string, api = apiWith()) =>
  resolveLegacy(new URL(path, 'http://x'), api, categories, options);

describe('resolveLegacy', () => {
  it('passes the decoded upload path to the api', async () => {
    const legacyImage = vi.fn(async () => ({ url: 'http://images.test/bucket/p/w300.jpg' }));
    const result = await resolve(
      '/wp-content/uploads/2026/01/DSCF2087-150x150.jpg',
      apiWith({ legacyImage }),
    );
    expect(legacyImage).toHaveBeenCalledWith('2026/01/DSCF2087-150x150.jpg');
    expect(result).toEqual({ status: 301, location: 'http://images.test/bucket/p/w300.jpg' });
  });

  it('never lets traversal reach the api', async () => {
    const legacyImage = vi.fn(async () => ({ url: 'http://images.test/bucket/x.jpg' }));
    // The URL parser already resolves `..` out of the uploads prefix.
    for (const path of ['/wp-content/uploads/../x.jpg', '/wp-content/uploads/%2e%2e/x.jpg']) {
      expect(await resolve(path, apiWith({ legacyImage }))).toBeNull();
    }
    expect(await resolve('/wp-content/uploads/a/%5C/x.jpg', apiWith({ legacyImage }))).toEqual({
      status: 404,
    });
    expect(await resolve('/wp-content/uploads/a//x.jpg', apiWith({ legacyImage }))).toEqual({
      status: 404,
    });
    expect(legacyImage).not.toHaveBeenCalled();
  });

  it('refuses an image url on another origin', async () => {
    const api = apiWith({ legacyImage: async () => ({ url: 'http://evil.test/bucket/x.jpg' }) });
    expect(await resolve('/wp-content/uploads/a/b.jpg', api)).toEqual({ status: 404 });
  });

  it('only treats exactly one positive integer p on / as a post id', async () => {
    const getPostByWpId = vi.fn(async () => ({ categorySlug: 'vinyl', slug: 'a b' }));
    const api = apiWith({ getPostByWpId });
    expect(await resolve('/?p=5', api)).toEqual({ status: 301, location: '/vinyl/a%20b/' });
    for (const query of ['?p=abc', '?p=0', '?p=-3', '?p=1.5', '?p=1&p=2', '?q=1']) {
      expect(await resolve(`/${query}`, api)).toBeNull();
    }
    expect(await resolve('/page/2/?p=5', api)).toBeNull();
    expect(getPostByWpId).toHaveBeenCalledTimes(1);
  });

  it('404s an unknown post id', async () => {
    expect(await resolve('/?p=77')).toEqual({ status: 404 });
  });

  it('redirects attachment pages only for a known category and 3 segments', async () => {
    expect(await resolve('/vinyl/a/b/')).toEqual({ status: 301, location: '/vinyl/a/' });
    expect(await resolve('/vinyl/a/b')).toEqual({ status: 301, location: '/vinyl/a/' });
    expect(await resolve('/nope/a/b/')).toBeNull();
    expect(await resolve('/vinyl/a/b/c/')).toBeNull();
    expect(await resolve('/vinyl/a//')).toBeNull();
    for (const reserved of ['category', 'tag', 'page', 'admin', 'feed', 'wp-content']) {
      const result = await resolveLegacy(
        new URL(`/${reserved}/a/b/`, 'http://x'),
        apiWith(),
        new Set([reserved]),
        options,
      );
      expect(result).toBeNull();
    }
  });

  it('redirects date archives within range only', async () => {
    for (const path of ['/1990/', '/2099/12/', '/2021/05/page/3/', '/2021/page/2/']) {
      expect(await resolve(path)).toEqual({ status: 301, location: '/' });
    }
    for (const path of [
      '/1989/',
      '/2100/',
      '/2021/00/',
      '/2021/13/',
      '/2021/05/page/0/',
      '/202/',
    ]) {
      expect(await resolve(path)).toBeNull();
    }
  });

  it('leaves ordinary URLs alone', async () => {
    for (const path of ['/', '/vinyl/some-post/', '/category/vinyl/', '/feed/']) {
      expect(await resolve(path)).toBeNull();
    }
  });
});

describe('createCategoryCache', () => {
  it('caches for the ttl, and can be cleared', async () => {
    let time = 0;
    const listCategories = vi.fn(async () => [{ slug: 'vinyl', name: 'Vinyl' }]);
    const cache = createCategoryCache(apiWith({ listCategories }), 60_000, () => time);
    expect((await cache.get()).has('vinyl')).toBe(true);
    time = 59_999;
    await cache.get();
    expect(listCategories).toHaveBeenCalledTimes(1);
    time = 60_000;
    await cache.get();
    expect(listCategories).toHaveBeenCalledTimes(2);
    cache.clear();
    await cache.get();
    expect(listCategories).toHaveBeenCalledTimes(3);
  });

  it('keeps the last set when the api fails', async () => {
    let time = 0;
    let fail = false;
    const cache = createCategoryCache(
      apiWith({
        listCategories: async () => {
          if (fail) throw new Error('down');
          return [{ slug: 'vinyl', name: 'Vinyl' }];
        },
      }),
      10,
      () => time,
    );
    await cache.get();
    fail = true;
    time = 100;
    expect((await cache.get()).has('vinyl')).toBe(true);
  });
});
