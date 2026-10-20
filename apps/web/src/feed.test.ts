import type { Page, Post } from '@vinyl/shared';
import { describe, expect, it } from 'vite-plus/test';
import { NotFoundError, type ApiClient } from './api.ts';
import { renderFeed } from './feed.ts';
import { renderSitemap } from './sitemap.ts';

const config = { siteUrl: 'http://site.test', imageBaseUrl: 'http://images.test/b' };

function post(n: number): Post {
  return {
    id: `p${n}`,
    slug: `post-${n}`,
    title: `Post ${n} & <co>`,
    categorySlug: 'vinyl',
    tagSlugs: [],
    publishedAt: '2024-01-01',
    status: 'published',
    photos: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-02T00:00:00.000Z',
  };
}

/** 25 posts, 10 per page, like the real api. */
function pagedApi(total: number, requested: number[] = []): ApiClient {
  const all = Array.from({ length: total }, (_, index) => post(index + 1));
  return {
    async listPosts({ page }) {
      requested.push(page);
      const totalPages = Math.ceil(total / 10);
      if (page > totalPages || total === 0) throw new NotFoundError();
      return {
        items: all.slice((page - 1) * 10, page * 10),
        page,
        totalPages,
      } satisfies Page<Post>;
    },
    getPostBySlug: async () => null,
    getPostByWpId: async () => null,
    listCategories: async () => [],
    listTags: async () => [],
    legacyImage: async () => null,
  };
}

describe('renderFeed', () => {
  it('stops at 20 items after two api pages and escapes text', async () => {
    const requested: number[] = [];
    const xml = await renderFeed(pagedApi(25, requested), config);
    expect(xml.match(/<item>/g)).toHaveLength(20);
    expect(requested).toEqual([1, 2]);
    expect(xml).toContain('<title>Post 1 &amp; &lt;co&gt;</title>');
    expect(xml).not.toContain('<enclosure');
  });

  it('is still a valid channel with no posts', async () => {
    const xml = await renderFeed(pagedApi(0), config);
    expect(xml).toContain('<title>Vinyl Rehab</title>');
    expect(xml).toContain('<description>music is my radar</description>');
    expect(xml).not.toContain('<item>');
  });
});

describe('renderSitemap', () => {
  it('pages through every post', async () => {
    const requested: number[] = [];
    const xml = await renderSitemap(pagedApi(25, requested), 'http://site.test');
    expect(requested).toEqual([1, 2, 3]);
    expect(xml.match(/<loc>http:\/\/site.test\/vinyl\/post-\d+\/<\/loc>/g)).toHaveLength(25);
  });
});
