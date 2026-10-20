import type { Post } from '@vinyl/shared';
import { isNotFoundError, type ApiClient } from './api.ts';
import { photoUrl } from './photoUrl.ts';

export type FeedConfig = { siteUrl: string; imageBaseUrl: string };

const FEED_ITEMS = 20;
const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escapes text for XML and drops characters XML 1.0 does not allow at all. */
export function escapeXml(text: string): string {
  return (
    text
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
      .replace(/[&<>"']/g, (char) => XML_ENTITIES[char] ?? char)
  );
}

export function postPath(post: Pick<Post, 'categorySlug' | 'slug'>): string {
  return `/${encodeURIComponent(post.categorySlug)}/${encodeURIComponent(post.slug)}/`;
}

/** RFC 822 date at 00:00 UTC for a `YYYY-MM-DD` publication date. */
function pubDate(publishedAt: string): string {
  return new Date(`${publishedAt}T00:00:00Z`).toUTCString();
}

function item(post: Post, config: FeedConfig): string {
  const link = `${config.siteUrl}${postPath(post)}`;
  const photo = post.photos[0];
  // The size is unknown without fetching the image; RSS requires the attribute, so 0.
  const enclosure = photo
    ? `<enclosure url="${escapeXml(photoUrl(config.imageBaseUrl, photo.paths.w1000))}" type="image/jpeg" length="0"/>`
    : '';
  return [
    '<item>',
    `<title>${escapeXml(post.title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<guid isPermaLink="true">${escapeXml(link)}</guid>`,
    `<pubDate>${pubDate(post.publishedAt)}</pubDate>`,
    enclosure,
    '</item>',
  ].join('');
}

/** RSS 2.0 document for the given posts (newest first). */
export function buildFeed(posts: Post[], config: FeedConfig): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>',
    '<title>Vinyl Rehab</title>',
    `<link>${escapeXml(config.siteUrl)}/</link>`,
    '<description>music is my radar</description>',
    `<atom:link href="${escapeXml(config.siteUrl)}/feed/" rel="self" type="application/rss+xml"/>`,
    ...posts.map((post) => item(post, config)),
    '</channel></rss>',
  ].join('\n');
}

/** The newest 20 published posts, as a feed; the api pages are 10 posts each. */
export async function renderFeed(api: ApiClient, config: FeedConfig): Promise<string> {
  const posts: Post[] = [];
  try {
    for (let page = 1; posts.length < FEED_ITEMS; page += 1) {
      const result = await api.listPosts({ page });
      posts.push(...result.items);
      if (page >= result.totalPages) break;
    }
  } catch (error) {
    // No published posts yet: the api answers 404 for the first page.
    if (!isNotFoundError(error)) throw error;
  }
  return buildFeed(posts.slice(0, FEED_ITEMS), config);
}
