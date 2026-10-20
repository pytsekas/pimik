import { createServer, get, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Page, Post } from '@vinyl/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';
import { NotFoundError, type ApiClient } from './src/api.ts';
import { createWebServer, type WebServer } from './server.ts';

const XSS_TITLE = '</script><script>alert(1)';

function post(overrides: Partial<Post>): Post {
  return {
    id: 'id',
    slug: 'slug',
    title: 'Title',
    categorySlug: 'vinyl',
    tagSlugs: [],
    publishedAt: '2024-01-01',
    status: 'published',
    photos: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const posts = [
  post({ id: 'a', slug: 'david-bowie-★', title: 'david bowie – ★', tagSlugs: ['bowie'] }),
  post({ id: 'b', slug: 'xss', title: XSS_TITLE }),
  post({
    id: 'd',
    slug: 'with-photo',
    title: 'With Photo',
    photos: [
      {
        id: 'x',
        width: 2000,
        height: 1500,
        paths: {
          original: 'photos/x/original.jpg',
          w1000: 'photos/x/w1000.jpg',
          w300: 'photos/x/w300.jpg',
        },
      },
    ],
  }),
  post({ id: 'c', slug: 'drone', title: 'Ambient Drone', tagSlugs: ['ambient'] }),
];

const fakeApi: ApiClient = {
  async listPosts({ page, category, tag }) {
    if (page > 1 || (category !== undefined && category !== 'vinyl')) throw new NotFoundError();
    const items = tag ? posts.filter((candidate) => candidate.tagSlugs.includes(tag)) : posts;
    if (items.length === 0) throw new NotFoundError();
    return { items, page, totalPages: 1 } satisfies Page<Post>;
  },
  async getPostBySlug(slug) {
    return posts.find((candidate) => candidate.slug === slug) ?? null;
  },
  async getPostByWpId(wpId) {
    return wpId === 123 ? { categorySlug: 'vinyl', slug: 'some-slug' } : null;
  },
  async listCategories() {
    return [
      { slug: 'vinyl', name: 'Vinyl', count: 4 },
      { slug: 'empty', name: 'Empty', count: 0 },
    ];
  },
  async listTags() {
    return [{ slug: 'ambient', name: 'Ambient' }];
  },
  async legacyImage(path) {
    if (path === '2026/01/DSCF2087-768x768.jpg') {
      return { url: 'http://images.test/bucket/photos/p1/w1000.jpg' };
    }
    if (path === '2026/01/evil.jpg') return { url: 'http://evil.test/x.jpg' };
    return null;
  },
};

let upstream: Server;
const upstreamRequests: string[] = [];
let web: WebServer;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    upstreamRequests.push(req.url ?? '');
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/v1/categories') {
      res.end(JSON.stringify(['x'.repeat(6 * 1024 * 1024)]));
      return;
    }
    res.end(JSON.stringify({ items: [], page: 2, totalPages: 0 }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, resolve));
  const { port } = upstream.address() as AddressInfo;
  web = await createWebServer({
    apiUrl: `http://127.0.0.1:${port}`,
    imageBaseUrl: 'http://images.test/bucket',
    siteUrl: 'http://site.test',
    dev: true,
    hmr: false,
    apiClient: fakeApi,
  });
});

/** Sends the path byte-for-byte; supertest's URL parsing would turn `\\` into `/`. */
async function rawGet(path: string): Promise<{ status: number; location?: string }> {
  const server = web.app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await new Promise((resolve, reject) => {
      get({ host: '127.0.0.1', port, path }, (res) => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, location: res.headers.location });
      }).on('error', reject);
    });
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

afterAll(async () => {
  await web?.close();
  await new Promise((resolve) => upstream?.close(resolve));
});

