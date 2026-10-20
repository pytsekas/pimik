import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { loadConfig } from '../config.ts';
import { initFirebase } from '../firebase.ts';
import { makePostInput } from '../test/factory.ts';
import { resetEmulator } from '../test/reset.ts';
import { PostRepo } from './posts.ts';
import { TermRepo } from './terms.ts';

const PROJECT_ID = 'vinyl-rehab-local';
const TEST_ENV = {
  GCLOUD_PROJECT: PROJECT_ID,
  BUCKET: 'vinyl-rehab-photos',
  IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-photos',
  ADMIN_EMAILS: 'admin@example.com',
};

describe('TermRepo', () => {
  let posts: PostRepo;
  let categories: TermRepo;
  let tags: TermRepo;

  beforeAll(() => {
    const config = loadConfig(TEST_ENV);
    const { db } = initFirebase(config);
    posts = new PostRepo(db);
    categories = new TermRepo(db, 'categories');
    tags = new TermRepo(db, 'tags');
  });

  beforeEach(async () => {
    await resetEmulator(PROJECT_ID);
  });

  it('upserts and gets terms, overwriting names', async () => {
    await categories.upsert([{ slug: 'vinyl', name: 'Vinyl' }]);
    await categories.upsert([{ slug: 'vinyl', name: 'Vinyls' }]);
    expect(await categories.get('vinyl')).toEqual({ slug: 'vinyl', name: 'Vinyls' });
    expect(await categories.get('missing')).toBeNull();
  });

  it('adds only missing terms and keeps existing names', async () => {
    await tags.upsert([{ slug: 'ambient', name: 'Ambient' }]);
    await tags.addMissing([
      { slug: 'ambient', name: 'AMBIENT' },
      { slug: 'drone', name: 'Drone' },
    ]);
    expect(await tags.listAll()).toEqual([
      { slug: 'ambient', name: 'Ambient' },
      { slug: 'drone', name: 'Drone' },
    ]);
    await tags.addMissing([]);
  });

  it('lists all terms sorted by name', async () => {
    await categories.upsert([
      { slug: 'b', name: 'Beta' },
      { slug: 'a', name: 'Alpha' },
    ]);
    expect((await categories.listAll()).map((term) => term.slug)).toEqual(['a', 'b']);
  });

  it('keeps categories and tags separate', async () => {
    await categories.upsert([{ slug: 'x', name: 'X' }]);
    expect(await tags.listAll()).toEqual([]);
  });

  it('supports non-ASCII slugs', async () => {
    await tags.upsert([{ slug: 'bowie-★', name: 'Bowie ★' }]);
    expect(await tags.get('bowie-★')).toEqual({ slug: 'bowie-★', name: 'Bowie ★' });
  });

  it('lists only categories with published posts, with counts', async () => {
    await categories.upsert([
      { slug: 'vinyl', name: 'Vinyl' },
      { slug: 'cassette', name: 'Cassette' },
      { slug: 'drafts-only', name: 'Drafts only' },
      { slug: 'empty', name: 'Empty' },
    ]);
    await posts.create(makePostInput({ slug: 'v1', categorySlug: 'vinyl' }));
    await posts.create(makePostInput({ slug: 'v2', categorySlug: 'vinyl' }));
    await posts.create(makePostInput({ slug: 'c1', categorySlug: 'cassette' }));
    await posts.create(makePostInput({ slug: 'd1', categorySlug: 'drafts-only', status: 'draft' }));

    expect(await categories.listNonEmpty()).toEqual([
      { slug: 'cassette', name: 'Cassette', count: 1 },
      { slug: 'vinyl', name: 'Vinyl', count: 2 },
    ]);
  });

  it('counts published posts per tag', async () => {
    await tags.upsert([
      { slug: 'ambient', name: 'Ambient' },
      { slug: 'rock', name: 'Rock' },
      { slug: 'unused', name: 'Unused' },
    ]);
    await posts.create(makePostInput({ slug: 'p1', tagSlugs: ['ambient', 'rock'] }));
    await posts.create(makePostInput({ slug: 'p2', tagSlugs: ['rock'] }));
    await posts.create(makePostInput({ slug: 'p3', tagSlugs: ['unused'], status: 'draft' }));

    expect(await tags.listNonEmpty()).toEqual([
      { slug: 'ambient', name: 'Ambient', count: 1 },
      { slug: 'rock', name: 'Rock', count: 2 },
    ]);
  });

  describe('listNonEmpty cache', () => {
    let clock: number;
    let cached: TermRepo;

    beforeEach(async () => {
      clock = 1_000_000;
      const { db } = initFirebase(loadConfig(TEST_ENV));
      cached = new TermRepo(db, 'categories', { now: () => clock });
      await cached.upsert([
        { slug: 'vinyl', name: 'Vinyl' },
        { slug: 'cassette', name: 'Cassette' },
      ]);
      await posts.create(makePostInput({ slug: 'v1', categorySlug: 'vinyl' }));
    });

    const slugs = async () => (await cached.listNonEmpty()).map((term) => term.slug);

    it('answers repeated calls from memory for 60 s', async () => {
      expect(await slugs()).toEqual(['vinyl']);
      await posts.create(makePostInput({ slug: 'c1', categorySlug: 'cassette' }));
      clock += 59_999;
      expect(await slugs()).toEqual(['vinyl']);
      clock += 1;
      expect(await slugs()).toEqual(['cassette', 'vinyl']);
    });

    it('runs the count queries once for two calls', async () => {
      const { db } = initFirebase(loadConfig(TEST_ENV));
      const collection = vi.spyOn(db, 'collection');
      await cached.listNonEmpty();
      const queriesForOneCall = collection.mock.calls.length;
      expect(queriesForOneCall).toBeGreaterThan(0);
      await cached.listNonEmpty();
      expect(collection.mock.calls.length).toBe(queriesForOneCall);
      collection.mockRestore();
    });

    it('reloads after invalidate() and after upsert()', async () => {
      expect(await slugs()).toEqual(['vinyl']);
      await posts.create(makePostInput({ slug: 'c1', categorySlug: 'cassette' }));
      cached.invalidate();
      expect(await slugs()).toEqual(['cassette', 'vinyl']);
      await cached.upsert([{ slug: 'tape', name: 'Tape' }]);
      await posts.create(makePostInput({ slug: 't1', categorySlug: 'tape' }));
      expect(await slugs()).toEqual(['cassette', 'tape', 'vinyl']);
    });
  });
});
