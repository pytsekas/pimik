import { describe, expect, it } from 'vite-plus/test';
import { computeStats } from './stats.ts';
import { photo, post } from './testHelpers.ts';

const categories = [
  { slug: 'vinyl', name: 'Vinyl' },
  { slug: 'cd', name: 'CD' },
  { slug: 'tape', name: 'Tape' },
];
const tags = [
  { slug: 'bowie', name: 'David Bowie' },
  { slug: 'ambient', name: 'ambient' },
  { slug: 'unused', name: 'unused' },
];

describe('computeStats', () => {
  it('counts posts by status and distinct photos', () => {
    const stats = computeStats(
      [
        post({ id: 'p1', status: 'published', photos: [photo('a'), photo('b')] }),
        post({ id: 'p2', status: 'draft', photos: [photo('b'), photo('c')] }),
        post({ id: 'p3', status: 'published', photos: [] }),
      ],
      categories,
      tags,
    );
    expect(stats).toMatchObject({ posts: 3, published: 2, drafts: 1, photos: 3 });
  });

  it('counts posts and photos per category, unused ones last', () => {
    const stats = computeStats(
      [
        post({ id: 'p1', categorySlug: 'cd', photos: [photo('a')] }),
        post({ id: 'p2', categorySlug: 'vinyl', photos: [photo('b'), photo('c')] }),
        post({ id: 'p3', categorySlug: 'vinyl', photos: [photo('c'), photo('d')] }),
      ],
      categories,
      tags,
    );
    expect(stats.categories).toEqual([
      { slug: 'vinyl', name: 'Vinyl', posts: 2, photos: 3 },
      { slug: 'cd', name: 'CD', posts: 1, photos: 1 },
      { slug: 'tape', name: 'Tape', posts: 0, photos: 0 },
    ]);
  });

  it('lists every tag with its post count, most used first, then by name', () => {
    const stats = computeStats(
      [
        post({ id: 'p1', tagSlugs: ['bowie', 'ambient'] }),
        post({ id: 'p2', tagSlugs: ['bowie', 'bowie'] }),
      ],
      categories,
      tags,
    );
    expect(stats.tags).toEqual([
      { slug: 'bowie', name: 'David Bowie', posts: 2 },
      { slug: 'ambient', name: 'ambient', posts: 1 },
      { slug: 'unused', name: 'unused', posts: 0 },
    ]);
  });

  it('lists a slug missing from the term list under the slug itself', () => {
    const stats = computeStats([post({ categorySlug: 'lp', tagSlugs: ['new'] })], [], []);
    expect(stats.categories).toEqual([{ slug: 'lp', name: 'lp', posts: 1, photos: 1 }]);
    expect(stats.tags).toEqual([{ slug: 'new', name: 'new', posts: 1 }]);
  });
});
