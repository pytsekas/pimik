import request from 'supertest';
import { describe, expect, it } from 'vite-plus/test';
import { createApp } from './app.ts';
import { loadConfig } from './config.ts';
import { initFirebase } from './firebase.ts';
import { PhotoIndexRepo } from './repo/photoIndex.ts';
import { PostRepo } from './repo/posts.ts';
import { TermRepo } from './repo/terms.ts';
import { stubPhotoStore } from './test/photoStore.ts';

const baseEnv = {
  GCLOUD_PROJECT: 'vinyl-rehab-local',
  BUCKET: 'vinyl-rehab-photos',
  IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-photos',
  ADMIN_EMAILS: 'marko.pytsep@iglu.ee',
};

describe('GET /health', () => {
  it('returns ok', async () => {
    const config = loadConfig(baseEnv);
    const { db, auth } = initFirebase(config);
    const app = createApp({
      config,
      posts: new PostRepo(db),
      categories: new TermRepo(db, 'categories'),
      tags: new TermRepo(db, 'tags'),
      photoIndex: new PhotoIndexRepo(db),
      auth,
      photoStore: stubPhotoStore(),
    });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});

describe('loadConfig', () => {
  it('throws listing the missing BUCKET', () => {
    expect(() => loadConfig({})).toThrow(/BUCKET/);
  });

  it('splits and trims ADMIN_EMAILS', () => {
    const config = loadConfig({ ...baseEnv, ADMIN_EMAILS: 'a@x.ee, b@x.ee' });
    expect(config.adminEmails).toEqual(['a@x.ee', 'b@x.ee']);
  });

  it('rejects ADMIN_EMAILS that is empty after trimming', () => {
    expect(() => loadConfig({ ...baseEnv, ADMIN_EMAILS: ' , ' })).toThrow(/ADMIN_EMAILS/);
  });

  it('rejects IMAGE_BASE_URL that is not a URL', () => {
    expect(() => loadConfig({ ...baseEnv, IMAGE_BASE_URL: 'not a url' })).toThrow(/IMAGE_BASE_URL/);
  });

  it('applies defaults and optional emulator host', () => {
    const config = loadConfig({ ...baseEnv, STORAGE_EMULATOR_HOST: 'http://localhost:4443' });
    expect(config.port).toBe(3001);
    expect(config.storageEmulatorHost).toBe('http://localhost:4443');
    expect(loadConfig(baseEnv).storageEmulatorHost).toBeUndefined();
  });
});
