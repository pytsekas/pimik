import { readFileSync } from 'node:fs';
import { createApp } from '@vinyl/api/app';
import { loadConfig } from '@vinyl/api/config';
import { initFirebase } from '@vinyl/api/firebase';
import { PhotoIndexRepo } from '@vinyl/api/repo/photoIndex';
import { PostRepo } from '@vinyl/api/repo/posts';
import { TermRepo } from '@vinyl/api/repo/terms';
import { PhotoStore } from '@vinyl/api/storage/bucket';
import request from 'supertest';
import sharp from 'sharp';
import { beforeAll, beforeEach, describe, expect, it } from 'vite-plus/test';
import { runImport, type ImportDeps } from './run.ts';

const PROJECT_ID = 'vinyl-rehab-import-test';
const BUCKET = 'vinyl-rehab-import-test';
const STORAGE_HOST = 'http://localhost:4443';
const BASE_URL = 'https://vinyl.rehab';

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function fixtureText(name: string): string {
  return readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
}

const POST_COUNT = (JSON.parse(fixtureText('posts-sample.json')) as unknown[]).length;

async function bucketObjects(): Promise<string[]> {
  const res = await fetch(`${STORAGE_HOST}/storage/v1/b/${BUCKET}/o`);
  const body = (await res.json()) as { items?: { name: string }[] };
  return (body.items ?? []).map((item) => item.name);
}

