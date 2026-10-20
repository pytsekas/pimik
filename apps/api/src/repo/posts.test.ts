import { beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { loadConfig } from '../config.ts';
import { initFirebase } from '../firebase.ts';
import { makePostInput } from '../test/factory.ts';
import { resetEmulator } from '../test/reset.ts';
import { PostRepo, SlugTakenError } from './posts.ts';

const PROJECT_ID = 'vinyl-rehab-local';

describe('PostRepo', () => {
  let repo: PostRepo;

  beforeAll(() => {
    const config = loadConfig({
      GCLOUD_PROJECT: PROJECT_ID,
      BUCKET: 'vinyl-rehab-photos',
      IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-photos',
      ADMIN_EMAILS: 'admin@example.com',
    });
    repo = new PostRepo(initFirebase(config).db);
  });

  beforeEach(async () => {
    await resetEmulator(PROJECT_ID);
  });

  describe('listPublished', () => {
    async function seed(): Promise<void> {
      for (let i = 1; i <= 23; i++) {
        const day = String(i).padStart(2, '0');
        await repo.create(
          makePostInput({
            slug: `post-${day}`,
            publishedAt: `2024-02-${day}`,
            categorySlug: i % 2 === 0 ? 'cassette' : 'vinyl',
            tagSlugs: i % 5 === 0 ? ['ambient'] : ['rock'],
          }),
        );
      }
      await repo.create(
        makePostInput({ slug: 'draft-1', status: 'draft', publishedAt: '2024-03-01' }),
      );
      await repo.create(
        makePostInput({ slug: 'draft-2', status: 'draft', publishedAt: '2024-03-02' }),
      );
    }

    it('paginates 10 per page, newest first, without drafts', async () => {
      await seed();
      const first = await repo.listPublished({ page: 1 });
      expect(first.items).toHaveLength(10);
      expect(first.totalPages).toBe(3);
      expect(first.page).toBe(1);
      expect(first.items[0]?.slug).toBe('post-23');

      const last = await repo.listPublished({ page: 3 });
      expect(last.items).toHaveLength(3);
      expect(last.items.at(-1)?.slug).toBe('post-01');

      const all = [...first.items, ...(await repo.listPublished({ page: 2 })).items, ...last.items];
      expect(all.every((post) => post.status === 'published')).toBe(true);
      expect(new Set(all.map((post) => post.id)).size).toBe(23);
    });

    it('breaks publishedAt ties by createdAt desc', async () => {
      await repo.create(makePostInput({ slug: 'older', publishedAt: '2024-05-05' }));
      await repo.create(makePostInput({ slug: 'newer', publishedAt: '2024-05-05' }));
      const { items } = await repo.listPublished({ page: 1 });
      expect(items.map((post) => post.slug)).toEqual(['newer', 'older']);
    });

    it('filters by category', async () => {
      await seed();
      const result = await repo.listPublished({ page: 1, category: 'cassette' });
      expect(result.items).toHaveLength(10);
      expect(result.items.every((post) => post.categorySlug === 'cassette')).toBe(true);
      expect(result.totalPages).toBe(2);
    });

    it('filters by tag', async () => {
      await seed();
      const result = await repo.listPublished({ page: 1, tag: 'ambient' });
      expect(result.items.map((post) => post.slug)).toEqual([
        'post-20',
        'post-15',
        'post-10',
        'post-05',
      ]);
      expect(result.items.every((post) => post.tagSlugs.includes('ambient'))).toBe(true);
    });

    it('returns an empty page for a term without published posts', async () => {
      await seed();
      const result = await repo.listPublished({ page: 1, category: 'nope' });
      expect(result).toEqual({ items: [], page: 1, totalPages: 0 });
    });
  });

  describe('slugs', () => {
    it('rejects creating a second post with the same slug', async () => {
      await repo.create(makePostInput({ slug: 'x' }));
      await expect(repo.create(makePostInput({ slug: 'x' }))).rejects.toBeInstanceOf(
        SlugTakenError,
      );
    });

    it('rejects updating a post to another post slug', async () => {
      const a = await repo.create(makePostInput({ slug: 'a' }));
      await repo.create(makePostInput({ slug: 'b' }));
      await expect(repo.update(a.id, makePostInput({ slug: 'b' }))).rejects.toBeInstanceOf(
        SlugTakenError,
      );
      expect((await repo.getById(a.id))?.slug).toBe('a');
    });

    it('frees the old slug when it changes', async () => {
      const a = await repo.create(makePostInput({ slug: 'a' }));
      await repo.update(a.id, makePostInput({ slug: 'a2' }));
      const again = await repo.create(makePostInput({ slug: 'a' }));
      expect(again.slug).toBe('a');
      expect((await repo.getBySlug('a2'))?.id).toBe(a.id);
    });

    it('allows updating a post while keeping its slug', async () => {
      const a = await repo.create(makePostInput({ slug: 'a' }));
      const updated = await repo.update(a.id, makePostInput({ slug: 'a', title: 'Renamed' }));
      expect(updated.title).toBe('Renamed');
      expect(updated.createdAt).toBe(a.createdAt);
    });

    it('finds posts with non-ASCII slugs', async () => {
      const created = await repo.create(makePostInput({ slug: 'david-bowie-★' }));
      expect((await repo.getBySlug('david-bowie-★'))?.id).toBe(created.id);
    });
  });

  describe('lookups and deletion', () => {
    it('returns null for missing posts', async () => {
      expect(await repo.getById('missing')).toBeNull();
      expect(await repo.getBySlug('missing')).toBeNull();
      expect(await repo.getByWpId(1)).toBeNull();
    });

    it('finds a post by wpId', async () => {
      const created = await repo.create(makePostInput({ slug: 'wp', wpId: 4242 }));
      expect((await repo.getByWpId(4242))?.id).toBe(created.id);
    });

    it('lists all posts including drafts, newest first', async () => {
      await repo.create(makePostInput({ slug: 'old', publishedAt: '2023-01-01' }));
      await repo.create(
        makePostInput({ slug: 'draft', status: 'draft', publishedAt: '2024-06-01' }),
      );
      const all = await repo.listAll();
      expect(all.map((post) => post.slug)).toEqual(['draft', 'old']);
    });

    it('deletes a post, returns it and frees the slug', async () => {
      const created = await repo.create(makePostInput({ slug: 'gone' }));
      const deleted = await repo.delete(created.id);
      expect(deleted?.id).toBe(created.id);
      expect(await repo.getById(created.id)).toBeNull();
      await expect(repo.create(makePostInput({ slug: 'gone' }))).resolves.toBeDefined();
    });

    it('returns null when deleting a missing post', async () => {
      expect(await repo.delete('missing')).toBeNull();
    });
  });
});
