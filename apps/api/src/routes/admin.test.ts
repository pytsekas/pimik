import { variantPaths, type Photo } from '@vinyl/shared';
import type { Auth } from 'firebase-admin/auth';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { initFirebase } from '../firebase.ts';
import { PhotoIndexRepo } from '../repo/photoIndex.ts';
import { PostRepo } from '../repo/posts.ts';
import { TermRepo } from '../repo/terms.ts';
import { makePostInput } from '../test/factory.ts';
import { getIdToken, resetAuthEmulator } from '../test/idToken.ts';
import { resetEmulator } from '../test/reset.ts';

const PROJECT_ID = 'vinyl-rehab-local';
const ADMIN_EMAIL = 'Admin@Example.com';

function photo(id: string): Photo {
  return { id, width: 2000, height: 1500, paths: variantPaths(id) };
}

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'first',
    title: 'First',
    categorySlug: 'vinyl',
    tagSlugs: [],
    publishedAt: '2024-03-01',
    status: 'published',
    photos: [photo('p1')],
    ...overrides,
  };
}

describe('admin routes', () => {
  let app: Express;
  let auth: Auth;
  let posts: PostRepo;
  let categories: TermRepo;
  let tags: TermRepo;
  let token: string;
  const deletePhoto = vi.fn<(photoId: string) => Promise<void>>();

  beforeAll(() => {
    const config = loadConfig({
      GCLOUD_PROJECT: PROJECT_ID,
      BUCKET: 'vinyl-rehab-photos',
      IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-photos',
      ADMIN_EMAILS: ADMIN_EMAIL.toLowerCase(),
    });
    const firebase = initFirebase(config);
    auth = firebase.auth;
    posts = new PostRepo(firebase.db);
    categories = new TermRepo(firebase.db, 'categories');
    tags = new TermRepo(firebase.db, 'tags');
    app = createApp({
      config,
      posts,
      categories,
      tags,
      photoIndex: new PhotoIndexRepo(firebase.db),
      auth,
      photoStore: { deletePhoto },
    });
  });

  beforeEach(async () => {
    await resetEmulator(PROJECT_ID);
    await resetAuthEmulator(PROJECT_ID);
    deletePhoto.mockReset();
    deletePhoto.mockResolvedValue(undefined);
    token = await getIdToken(auth, ADMIN_EMAIL);
  });

  const bearer = () => ({ Authorization: `Bearer ${token}` });

  describe('auth', () => {
    it('rejects a missing token with 401', async () => {
      const res = await request(app).get('/v1/admin/posts');
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'unauthorized' });
    });

    it('rejects a malformed token with 401', async () => {
      const res = await request(app).get('/v1/admin/posts').set('Authorization', 'Bearer junk');
      expect(res.status).toBe(401);
    });

    it('rejects a non-allowlisted email with 403', async () => {
      const stranger = await getIdToken(auth, 'stranger@x.ee');
      const res = await request(app)
        .get('/v1/admin/posts')
        .set('Authorization', `Bearer ${stranger}`);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ error: 'forbidden' });
    });

    it('rejects an allowlisted but unverified email with 403', async () => {
      await resetAuthEmulator(PROJECT_ID);
      const unverified = await getIdToken(auth, ADMIN_EMAIL, false);
      const res = await request(app)
        .get('/v1/admin/posts')
        .set('Authorization', `Bearer ${unverified}`);
      expect(res.status).toBe(403);
    });

    it('accepts an allowlisted email, ignoring case', async () => {
      const res = await request(app).get('/v1/admin/posts').set(bearer());
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('reads', () => {
    it('lists drafts and fetches a post by id', async () => {
      const draft = await posts.create(makePostInput({ slug: 'd', status: 'draft' }));
      const list = await request(app).get('/v1/admin/posts').set(bearer());
      expect(list.body.map((p: { id: string }) => p.id)).toEqual([draft.id]);
      const one = await request(app).get(`/v1/admin/posts/${draft.id}`).set(bearer());
      expect(one.status).toBe(200);
      expect(one.body.slug).toBe('d');
      const missing = await request(app).get('/v1/admin/posts/nope').set(bearer());
      expect(missing.status).toBe(404);
    });
  });

  describe('POST /v1/admin/posts', () => {
    it('creates a post and upserts the new category and tag names', async () => {
      const res = await request(app)
        .post('/v1/admin/posts')
        .set(bearer())
        .send(
          body({
            categorySlug: 'ignored-when-name-given',
            categoryName: 'Tape Loops',
            tagNames: ['Drone Music'],
            tagSlugs: ['ambient'],
          }),
        );
      expect(res.status).toBe(201);
      expect(res.body.categorySlug).toBe('tape-loops');
      expect(res.body.tagSlugs.sort()).toEqual(['ambient', 'drone-music']);
      expect(res.body).not.toHaveProperty('categoryName');
      expect(res.body).not.toHaveProperty('tagNames');

      const cats = await request(app).get('/v1/admin/categories').set(bearer());
      expect(cats.body).toContainEqual({ slug: 'tape-loops', name: 'Tape Loops' });
      const tagList = await request(app).get('/v1/admin/tags').set(bearer());
      expect(tagList.body).toContainEqual({ slug: 'drone-music', name: 'Drone Music' });
    });

    it('rejects an unknown categorySlug with 400 unknown_category', async () => {
      const res = await request(app)
        .post('/v1/admin/posts')
        .set(bearer())
        .send(body({ categorySlug: 'ghost' }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('unknown_category');
    });

    it('accepts an existing categorySlug', async () => {
      await categories.upsert([{ slug: 'vinyl', name: 'Vinyl' }]);
      const res = await request(app).post('/v1/admin/posts').set(bearer()).send(body());
      expect(res.status).toBe(201);
    });

    it('returns 409 slug_taken for an existing slug', async () => {
      await categories.upsert([{ slug: 'vinyl', name: 'Vinyl' }]);
      await request(app).post('/v1/admin/posts').set(bearer()).send(body());
      const res = await request(app).post('/v1/admin/posts').set(bearer()).send(body());
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('slug_taken');
    });

    it('returns 400 with zod issues for empty photos', async () => {
      const res = await request(app)
        .post('/v1/admin/posts')
        .set(bearer())
        .send(body({ photos: [] }));
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_input');
      expect(res.body.message).toBe('Invalid input');
      expect(Array.isArray(res.body.issues)).toBe(true);
      expect(res.body.issues.length).toBeGreaterThan(0);
    });

    it('overwrites client-supplied photo paths with server-derived ones', async () => {
      await categories.upsert([{ slug: 'vinyl', name: 'Vinyl' }]);
      const evil = {
        ...photo('p1'),
        paths: { ...variantPaths('p1'), original: 'photos/someone-else/original.jpg' },
      };
      const res = await request(app)
        .post('/v1/admin/posts')
        .set(bearer())
        .send(body({ photos: [evil] }));
      expect(res.status).toBe(201);
      expect(res.body.photos[0].paths).toEqual(variantPaths('p1'));
    });

    it('rejects photo ids outside the allowed alphabet', async () => {
      await categories.upsert([{ slug: 'vinyl', name: 'Vinyl' }]);
      const res = await request(app)
        .post('/v1/admin/posts')
        .set(bearer())
        .send(body({ photos: [photo('../evil')] }));
      expect(res.status).toBe(400);
    });
  });

  describe('PUT /v1/admin/posts/:id', () => {
    async function seedThreePhotos() {
      await categories.upsert([{ slug: 'vinyl', name: 'Vinyl' }]);
      return posts.create(
        makePostInput({ slug: 'three', photos: [photo('a'), photo('b'), photo('c')] }),
      );
    }

    it('deletes only the removed photo from storage', async () => {
      const post = await seedThreePhotos();
      const res = await request(app)
        .put(`/v1/admin/posts/${post.id}`)
        .set(bearer())
        .send(body({ slug: 'three', photos: [photo('a'), photo('c')] }));
      expect(res.status).toBe(200);
      expect(res.body.photos.map((p: Photo) => p.id)).toEqual(['a', 'c']);
      expect(deletePhoto).toHaveBeenCalledTimes(1);
      expect(deletePhoto).toHaveBeenCalledWith('b');
    });

    it('returns 409 on slug clash and deletes nothing', async () => {
      const post = await seedThreePhotos();
      await posts.create(makePostInput({ slug: 'other' }));
      const res = await request(app)
        .put(`/v1/admin/posts/${post.id}`)
        .set(bearer())
        .send(body({ slug: 'other', photos: [photo('a')] }));
      expect(res.status).toBe(409);
      expect(deletePhoto).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown id', async () => {
      await categories.upsert([{ slug: 'vinyl', name: 'Vinyl' }]);
      const res = await request(app).put('/v1/admin/posts/nope').set(bearer()).send(body());
      expect(res.status).toBe(404);
    });

    it('still succeeds when storage deletion fails', async () => {
      const post = await seedThreePhotos();
      deletePhoto.mockRejectedValue(new Error('gcs down'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const res = await request(app)
        .put(`/v1/admin/posts/${post.id}`)
        .set(bearer())
        .send(body({ slug: 'three', photos: [photo('a')] }));
      expect(res.status).toBe(200);
      errorSpy.mockRestore();
    });
  });

  describe('DELETE /v1/admin/posts/:id', () => {
    it('removes the post and every photo', async () => {
      const post = await posts.create(
        makePostInput({ slug: 'gone', photos: [photo('a'), photo('b')] }),
      );
      const res = await request(app).delete(`/v1/admin/posts/${post.id}`).set(bearer());
      expect(res.status).toBe(204);
      const after = await request(app).get('/v1/posts/by-slug/gone');
      expect(after.status).toBe(404);
      expect(deletePhoto.mock.calls.map((c) => c[0]).sort()).toEqual(['a', 'b']);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await request(app).delete('/v1/admin/posts/nope').set(bearer());
      expect(res.status).toBe(404);
      expect(deletePhoto).not.toHaveBeenCalled();
    });
  });
});
