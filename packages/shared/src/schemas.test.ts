import { expect, test } from 'vite-plus/test';
import { PostInput } from './schemas.ts';

const photo = {
  id: 'p1',
  width: 2000,
  height: 1500,
  paths: {
    original: 'photos/p1/original.jpg',
    w1000: 'photos/p1/w1000.jpg',
    w300: 'photos/p1/w300.jpg',
  },
};
const valid = {
  slug: 'david-bowie-★',
  title: 'David Bowie',
  categorySlug: 'vinyl',
  tagSlugs: ['rock'],
  discogsUrl: 'https://www.discogs.com/release/1',
  publishedAt: '2026-01-02',
  status: 'published',
  photos: [photo],
};

test('accepts a valid post', () => {
  expect(PostInput.safeParse(valid).success).toBe(true);
  expect(PostInput.safeParse({ ...valid, discogsUrl: '' }).success).toBe(true);
  expect(PostInput.safeParse({ ...valid, discogsUrl: undefined }).success).toBe(true);
  expect(PostInput.safeParse({ ...valid, categoryName: 'Vinyl', tagNames: ['Rock'] }).success).toBe(
    true,
  );
});

test('rejects invalid posts', () => {
  expect(PostInput.safeParse({ ...valid, title: '' }).success).toBe(false);
  expect(PostInput.safeParse({ ...valid, slug: 'a/b' }).success).toBe(false);
  expect(PostInput.safeParse({ ...valid, discogsUrl: 'https://evil.com' }).success).toBe(false);
  expect(PostInput.safeParse({ ...valid, photos: [] }).success).toBe(false);
  expect(PostInput.safeParse({ ...valid, publishedAt: '2026/01/02' }).success).toBe(false);
});
