import type { Post, Term } from '@vinyl/shared';

type TermCount = { slug: string; name: string; posts: number };
export type CategoryStats = TermCount & { photos: number };
/** `published` decides whether the public tag page exists; it 404s without published posts. */
export type TagStats = TermCount & { published: number };

export type Stats = {
  posts: number;
  published: number;
  drafts: number;
  /** Distinct photos; imported posts may share one. */
  photos: number;
  categories: CategoryStats[];
  tags: TagStats[];
};

/**
 * Counts over every post, drafts included. Terms no post uses are listed with zero; a slug a post
 * uses but the term list lacks is listed under its slug. Most used first, then by name.
 */
export function computeStats(posts: Post[], categories: Term[], tags: Term[]): Stats {
  const categoryPhotos = new Map<string, Set<string>>();
  const categoryPosts = countBy(posts.map((post) => post.categorySlug));
  for (const post of posts) {
    const ids = categoryPhotos.get(post.categorySlug) ?? new Set<string>();
    post.photos.forEach((photo) => ids.add(photo.id));
    categoryPhotos.set(post.categorySlug, ids);
  }
  const tagSlugs = (list: Post[]) => countBy(list.flatMap((post) => [...new Set(post.tagSlugs)]));
  const tagPosts = tagSlugs(posts);
  const tagPublished = tagSlugs(posts.filter((post) => post.status === 'published'));

  return {
    posts: posts.length,
    published: posts.filter((post) => post.status === 'published').length,
    drafts: posts.filter((post) => post.status === 'draft').length,
    photos: new Set(posts.flatMap((post) => post.photos.map((photo) => photo.id))).size,
    categories: withNames(categories, categoryPosts)
      .map((term) => ({ ...term, photos: categoryPhotos.get(term.slug)?.size ?? 0 }))
      .sort((a, b) => b.posts - a.posts || b.photos - a.photos || byName(a, b)),
    tags: withNames(tags, tagPosts)
      .map((term) => ({ ...term, published: tagPublished.get(term.slug) ?? 0 }))
      .sort((a, b) => b.posts - a.posts || byName(a, b)),
  };
}

function countBy(slugs: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  slugs.forEach((slug) => counts.set(slug, (counts.get(slug) ?? 0) + 1));
  return counts;
}

function withNames(terms: Term[], counts: Map<string, number>): TermCount[] {
  const names = new Map(terms.map((term) => [term.slug, term.name]));
  counts.forEach((_count, slug) => names.has(slug) || names.set(slug, slug));
  return [...names].map(([slug, name]) => ({ slug, name, posts: counts.get(slug) ?? 0 }));
}

function byName(a: TermCount, b: TermCount): number {
  return a.name.localeCompare(b.name);
}
