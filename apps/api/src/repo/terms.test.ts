import { beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { loadConfig } from '../config.ts';
import { initFirebase } from '../firebase.ts';
import { makePostInput } from '../test/factory.ts';
import { resetEmulator } from '../test/reset.ts';
import { PostRepo } from './posts.ts';
import { TermRepo } from './terms.ts';

const PROJECT_ID = 'vinyl-rehab-local';

describe('TermRepo', () => {
  let posts: PostRepo;
  let categories: TermRepo;
  let tags: TermRepo;

  beforeAll(() => {
    const config = loadConfig({
      GCLOUD_PROJECT: PROJECT_ID,
      BUCKET: 'vinyl-rehab-photos',
      IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-photos',
      ADMIN_EMAILS: 'admin@example.com',
    });
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
});
