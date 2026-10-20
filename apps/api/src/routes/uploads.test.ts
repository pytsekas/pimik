import { variantPaths, type Photo } from '@vinyl/shared';
import type { Auth } from 'firebase-admin/auth';
import type { Express } from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createApp } from '../app.ts';
import { loadConfig } from '../config.ts';
import { initFirebase } from '../firebase.ts';
import { PhotoIndexRepo } from '../repo/photoIndex.ts';
import { PostRepo } from '../repo/posts.ts';
import { TermRepo } from '../repo/terms.ts';
import { PhotoStore } from '../storage/bucket.ts';
import { jpeg } from '../test/images.ts';
import { getIdToken, resetAuthEmulator } from '../test/idToken.ts';

const PROJECT_ID = 'vinyl-rehab-local';
const ADMIN_EMAIL = 'admin@example.com';
const MB = 1024 * 1024;

type TargetResult = {
  photoId: string;
  objectPath: string;
  upload: { url: string; method: string; headers: Record<string, string> };
};
type FileResult = TargetResult | { fileName: string; error: string };

describe('upload routes', () => {
  let app: Express;
  let auth: Auth;
  let store: PhotoStore;
  let idToken: string;

  beforeAll(async () => {
    const config = loadConfig({
      GCLOUD_PROJECT: PROJECT_ID,
      BUCKET: 'vinyl-rehab-uploads-test',
      IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-uploads-test',
      ADMIN_EMAILS: ADMIN_EMAIL,
      STORAGE_EMULATOR_HOST: 'http://localhost:4443',
    });
    store = new PhotoStore(config);
    await store.ensureBucket();
    const firebase = initFirebase(config);
    auth = firebase.auth;
    app = createApp({
      config,
      posts: new PostRepo(firebase.db),
      categories: new TermRepo(firebase.db, 'categories'),
      tags: new TermRepo(firebase.db, 'tags'),
      photoIndex: new PhotoIndexRepo(firebase.db),
      auth,
      photoStore: store,
      maxUploadBytes: 1 * MB,
    });
  });

  beforeEach(async () => {
    await resetAuthEmulator(PROJECT_ID);
    idToken = await getIdToken(auth, ADMIN_EMAIL);
  });

  const bearer = () => ({ Authorization: `Bearer ${idToken}` });

  async function requestTargets(
    files: { fileName: string; contentType: string; size: number }[],
  ): Promise<FileResult[]> {
    const res = await request(app).post('/v1/admin/uploads').set(bearer()).send({ files });
    expect(res.status).toBe(200);
    return res.body.files as FileResult[];
  }

  async function upload(target: TargetResult, body: Buffer): Promise<void> {
    const { url, method, headers } = target.upload;
    const res = await fetch(url, { method, headers, body: new Uint8Array(body) });
    expect(res.ok).toBe(true);
  }

  async function uploadAs(data: Buffer, declaredSize = data.length): Promise<TargetResult> {
    const [result] = await requestTargets([
      { fileName: 'a.jpg', contentType: 'image/jpeg', size: declaredSize },
    ]);
    const target = result as TargetResult;
    await upload(target, data);
    return target;
  }

  const complete = (photoId: string) =>
    request(app).post(`/v1/admin/uploads/${photoId}/complete`).set(bearer());

  it('requires an admin', async () => {
    const res = await request(app).post('/v1/admin/uploads').send({ files: [] });
    expect(res.status).toBe(401);
  });

  it('uploads directly to the bucket and builds variants on complete', async () => {
    const target = await uploadAs(await jpeg(2000, 1333), 1000);
    expect(target.objectPath).toBe(variantPaths(target.photoId).original);
    expect(target.upload.method).toBe('POST');

    const res = await complete(target.photoId);
    expect(res.status).toBe(200);
    const photo = res.body as Photo;
    expect(photo).toEqual({
      id: target.photoId,
      width: 2000,
      height: 1333,
      paths: variantPaths(target.photoId),
    });
    for (const path of Object.values(photo.paths)) {
      expect((await store.read(path)).length).toBeGreaterThan(0);
      expect((await fetch(store.publicUrl(path))).status).toBe(200);
    }
    // fake-gcs-server ignores cacheControl on metadata PATCH, so only written variants are checked.
    for (const path of [photo.paths.w1000, photo.paths.w300]) {
      const publicRes = await fetch(store.publicUrl(path));
      expect(publicRes.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
      expect(publicRes.headers.get('content-type')).toBe('image/jpeg');
    }
  });

  it('answers per file: target, unsupported_type or too_large', async () => {
    const results = await requestTargets([
      { fileName: 'a.jpg', contentType: 'image/jpeg', size: 500 * 1024 },
      { fileName: 'b.heic', contentType: 'image/heic', size: 1000 },
      { fileName: 'c.jpg', contentType: 'image/jpeg', size: 40 * MB },
    ]);
    expect(results[0]).toMatchObject({ upload: { method: 'POST' } });
    expect(results[1]).toEqual({ fileName: 'b.heic', error: 'unsupported_type' });
    expect(results[2]).toEqual({ fileName: 'c.jpg', error: 'too_large' });
  });

  it('gives every accepted file its own photo id', async () => {
    const file = { fileName: 'a.jpg', contentType: 'image/png', size: 10 };
    const [first, second] = (await requestTargets([file, file])) as TargetResult[];
    expect(first?.photoId).not.toBe(second?.photoId);
  });

  it('rejects an empty batch, more than 50 files and malformed bodies with 400', async () => {
    const file = { fileName: 'a.jpg', contentType: 'image/jpeg', size: 1 };
    for (const files of [[], Array.from({ length: 51 }, () => file)]) {
      const res = await request(app).post('/v1/admin/uploads').set(bearer()).send({ files });
      expect(res.status).toBe(400);
    }
    const res = await request(app).post('/v1/admin/uploads').set(bearer()).send({});
    expect(res.status).toBe(400);
  });

  it('answers 422 not_an_image and deletes the object when the bytes are not an image', async () => {
    const target = await uploadAs(Buffer.from('this is plain text, not a jpeg'));
    const res = await complete(target.photoId);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('not_an_image');
    expect(await store.size(target.objectPath)).toBeNull();
  });

  it('answers 422 too_large and deletes the object when the uploaded bytes exceed the limit', async () => {
    const target = await uploadAs(Buffer.alloc(2 * MB, 1), 1000);
    const res = await complete(target.photoId);
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('too_large');
    expect(await store.size(target.objectPath)).toBeNull();
  });

  it('answers 404 not_uploaded when nothing was uploaded', async () => {
    const res = await complete('neverthere');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_uploaded');
  });

  it('answers 400 for a malformed photo id', async () => {
    const res = await complete('bad.id');
    expect(res.status).toBe(400);
  });

  it('deletePhoto removes all three objects', async () => {
    const target = await uploadAs(await jpeg(1200, 800));
    await complete(target.photoId);
    const paths = Object.values(variantPaths(target.photoId));
    for (const path of paths) expect(await store.size(path)).not.toBeNull();

    await store.deletePhoto(target.photoId);

    for (const path of paths) expect(await store.size(path)).toBeNull();
  });
});
