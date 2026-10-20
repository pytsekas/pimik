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
  const { discogsUrl, html: marked } = extractDiscogs(html);
  const paragraphs = readBlocks(marked.replace(FIGURE, ''));
  const slug = decodeSlug(wp.slug);
  const post: ImportedPost = {
    wpId: wp.id,
    slug,
    title: decodeEntities(wp.title.rendered).trim() || slug,
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

const ANCHOR = /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
/** Stands in for the extracted discogs link while the text is built. */
const DISCOGS_MARK = '';
/** What may sit next to the extracted link in a block that is otherwise empty. */
const ONLY_PUNCTUATION = /^[\s[\](){}–—\-:|.,]*$/;

/** Takes out the first discogs.com link, leaving a marker where it was. */
function extractDiscogs(html: string): { discogsUrl?: string; html: string } {
  for (const match of html.matchAll(ANCHOR)) {
    const href = match[1] ?? '';
    if (!/discogs\.com/i.test(href)) continue;
    const start = match.index;
    return {
      discogsUrl: decodeEntities(href),
      html: html.slice(0, start) + DISCOGS_MARK + html.slice(start + match[0].length),
    };
  }
  return { html };
}

/** Text of paragraphs and list items as Markdown, with the remaining links kept as Markdown links. */
function readBlocks(html: string): string[] {
  const blocks: string[] = [];
  let previousWasItem = false;
  for (const [, tag = '', inner = ''] of html.matchAll(/<(p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const text = blockText(inner);
    if (text === null) continue;
    const isItem = tag.toLowerCase() === 'li';
    if (isItem && previousWasItem) {
      blocks[blocks.length - 1] += `\n- ${text}`;
    } else {
      blocks.push(isItem ? `- ${text}` : text);
    }
    previousWasItem = isItem;
  }
  return blocks;
}

/** Markdown for one block, or null when nothing but the extracted discogs link was in it. */
function blockText(inner: string): string | null {
  const linked = inner.replace(ANCHOR, (_match, href: string, label: string) => {
    const text = label.replace(/<[^>]*>/g, '').trim();
    return text ? `[${text}](${href})` : '';
  });
  const text = stripTags(linked.replace(/<br\s*\/?>/gi, '\n')).trim();
  if (!text.includes(DISCOGS_MARK)) return text || null;
  const rest = text.replace(/[\s–—\-:|]*/, '').trim();
  return ONLY_PUNCTUATION.test(rest) ? null : rest;
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''));
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
