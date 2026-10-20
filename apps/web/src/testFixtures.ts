import type { Photo, Post } from '@vinyl/shared';

export function photo(index: number, overrides: Partial<Photo> = {}): Photo {
  return {
    id: `p${index}`,
    width: 2000,
    height: 1333,
    paths: {
      original: `photos/p${index}/original.jpg`,
      w1000: `photos/p${index}/w1000.jpg`,
      w300: `photos/p${index}/w300.jpg`,
    },
    ...overrides,
  };
}

export function testPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post1',
    slug: 'david-bowie-★',
    title: 'david bowie – ★',
    categorySlug: 'vinyl',
    tagSlugs: ['bowie', '2016'],
    publishedAt: '2026-01-09',
    status: 'published',
    photos: [photo(0), photo(1, { width: 2000, height: 2000 })],
    createdAt: '2026-01-09T00:00:00.000Z',
    updatedAt: '2026-01-09T00:00:00.000Z',
    ...overrides,
  };
}
