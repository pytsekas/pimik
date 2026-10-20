import type { Post, Term } from '@vinyl/shared';
import { isNotFoundError, type ApiClient } from './api.ts';
import { escapeXml, postPath } from './feed.ts';

type SitemapEntry = { path: string; lastmod?: string };

/** Safety stop, far above any real blog size. */
const MAX_PAGES = 1000;

function entry(siteUrl: string, { path, lastmod }: SitemapEntry): string {
  const modified = lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : '';
  return `<url><loc>${escapeXml(siteUrl + path)}</loc>${modified}</url>`;
}

const nonEmpty = (terms: Term[]): Term[] => terms.filter((term) => term.count !== 0);

export function buildSitemap(
  siteUrl: string,
  posts: Post[],
  categories: Term[],
  tags: Term[],
): string {
  const entries: SitemapEntry[] = [
    { path: '/' },
    ...posts.map((post) => ({ path: postPath(post), lastmod: post.updatedAt })),
    ...nonEmpty(categories).map((term) => ({
      path: `/category/${encodeURIComponent(term.slug)}/`,
    })),
    ...nonEmpty(tags).map((term) => ({ path: `/tag/${encodeURIComponent(term.slug)}/` })),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((item) => entry(siteUrl, item)),
    '</urlset>',
  ].join('\n');
}

async function allPosts(api: ApiClient): Promise<Post[]> {
  const posts: Post[] = [];
  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await api.listPosts({ page });
      posts.push(...result.items);
      if (page >= result.totalPages) break;
    }
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
  return posts;
}

/** Home, every published post, and the categories and tags the api lists (non-empty only). */
export async function renderSitemap(api: ApiClient, siteUrl: string): Promise<string> {
  const [posts, categories, tags] = await Promise.all([
    allPosts(api),
    api.listCategories(),
    api.listTags(),
  ]);
  return buildSitemap(siteUrl, posts, categories, tags);
}
