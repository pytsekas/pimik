export type Photo = {
  id: string;
  width: number;
  height: number;
  paths: { original: string; w1000: string; w300: string };
  wpPath?: string;
};

export type PostStatus = 'draft' | 'published';

export type Post = {
  id: string;
  slug: string;
  title: string;
  categorySlug: string;
  tagSlugs: string[];
  discogsUrl?: string;
  text?: string;
  /** YYYY-MM-DD */
  publishedAt: string;
  status: PostStatus;
  photos: Photo[];
  wpId?: number;
  /** ISO time of the last import write; a later updatedAt means the post was edited since. */
  importedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Term = { slug: string; name: string; count?: number };

export type Page<T> = { items: T[]; page: number; totalPages: number };