describe('web GET /health', () => {
  it('returns ok', async () => {
    const res = await request(web.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('web SSR', () => {
  it('renders the home page with header and post titles', async () => {
    const res = await request(web.app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.text).toContain('<html lang="en"');
    expect(res.text).toContain('Vinyl Rehab');
    expect(res.text).toContain('music is my radar');
    expect(res.text).toContain('david bowie – ★');
    expect(res.text).toContain('&lt;/script&gt;&lt;script&gt;alert(1)');
    expect(res.text).toContain('fonts.googleapis.com');
  });

  it('serialises state without letting a post title close the script tag', async () => {
    const res = await request(web.app).get('/');
    expect(res.text).toContain('window.__STATE__');
    expect(res.text).not.toContain(XSS_TITLE);
    const scripts = res.text.match(/<script>window\.__STATE__=[\s\S]*?<\/script>/g);
    expect(scripts).toHaveLength(1);
    expect(scripts?.[0]).toContain('alert(1)');
  });

  it('redirects paths without a trailing slash', async () => {
    const res = await request(web.app).get('/category/vinyl');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/category/vinyl/');
  });

  it('keeps the query string when redirecting', async () => {
    const res = await request(web.app).get('/tag/rock?x=1');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/tag/rock/?x=1');
  });

  it.each(['//evil.com/x', '/\\evil.com/x', '/\\\\evil.com/x', '/\\/evil.com/x'])(
    'never redirects %s off-site',
    async (path) => {
      const res = await rawGet(path);
      if (res.location === undefined) {
        expect(res.status).toBe(404);
      } else {
        expect(res.status).toBe(301);
        expect(res.location).not.toContain('\\');
        expect(new URL(res.location, 'http://x').host).toBe('x');
      }
    },
  );

  it('collapses leading slashes when redirecting', async () => {
    expect(await rawGet('//evil.com/x')).toEqual({ status: 301, location: '/evil.com/x/' });
  });

  it('returns 404 instead of redirecting a path with a backslash', async () => {
    const res = await rawGet('/\\evil.com/x');
    expect(res).toEqual({ status: 404, location: undefined });
  });

  it('escapes a script-like post title in the title tag and the body', async () => {
    const res = await request(web.app).get('/vinyl/xss/');
    expect(res.status).toBe(200);
    // unhead also escapes `/` inside the title.
    expect(res.text).toContain(
      '<title>&lt;&#x2F;script&gt;&lt;script&gt;alert(1) – Vinyl Rehab</title>',
    );
    expect(res.text).toMatch(/<h2[^>]*>\s*<a[^>]*>&lt;\/script&gt;&lt;script&gt;alert\(1\)<\/a>/);
    // Attribute values may hold `<`/`>` safely (only quotes are escaped); everything else may not.
    expect(res.text.replace(/content="[^"]*"/g, '')).not.toContain(XSS_TITLE);
  });

  it('renders the not found page for unknown paths', async () => {
    const res = await request(web.app).get('/no/such/thing/x/');
    expect(res.status).toBe(404);
    expect(res.text).toContain('Page not found');
    expect(res.text).toContain('music is my radar');
  });

  it.each(['/page/99/', '/page/0/', '/page/abc/', '/category/nope/', '/tag/x/page/x/'])(
    'returns 404 for %s',
    async (path) => {
      const res = await request(web.app).get(path);
      expect(res.status).toBe(404);
      expect(res.text).toContain('Page not found');
    },
  );

  it('renders a category list', async () => {
    const res = await request(web.app).get('/category/vinyl/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('david bowie – ★');
  });

  it('decodes non-ASCII post slugs', async () => {
    const res = await request(web.app).get('/vinyl/david-bowie-%e2%98%85/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('david bowie – ★');
  });

  it('lists only posts with the tag and names the tag in the heading', async () => {
    const res = await request(web.app).get('/tag/ambient/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ambient Drone');
    expect(res.text).not.toContain('david bowie');
    expect(res.text).toContain('<title>Ambient – Vinyl Rehab</title>');
  });

  it('sets canonical, description and the default title on the home page', async () => {
    const res = await request(web.app).get('/');
    expect(res.text).toContain('<title>Vinyl Rehab – music is my radar</title>');
    expect(res.text).toContain('<link rel="canonical" href="http://site.test/">');
    expect(res.text).toContain('name="description"');
  });

  it('titles a post page and points og:image at the main photo', async () => {
    const res = await request(web.app).get('/vinyl/with-photo/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>With Photo – Vinyl Rehab</title>');
    expect(res.text).toContain('content="http://images.test/bucket/photos/x/w1000.jpg"');
    expect(res.text).toContain('rel="canonical" href="http://site.test/vinyl/with-photo/"');
    expect(res.text).toContain('http://images.test/bucket/photos/x/original.jpg');
  });

  it('redirects a post requested under the wrong category', async () => {
    const res = await request(web.app).get('/cd/xss/');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/vinyl/xss/');
  });

  it('serves the admin shell without server-rendered content', async () => {
    const res = await request(web.app).get('/admin/posts/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<div id="app"></div>');
    expect(res.text).not.toContain('window.__STATE__');
  });
});

describe('web /v1 proxy', () => {
  it('forwards public GET requests to the api', async () => {
    const res = await request(web.app).get('/v1/posts?page=2');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], page: 2, totalPages: 0 });
    expect(upstreamRequests).toContain('/v1/posts?page=2');
  });

  it.each([
    '/v1/admin/posts',
    '/v1/Admin/posts',
    '/v1/ADMIN',
    '/v1/whatever',
    '/v1/Posts',
    '/v1/posts/by-wp-id/abc',
    '/v1/posts/../admin/posts',
    '/v1/posts/%2e%2e/admin/posts',
  ])('returns 404 for %s without calling the api', async (path) => {
    upstreamRequests.length = 0;
    const res = await rawGet(path);
    expect(res.status).toBe(404);
    expect(upstreamRequests).toEqual([]);
  });

  it('rejects non-GET requests', async () => {
    upstreamRequests.length = 0;
    const res = await request(web.app).post('/v1/posts');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found', message: 'Not found' });
    expect(upstreamRequests).toEqual([]);
  });

  it('forwards the other public endpoints', async () => {
    upstreamRequests.length = 0;
    for (const path of [
      '/v1/tags',
      '/v1/posts/by-slug/david-bowie-%E2%98%85',
      '/v1/posts/by-wp-id/12',
      '/v1/legacy-images/2019/01/a.jpg',
    ]) {
      expect((await request(web.app).get(path)).status).toBe(200);
    }
    expect(upstreamRequests).toHaveLength(4);
  });

  it('returns 502 when the api response exceeds the size cap', async () => {
    const res = await request(web.app).get('/v1/categories');
    expect(res.status).toBe(502);
    expect(res.body.error).toBe('bad_gateway');
  });
});

describe('legacy WordPress URLs', () => {
  it('redirects an upload to the image host', async () => {
    const res = await request(web.app).get('/wp-content/uploads/2026/01/DSCF2087-768x768.jpg');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('http://images.test/bucket/photos/p1/w1000.jpg');
  });

  it('404s an unknown upload and one resolving to a foreign origin', async () => {
    const unknown = await request(web.app).get('/wp-content/uploads/2026/01/none.jpg');
    expect(unknown.status).toBe(404);
    const foreign = await request(web.app).get('/wp-content/uploads/2026/01/evil.jpg');
    expect(foreign.status).toBe(404);
    expect(foreign.headers.location).toBeUndefined();
  });

  it('redirects ?p=id to the post and 404s an unknown id', async () => {
    const found = await request(web.app).get('/?p=123');
    expect(found.status).toBe(301);
    expect(found.headers.location).toBe('/vinyl/some-slug/');
    expect((await request(web.app).get('/?p=999999')).status).toBe(404);
  });

  it('renders the home page for a junk or repeated p', async () => {
    expect((await request(web.app).get('/?p=abc')).status).toBe(200);
    expect((await request(web.app).get('/?p=123&p=124')).status).toBe(200);
  });

  it('redirects attachment pages of a known category', async () => {
    const res = await request(web.app).get('/vinyl/depeche-mode-useless-home/dscf6032/');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/vinyl/depeche-mode-useless-home/');
  });

  it('redirects date archives to the home page', async () => {
    for (const path of ['/2021/05/', '/2021/', '/2021/05/page/2/']) {
      const res = await request(web.app).get(path);
      expect(res.status).toBe(301);
      expect(res.headers.location).toBe('/');
    }
  });

  it('redirects /wp-sitemap.xml to /sitemap.xml', async () => {
    const res = await request(web.app).get('/wp-sitemap.xml');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/sitemap.xml');
  });

  it('does not turn a protocol-relative path into a host', async () => {
    // Parsed as a URL against a base, this would read as host `evil.test`, path `/vinyl/a/b/`.
    const res = await rawGet('//evil.test/vinyl/a/b/');
    expect(res.location).toBeUndefined();
  });
});

describe('web feed and sitemap', () => {
  it('serves the RSS feed at /feed and /feed/ without redirecting', async () => {
    for (const path of ['/feed', '/feed/']) {
      const res = await request(web.app).get(path).buffer(true);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/rss+xml; charset=utf-8');
      expect(res.headers['cache-control']).toBe('public, max-age=600');
    }
  });

  it('lists the newest posts first with permalink, date and enclosure', async () => {
    const res = await request(web.app).get('/feed/').buffer(true);
    const items = res.text.split('<item>').slice(1);
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(20);
    expect(items[0]).toContain('<link>http://site.test/vinyl/david-bowie-%E2%98%85/</link>');
    expect(items[0]).toContain(
      '<guid isPermaLink="true">http://site.test/vinyl/david-bowie-%E2%98%85/</guid>',
    );
    expect(items[0]).toContain('<pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>');
    expect(res.text).toContain('<atom:link href="http://site.test/feed/" rel="self"');
    expect(res.text).toContain(
      '<enclosure url="http://images.test/bucket/photos/x/w1000.jpg" type="image/jpeg" length="0"/>',
    );
    expect(res.text).toContain('&lt;/script&gt;&lt;script&gt;alert(1)');
    expect(res.text).not.toContain('</script><script>');
  });

  it('serves a sitemap with posts, lastmod and non-empty terms only', async () => {
    const res = await request(web.app).get('/sitemap.xml').buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.text).toContain('<urlset');
    expect(res.text).toContain('<loc>http://site.test/</loc>');
    expect(res.text).toContain(
      '<loc>http://site.test/vinyl/with-photo/</loc><lastmod>2024-01-01T00:00:00.000Z</lastmod>',
    );
    expect(res.text).toContain('<loc>http://site.test/tag/ambient/</loc>');
    expect(res.text).toContain('<loc>http://site.test/category/vinyl/</loc>');
    expect(res.text).not.toContain('/category/empty/');
  });
});
