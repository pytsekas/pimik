import type { PostFields } from '../repo/posts.ts';

export function makePostInput(overrides: Partial<PostFields> = {}): PostFields {
  return {
    slug: 'post',
    title: 'Post',
    categorySlug: 'vinyl',
    tagSlugs: [],
    publishedAt: '2024-01-01',
    status: 'published',
    photos: [],
    ...overrides,
  };
}