async function emptyBucket(): Promise<void> {
  for (const name of await bucketObjects()) {
    await fetch(`${STORAGE_HOST}/storage/v1/b/${BUCKET}/o/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    });
  }
}

describe('runImport', () => {
  const config = loadConfig({
    GCLOUD_PROJECT: PROJECT_ID,
    BUCKET,
    IMAGE_BASE_URL: `${STORAGE_HOST}/${BUCKET}`,
    ADMIN_EMAILS: 'admin@example.com',
    STORAGE_EMULATOR_HOST: STORAGE_HOST,
  });
  let store: PhotoStore;
  let deps: ImportDeps;
  let posts: PostRepo;
  let photoIndex: PhotoIndexRepo;
  let jpegBytes: Buffer;
  let imageRequests: string[];
  let failingImage: string | undefined;
  let logs: string[];

  const fakeFetch: typeof fetch = async (input) => {
    const url = urlOf(input);
    const { pathname } = new URL(url);
    const json = (name: string) =>
      new Response(fixtureText(name), { headers: { 'x-wp-totalpages': '1' } });
    if (pathname === '/wp-json/wp/v2/posts') return json('posts-sample.json');
    if (pathname === '/wp-json/wp/v2/categories') return json('categories.json');
    if (pathname === '/wp-json/wp/v2/tags') return json('tags.json');
    imageRequests.push(url);
    if (failingImage && url.endsWith(failingImage)) return new Response('nope', { status: 404 });
    return new Response(new Uint8Array(jpegBytes), { headers: { 'content-type': 'image/jpeg' } });
  };

  const run = () => runImport({ baseUrl: BASE_URL, fetchImpl: fakeFetch, deps });

  beforeAll(async () => {
    jpegBytes = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#888888' },
    })
      .jpeg()
      .toBuffer();
    store = new PhotoStore(config);
    await store.ensureBucket();
    const { db } = initFirebase(config);
    posts = new PostRepo(db);
    photoIndex = new PhotoIndexRepo(db);
    deps = {
      posts,
      categories: new TermRepo(db, 'categories'),
      tags: new TermRepo(db, 'tags'),
      photoIndex,
      store,
      backoffMs: 0,
      log: (message) => logs.push(message),
    };
  });

  beforeEach(async () => {
    imageRequests = [];
    failingImage = undefined;
    logs = [];
    const url = `http://localhost:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
    const res = await fetch(url, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Emulator reset failed with status ${res.status}`);
    await emptyBucket();
  });

  it('imports posts, photos and terms, and stays unchanged on a second run', async () => {
    const first = await run();
    expect(first.posts).toBe(POST_COUNT);
    expect(first.skipped).toBe(0);
    expect(first.failedImages).toBe(0);
    expect(first.photos).toBeGreaterThan(10);
    const objectsAfterFirst = await bucketObjects();
    expect(objectsAfterFirst).toHaveLength(first.photos * 3);
    const idsAfterFirst = (await posts.listAll()).map((post) => [
      post.id,
      post.photos.map((p) => p.id),
    ]);
    const requestsAfterFirst = imageRequests.length;

    const second = await run();
    expect(second).toMatchObject({ posts: POST_COUNT, photos: 0, skipped: 0 });
    expect(await bucketObjects()).toEqual(objectsAfterFirst);
    expect(imageRequests).toHaveLength(requestsAfterFirst);
    const idsAfterSecond = (await posts.listAll()).map((post) => [
      post.id,
      post.photos.map((p) => p.id),
    ]);
    expect(idsAfterSecond).toEqual(idsAfterFirst);
  });

  it('stores the mapped post fields and the wpId', async () => {
    await run();
    const bowie = await posts.getBySlug('david-bowie-★');
    expect(bowie).toMatchObject({
      wpId: 889,
      title: 'david bowie – ★',
      categorySlug: 'vinyl',
      status: 'published',
    });
    expect(bowie?.photos.length).toBeGreaterThanOrEqual(5);
    expect(bowie?.photos[0]).toMatchObject({
      wpPath: '2026/01/DSCF2087.jpg',
      width: 1200,
      height: 800,
    });
    const tags = await new TermRepo(initFirebase(config).db, 'tags').listAll();
    expect(tags.some((tag) => tag.slug === '12-2' && tag.name === '12"')).toBe(true);
  });

  it('serves imported photos through the legacy image route', async () => {
    await run();
    const { db, auth } = initFirebase(config);
    const app = createApp({
      config,
      posts,
      categories: new TermRepo(db, 'categories'),
      tags: new TermRepo(db, 'tags'),
      photoIndex,
      auth,
      photoStore: store,
    });
    const res = await request(app).get('/v1/legacy-images/2026/01/DSCF2087.jpg').expect(200);
    const bowie = await posts.getBySlug('david-bowie-★');
    expect(res.body.url).toBe(`${config.imageBaseUrl}/${bowie?.photos[0]?.paths.original}`);
  });

  it('imports a post without the image that cannot be downloaded', async () => {
    failingImage = '/2026/01/DSCF2088.jpg';
    const stats = await run();
    expect(stats.failedImages).toBe(1);
    expect(logs.some((line) => line.includes('DSCF2088.jpg'))).toBe(true);
    const bowie = await posts.getBySlug('david-bowie-★');
    expect(bowie?.photos.map((photo) => photo.wpPath)).not.toContain('2026/01/DSCF2088.jpg');
    expect(bowie?.photos.length).toBeGreaterThanOrEqual(4);
    expect(imageRequests.filter((url) => url.endsWith(failingImage!))).toHaveLength(3);
  });

  it('imports posts without images and counts them', async () => {
    const wp = JSON.parse(fixtureText('posts-sample.json')) as { content: { rendered: string } }[];
    const bare = wp.map((post) => ({ ...post, content: { rendered: '<p>hello</p>' } }));
    const bareFetch: typeof fetch = async (input, init) =>
      new URL(urlOf(input)).pathname === '/wp-json/wp/v2/posts'
        ? new Response(JSON.stringify(bare), { headers: { 'x-wp-totalpages': '1' } })
        : fakeFetch(input, init);
    const stats = await runImport({ baseUrl: BASE_URL, fetchImpl: bareFetch, deps });
    expect(stats).toMatchObject({ posts: POST_COUNT, photos: 0, noPhotos: POST_COUNT });
    expect((await posts.getBySlug('supersilent-14'))?.text).toBe('hello');
  });

  describe('hostile or broken image responses', () => {
    const MB = 1024 * 1024;
    const uploads = `${BASE_URL}/wp-content/uploads/2026/02`;

    /** Imports one post whose content is the given image URLs, answering image requests with `respond`. */
    async function importWithImages(
      urls: string[],
      respond: (url: string) => Response | Promise<Response>,
    ) {
      const wp = JSON.parse(fixtureText('posts-sample.json')) as {
        content: { rendered: string };
      }[];
      const html = urls
        .map((url) => `<figure class="wp-block-image"><img src="${url}" /></figure>`)
        .join('');
      const single = [{ ...wp[0], content: { rendered: html } }];
      const fetchImpl: typeof fetch = async (input, init) => {
        const url = urlOf(input);
        if (new URL(url).pathname === '/wp-json/wp/v2/posts') {
          return new Response(JSON.stringify(single), { headers: { 'x-wp-totalpages': '1' } });
        }
        if (url.includes('/wp-json/')) return fakeFetch(input, init);
        imageRequests.push(url);
        return respond(url);
      };
      return runImport({ baseUrl: BASE_URL, fetchImpl, deps });
    }

    it('never fetches an image from another host', async () => {
      const stats = await importWithImages(
        ['https://evil.example/wp-content/uploads/a.jpg'],
        () => {
          throw new Error('must not be fetched');
        },
      );
      expect(imageRequests).toEqual([]);
      expect(stats).toMatchObject({ posts: 1, photos: 0, failedImages: 1, noPhotos: 1 });
      expect(logs.some((line) => line.includes('evil.example'))).toBe(true);
    });

    it('accepts http links to the same site and fetches them over https', async () => {
      const stats = await importWithImages(
        ['http://vinyl.rehab/wp-content/uploads/2026/02/a.jpg'],
        () =>
          new Response(new Uint8Array(jpegBytes), { headers: { 'content-type': 'image/jpeg' } }),
      );
      expect(imageRequests).toEqual([`${uploads}/a.jpg`]);
      expect(stats).toMatchObject({ photos: 1, failedImages: 0 });
    });

    it('does not follow a redirect to another host', async () => {
      const stats = await importWithImages([`${uploads}/a.jpg`], (url) =>
        url.startsWith(BASE_URL)
          ? new Response(null, {
              status: 302,
              headers: { location: 'https://evil.example/x.jpg' },
            })
          : new Response('should not be requested', { status: 200 }),
      );
      expect(imageRequests).toEqual([`${uploads}/a.jpg`]);
      expect(stats).toMatchObject({ photos: 0, failedImages: 1 });
    });

    it('follows a redirect within the site', async () => {
      const stats = await importWithImages([`${uploads}/a.jpg`], (url) =>
        url.endsWith('/a.jpg')
          ? new Response(null, { status: 301, headers: { location: '/wp-content/uploads/b.jpg' } })
          : new Response(new Uint8Array(jpegBytes), { headers: { 'content-type': 'image/jpeg' } }),
      );
      expect(stats).toMatchObject({ photos: 1, failedImages: 0 });
    });

    it('rejects a response that is not an image, without retrying', async () => {
      const stats = await importWithImages(
        [`${uploads}/a.jpg`],
        () => new Response('<html></html>', { headers: { 'content-type': 'text/html' } }),
      );
      expect(imageRequests).toHaveLength(1);
      expect(stats).toMatchObject({ photos: 0, failedImages: 1 });
      expect(logs.some((line) => line.includes('not an image'))).toBe(true);
    });

    it('rejects an image whose Content-Length is above 30 MB', async () => {
      const stats = await importWithImages(
        [`${uploads}/a.jpg`],
        () =>
          new Response(new Uint8Array(10), {
            headers: { 'content-type': 'image/jpeg', 'content-length': String(31 * MB) },
          }),
      );
      expect(stats).toMatchObject({ photos: 0, failedImages: 1 });
      expect(logs.some((line) => line.includes('too large'))).toBe(true);
    });

    it('stops reading a body that grows past 30 MB without declaring its size', async () => {
      let sent = 0;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          sent += 1;
          controller.enqueue(new Uint8Array(MB));
          if (sent > 100) controller.close();
        },
      });
      const stats = await importWithImages(
        [`${uploads}/a.jpg`],
        () => new Response(body, { headers: { 'content-type': 'image/jpeg' } }),
      );
      expect(stats).toMatchObject({ photos: 0, failedImages: 1 });
      expect(sent).toBeLessThan(60);
    });
  });
});
