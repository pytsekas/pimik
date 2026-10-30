import type { Post, Term } from '@vinyl/shared';

export type CategoryStats = { slug: string; name: string; posts: number; photos: number };
export type TagStats = { slug: string; name: string; posts: number };

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
  const tagPosts = countBy(posts.flatMap((post) => [...new Set(post.tagSlugs)]));

  return {
    posts: posts.length,
    published: posts.filter((post) => post.status === 'published').length,
    drafts: posts.filter((post) => post.status === 'draft').length,
    photos: new Set(posts.flatMap((post) => post.photos.map((photo) => photo.id))).size,
    categories: withNames(categories, categoryPosts)
      .map((term) => ({ ...term, photos: categoryPhotos.get(term.slug)?.size ?? 0 }))
      .sort(byUse),
    tags: withNames(tags, tagPosts).sort(byUse),
  };
}

function countBy(slugs: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  slugs.forEach((slug) => counts.set(slug, (counts.get(slug) ?? 0) + 1));
  return counts;
}

function withNames(terms: Term[], counts: Map<string, number>): TagStats[] {
  const names = new Map(terms.map((term) => [term.slug, term.name]));
  counts.forEach((_count, slug) => names.has(slug) || names.set(slug, slug));
  return [...names].map(([slug, name]) => ({ slug, name, posts: counts.get(slug) ?? 0 }));
}

function byUse(a: TagStats & { photos?: number }, b: TagStats & { photos?: number }): number {
  return b.posts - a.posts || (b.photos ?? 0) - (a.photos ?? 0) || a.name.localeCompare(b.name);
}
