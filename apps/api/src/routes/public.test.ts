import request from 'supertest';
import type { Express } from 'express';
import { beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { initFirebase } from '../firebase.ts';
import { PhotoIndexRepo } from '../repo/photoIndex.ts';
import { PostRepo } from '../repo/posts.ts';
import { TermRepo } from '../repo/terms.ts';
import { makePostInput } from '../test/factory.ts';
import { resetEmulator } from '../test/reset.ts';

const PROJECT_ID = 'vinyl-rehab-local';
const IMAGE_BASE_URL = 'http://localhost:4443/vinyl-rehab-photos';

describe('public routes', () => {
  let app: Express;
  let posts: PostRepo;
  let categories: TermRepo;
  let tags: TermRepo;
  let photoIndex: PhotoIndexRepo;

  beforeAll(() => {
    const config = loadConfig({
      GCLOUD_PROJECT: PROJECT_ID,
      BUCKET: 'vinyl-rehab-photos',
      IMAGE_BASE_URL,
      ADMIN_EMAILS: 'admin@example.com',
    });
    const { db } = initFirebase(config);
    posts = new PostRepo(db);
    categories = new TermRepo(db, 'categories');
    tags = new TermRepo(db, 'tags');
    photoIndex = new PhotoIndexRepo(db);
    app = createApp({ config, posts, categories, tags, photoIndex });
  });

  beforeEach(async () => {
    await resetEmulator(PROJECT_ID);
  });

  async function seedMany(): Promise<void> {
    for (let i = 1; i <= 12; i++) {
      const day = String(i).padStart(2, '0');
      await posts.create(
        makePostInput({
          slug: `post-${day}`,
          publishedAt: `2024-02-${day}`,
          categorySlug: i <= 2 ? 'cassette' : 'vinyl',
          tagSlugs: i === 1 ? ['ambient'] : [],
        }),
      );
    }
    await posts.create(makePostInput({ slug: 'hidden', status: 'draft', categorySlug: 'drafty' }));
    await categories.upsert([
      { slug: 'vinyl', name: 'vinyl' },
      { slug: 'cassette', name: 'cassette' },
      { slug: 'drafty', name: 'drafty' },
      { slug: 'unused', name: 'unused' },
    ]);
    await tags.upsert([
      { slug: 'ambient', name: 'ambient' },
      { slug: 'unused', name: 'unused' },
    ]);
  }

  describe('GET /v1/posts', () => {
    it('returns the first page of 10 and defaults page to 1', async () => {
      await seedMany();
      const res = await request(app).get('/v1/posts?page=1');
      expect(res.status).toBe(200);
      expect(res.body.items).toHaveLength(10);
      expect(res.body.totalPages).toBe(2);
      expect((await request(app).get('/v1/posts')).body.page).toBe(1);
    });

    it('returns 404 past the last page', async () => {
      await seedMany();
      const res = await request(app).get('/v1/posts?page=99');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('not_found');
    });

    it.each(['0', 'abc', '-1', '1.5', ''])('returns 400 for page=%j', async (page) => {
      const res = await request(app).get(`/v1/posts?page=${page}`);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_page');
    });

    it('returns an empty 200 for an empty blog', async () => {
      const res = await request(app).get('/v1/posts?page=1');
      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([]);
    });

    it('filters by category and 404s for unknown or empty ones', async () => {
      await seedMany();
      const ok = await request(app).get('/v1/posts?category=cassette');
      expect(ok.status).toBe(200);
      expect(ok.body.items).toHaveLength(2);
      expect(
        ok.body.items.every((p: { categorySlug: string }) => p.categorySlug === 'cassette'),
      ).toBe(true);
      expect((await request(app).get('/v1/posts?category=nope')).status).toBe(404);
      expect((await request(app).get('/v1/posts?category=drafty')).status).toBe(404);
    });

    it('filters by tag and 404s for unknown tags', async () => {
      await seedMany();
      const ok = await request(app).get('/v1/posts?tag=ambient');
      expect(ok.body.items).toHaveLength(1);
      expect((await request(app).get('/v1/posts?tag=nope')).status).toBe(404);
    });
  });

  describe('GET /v1/posts/by-slug/:slug', () => {
    it('finds a post by percent-encoded non-ASCII slug', async () => {
      await posts.create(makePostInput({ slug: 'david-bowie-★', title: 'david bowie – ★' }));
      const res = await request(app).get('/v1/posts/by-slug/david-bowie-%E2%98%85');
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('david bowie – ★');
    });

    it('404s for drafts and unknown slugs', async () => {
      await posts.create(makePostInput({ slug: 'secret', status: 'draft' }));
      expect((await request(app).get('/v1/posts/by-slug/secret')).status).toBe(404);
      expect((await request(app).get('/v1/posts/by-slug/nothing')).status).toBe(404);
    });
  });

  describe('GET /v1/posts/by-wp-id/:wpId', () => {
    it('returns category and slug', async () => {
      await posts.create(makePostInput({ slug: 'wp-post', wpId: 123 }));
      const res = await request(app).get('/v1/posts/by-wp-id/123');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ categorySlug: 'vinyl', slug: 'wp-post' });
    });

    it('404s for unknown, draft and non-numeric ids', async () => {
      await posts.create(makePostInput({ slug: 'wp-draft', wpId: 7, status: 'draft' }));
      expect((await request(app).get('/v1/posts/by-wp-id/999')).status).toBe(404);
      expect((await request(app).get('/v1/posts/by-wp-id/7')).status).toBe(404);
      expect((await request(app).get('/v1/posts/by-wp-id/abc')).status).toBe(404);
    });
  });

  describe('terms', () => {
    it('lists only non-empty categories with counts', async () => {
      await seedMany();
      const res = await request(app).get('/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([
        { slug: 'cassette', name: 'cassette', count: 2 },
        { slug: 'vinyl', name: 'vinyl', count: 10 },
      ]);
    });

    it('lists only non-empty tags with counts', async () => {
      await seedMany();
      const res = await request(app).get('/v1/tags');
      expect(res.body).toEqual([{ slug: 'ambient', name: 'ambient', count: 1 }]);
    });
  });

  describe('GET /v1/legacy-images/*path', () => {
    beforeEach(async () => {
      await photoIndex.put('2026/01/DSCF2087.jpg', 'abc123');
    });

    it('maps a sized legacy URL to the matching variant', async () => {
      const res = await request(app).get('/v1/legacy-images/2026/01/DSCF2087-300x300.jpg');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ url: `${IMAGE_BASE_URL}/photos/abc123/w300.jpg` });
    });

    it('maps an unsized legacy URL to the original', async () => {
      const res = await request(app).get('/v1/legacy-images/2026/01/DSCF2087.jpg');
      expect(res.body.url).toBe(`${IMAGE_BASE_URL}/photos/abc123/original.jpg`);
    });

    it('404s for unknown images', async () => {
      const res = await request(app).get('/v1/legacy-images/2026/01/missing.jpg');
      expect(res.status).toBe(404);
    });
  });

  it.each(['/v1/posts/by-slug/%E0%A4%A', '/v1/legacy-images/%E0%A4%A'])(
    'returns 400 for malformed escapes in %s',
    async (url) => {
      const res = await request(app).get(url);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('bad_request');
    },
  );

  it.each([
    '/v1/legacy-images/%2E%2E',
    '/v1/legacy-images/__x__',
    `/v1/legacy-images/${'a'.repeat(1600)}`,
  ])('returns 404 for image paths Firestore cannot store: %s', async (url) => {
    expect((await request(app).get(url)).status).toBe(404);
  });

  it('returns a JSON 404 for unmatched routes', async () => {
    const res = await request(app).get('/v1/nope');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });
});
