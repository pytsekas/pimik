import { parseWpImagePath, type Term } from '@vinyl/shared';

export type WpTerm = { id: number; slug: string; name: string };

export type WpPost = {
  id: number;
  date: string;
  slug: string;
  link: string;
  title: { rendered: string };
  content: { rendered: string };
  categories: number[];
  tags: number[];
};

export type ImportedPost = {
  wpId: number;
  slug: string;
  title: string;
  categorySlug: string;
  tagSlugs: string[];
  discogsUrl?: string;
  text?: string;
  publishedAt: string;
  imageUrls: string[];
};

const UPLOADS = '/wp-content/uploads/';
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const code =
        body[1]?.toLowerCase() === 'x' ? parseInt(body.slice(2), 16) : Number(body.slice(1));
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff
        ? String.fromCodePoint(code)
        : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** WP slugs may be percent-encoded; malformed escapes are kept as they are. */
export function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug);
  } catch {
    return slug;
  }
}

export function termsOf(wpTerms: WpTerm[]): Map<number, Term> {
  return new Map(
    wpTerms.map((term) => [
      term.id,
      { slug: decodeSlug(term.slug), name: decodeEntities(term.name) },
    ]),
  );
}

export function parseWpPost(
  wp: WpPost,
  categoriesById: Map<number, Term>,
  tagsById: Map<number, Term>,
): ImportedPost {
  const html = wp.content.rendered;
  const withoutFigures = html.replace(FIGURE, '');
  const { discogsUrl, paragraphs } = readParagraphs(withoutFigures);
  const post: ImportedPost = {
    wpId: wp.id,
    slug: decodeSlug(wp.slug),
    title: decodeEntities(wp.title.rendered),
    categorySlug: categoryOf(wp, categoriesById),
    tagSlugs: wp.tags.flatMap((id) => tagsById.get(id)?.slug ?? []),
    publishedAt: wp.date.slice(0, 10),
    imageUrls: imageUrlsOf(html),
  };
  if (discogsUrl) post.discogsUrl = discogsUrl;
  if (paragraphs.length > 0) post.text = paragraphs.join('\n\n');
  return post;
}

/** Path below /wp-content/uploads/ for a full-size image URL, or null for foreign URLs. */
export function wpPathOf(url: string): string | null {
  const index = url.indexOf(UPLOADS);
  return index < 0 ? null : url.slice(index + UPLOADS.length);
}

const FIGURE = /<figure\b[^>]*class="[^"]*\bwp-block-image\b[^"]*"[^>]*>([\s\S]*?)<\/figure>/gi;

/** Block-editor figures, and classic-editor images that sit directly in the content. */
const IMAGE_MARKUP = new RegExp(
  `${FIGURE.source}|(<a\\b[^>]*\\bhref="[^"]*${UPLOADS}[^"]*"[^>]*>\\s*<img\\b[^>]*>)|(<img\\b[^>]*>)`,
  'gi',
);

function imageUrlsOf(html: string): string[] {
  const urls: string[] = [];
  for (const [, figure, linked, bare] of html.matchAll(IMAGE_MARKUP)) {
    const inner = figure ?? linked ?? bare ?? '';
    const href = /<a\b[^>]*\bhref="([^"]*)"/i.exec(inner)?.[1];
    const src = /<img\b[^>]*\bsrc="([^"]*)"/i.exec(inner)?.[1];
    const chosen = href && href.includes(UPLOADS) ? href : src;
    if (chosen && (figure !== undefined || chosen.includes(UPLOADS))) {
      urls.push(fullSize(decodeEntities(chosen)));
    }
  }
  return [...new Set(urls)];
}

function fullSize(url: string): string {
  const index = url.indexOf(UPLOADS);
  if (index < 0) return url;
  const prefix = url.slice(0, index + UPLOADS.length);
  return prefix + parseWpImagePath(url.slice(prefix.length)).basePath;
}

function readParagraphs(html: string): { discogsUrl?: string; paragraphs: string[] } {
  const paragraphs: string[] = [];
  let discogsUrl: string | undefined;
  for (const [, inner = ''] of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const link = /^\s*<a\b[^>]*\bhref="([^"]*discogs\.com[^"]*)"[^>]*>[\s\S]*?<\/a>\s*$/i.exec(
      inner,
    );
    if (link?.[1]) {
      discogsUrl ??= decodeEntities(link[1]);
      continue;
    }
    const text = decodeEntities(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, '')).trim();
    if (text) paragraphs.push(text);
  }
  return discogsUrl ? { discogsUrl, paragraphs } : { paragraphs };
}

function categoryOf(wp: WpPost, categoriesById: Map<number, Term>): string {
  const known = new Set([...categoriesById.values()].map((term) => term.slug));
  const segment = firstPathSegment(wp.link);
  if (segment && known.has(segment)) return segment;
  const first = wp.categories[0];
  return (
    (first === undefined ? undefined : categoriesById.get(first)?.slug) ??
    segment ??
    'uncategorized'
  );
}

function firstPathSegment(link: string): string | undefined {
  try {
    const segment = new URL(link).pathname.split('/')[1];
    return segment ? decodeSlug(segment) : undefined;
  } catch {
    return undefined;
  }
}
