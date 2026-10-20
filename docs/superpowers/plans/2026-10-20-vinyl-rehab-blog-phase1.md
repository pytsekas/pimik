# Vinyl Rehab Blog — Phase 1 (localhost) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A self-built replacement for the vinyl.rehab WordPress blog — server-rendered Vue public site, Express API, photo uploads to Cloud Storage, WordPress import — running fully on localhost against emulators.

**Architecture:** pnpm monorepo managed by Vite+ with two apps: `apps/web` (Express server doing Vue 3 SSR for the public site, plus a client-only `/admin` SPA) and `apps/api` (Express JSON API, the only component touching Firestore and Cloud Storage). Shared types/validation in `packages/shared`; the one-off importer in `scripts/import-wordpress`. Locally, Firestore and Auth run in the Firebase emulator and Cloud Storage in `fake-gcs-server`; the code paths are the production SDKs, switched by environment variables.

**Tech Stack:** Node 24, TypeScript, Vite+ (`vp`, Vitest via `vite-plus/test`), Vue 3.5 + vue-router 5 + @unhead/vue, Express 5, firebase-admin 14, firebase (client SDK), @google-cloud/storage 8, sharp, zod, markdown-it, devalue, supertest, @vue/test-utils, Playwright, firebase-tools (emulators), Docker (fake-gcs-server).

**Spec:** `docs/superpowers/specs/2026-10-20-vinyl-rehab-blog-design.md`

## Global Constraints

- TypeScript everywhere (Claude's call; the owner said "JavaScript: Vue, Express, Vite+").
- Lint/format/test through Vite+: `vp check` and `vp test` must pass at the end of every task.
- Ports: web `3000`, api `3001`, Firestore emulator `8080`, Auth emulator `9099`, Emulator UI `4000`, fake-gcs `4443`.
- All endpoints, project id, bucket name and admin allowlist come from env vars (see Task 1 `.env.example`); no hardcoded hosts in app code.
- Posts per page: **10**, newest first by `publishedAt`.
- Big photo: `width:100%; max-width:2000px`, centred, **never cropped** (natural aspect ratio, `width`/`height` attributes set).
- Image variants: `original` (as uploaded, 2000px wide), `w1000` (1000px wide), `w300` (300px wide); JPEG quality 85 for variants; never upscale.
- Look: background `#6d6d6d`, headings `Patua One`, body `Droid Sans` (Google Fonts), accent `#ecae80`, dark text `#2C3033`, site name "Vinyl Rehab", tagline "music is my radar". All colours/fonts as CSS variables in one file.
- Date shown as `YYYY-MM-DD`.
- Public URLs: `/`, `/page/{n}/`, `/category/{slug}/[page/{n}/]`, `/tag/{slug}/[page/{n}/]`, `/{category}/{slug}/`, all with trailing slash (requests without it 301 to the slashed form).
- Drafts never reachable publicly. Empty categories/tags never listed publicly.
- Admin access only for emails in `ADMIN_EMAILS`; everyone else 403.

## Review Focus

1. **Encoded / non-ASCII slugs** — `/vinyl/david-bowie-%e2%98%85/` must render the Bowie post (stored slug `david-bowie-★`). Test in Task 4 and Task 9.
2. **Out-of-range or junk pagination** — `/page/99/`, `/page/0/`, `/page/abc/`, `/category/nope/` → 404, not an empty page or a crash. Test in Task 4 and Task 9.
3. **Bad upload file** — a non-JPEG/PNG/WebP file (e.g. `.heic`, `.txt`) or a file over 30 MB is rejected for that file only; the rest of the batch continues and the admin shows the per-file error. Test in Task 6 and Task 11.
4. **Slug collision** — publishing a second post with an existing slug returns 409 and the admin shows "address already in use" without losing form data. Test in Task 5 and Task 11.
5. **Saving while uploads are running** — Save/Publish are disabled until every photo is uploaded and processed (or failed and removed); a post can't be saved with half-processed photos. Test in Task 11.

---

## File Structure

```
package.json                 root scripts: dev, test, check, import
pnpm-workspace.yaml
vite.config.ts               Vite+ root: lint (typeAware, typeCheck), fmt, run tasks
tsconfig.base.json
docker-compose.yml           fake-gcs-server
firebase.json                emulators: firestore 8080, auth 9099, ui 4000
firestore.indexes.json       composite indexes (used in phase 2; kept in sync now)
.env.example
packages/shared/src/
  types.ts                   Post, Photo, PostSummary, Term, Page<T>
  schemas.ts                 zod PostInput, UploadRequest
  slugify.ts
  images.ts                  pickVariant(), variantPath(), parseWpImagePath()
apps/api/src/
  config.ts                  env parsing (zod)
  app.ts                     createApp(deps) → express app
  server.ts                  listen
  firebase.ts                firebase-admin init (emulator-aware)
  repo/posts.ts              PostRepo (Firestore)
  repo/terms.ts              TermRepo (categories, tags)
  storage/bucket.ts          PhotoStore (GCS / fake-gcs)
  images/variants.ts         makeVariants(buffer)
  routes/public.ts
  routes/admin.ts
  routes/uploads.ts
  auth.ts                    requireAdmin middleware
  errors.ts                  error handler → { error, message } JSON
apps/web/
  index.html
  server.ts                  Express: Vite middleware (dev) / static (prod), SSR, redirects, feed, sitemap
  src/entry-client.ts
  src/entry-server.ts        render(url, apiClient) → { html, head, state, status }
  src/router.ts
  src/api.ts                 ApiClient (fetch wrapper; server + browser)
  src/pageData.ts            route loaders + usePageData()
  src/styles/theme.css       CSS variables
  src/components/            SiteHeader, PostEntry, ThumbStrip, Lightbox, Pager
  src/pages/                 ListPage, PostPage, NotFound
  src/admin/                 AdminApp, auth.ts, PostsList, PostForm, PhotoGrid, useUploads.ts
  src/legacy.ts              legacy URL → redirect target
  src/feed.ts, src/sitemap.ts
scripts/import-wordpress/
  parse.ts                   WP REST post → ImportedPost (pure)
  run.ts                     fetch all, upload images, upsert
  fixtures/                  saved WP JSON for tests
e2e/admin.spec.ts            Playwright
```

---

### Task 1: Monorepo scaffold, emulators and health endpoints

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `tsconfig.base.json`, `docker-compose.yml`, `firebase.json`, `firestore.indexes.json`, `.env.example`, `apps/api/package.json`, `apps/api/src/{config,app,server}.ts`, `apps/web/package.json`, `apps/web/server.ts`, `apps/web/index.html`, `apps/web/src/entry-{client,server}.ts`, `packages/shared/package.json`, `packages/shared/src/index.ts`, `README.md` (replace)
- Test: `apps/api/src/app.test.ts`, `apps/web/server.test.ts`

**Interfaces:**
- Produces: `loadConfig(env = process.env): Config` in `apps/api/src/config.ts` with `Config = { port, projectId, bucket, imageBaseUrl, adminEmails: string[], storageEmulatorHost?: string }`; `createApp(deps: AppDeps): Express` in `apps/api/src/app.ts` (deps grow in later tasks); `GET /health → 200 {"status":"ok"}` on both apps.
- Env vars (`.env.example`, exact names): `GCLOUD_PROJECT=vinyl-rehab-local`, `FIRESTORE_EMULATOR_HOST=localhost:8080`, `FIREBASE_AUTH_EMULATOR_HOST=localhost:9099`, `STORAGE_EMULATOR_HOST=http://localhost:4443`, `BUCKET=vinyl-rehab-photos`, `IMAGE_BASE_URL=http://localhost:4443/vinyl-rehab-photos`, `ADMIN_EMAILS=marko.pytsep@iglu.ee`, `API_PORT=3001`, `WEB_PORT=3000`, `API_URL=http://localhost:3001`, `VITE_FIREBASE_API_KEY=fake-api-key`, `VITE_FIREBASE_AUTH_EMULATOR_URL=http://localhost:9099`.

- [ ] **Step 1:** Scaffold with `vp create vite:monorepo --no-interactive` (pnpm), then shape it to the File Structure; root `vite.config.ts` sets `lint.options = { typeAware: true, typeCheck: true }`.
- [ ] **Step 2:** `docker-compose.yml`: service `gcs` image `fsouza/fake-gcs-server:1.52`, command `-scheme http -port 4443 -public-host localhost:4443 -backend memory`, port `4443:4443`. `firebase.json`: emulators firestore 8080, auth 9099, ui 4000, `singleProjectMode: true`. Add `firebase-tools` as root devDependency.
- [ ] **Step 3:** Root scripts: `dev` = `docker compose up -d && firebase emulators:start --project vinyl-rehab-local` in parallel with `vp run -r --parallel dev`; `test` = `firebase emulators:exec --project vinyl-rehab-local --only firestore,auth "vp run -r test"` (requires `docker compose up -d`); `check` = `vp check`. API `dev` uses `node --watch --env-file=../../.env src/server.ts` (Node 24 strips types).
- [ ] **Step 4: Write failing tests** — `app.test.ts`: `request(createApp(testDeps)).get('/health')` → status 200, body `{status:'ok'}`. `loadConfig({})` throws listing missing `BUCKET`; `loadConfig({...env, ADMIN_EMAILS:'a@x.ee, b@x.ee'}).adminEmails` equals `['a@x.ee','b@x.ee']`. `server.test.ts`: web `/health` → 200.
- [ ] **Step 5:** Run `pnpm test` → FAIL; implement; run → PASS; `vp check` → no errors.
- [ ] **Step 6:** README: prerequisites (Node 24, pnpm, Docker, Java 21+ for emulators), `cp .env.example .env`, `pnpm install`, `pnpm dev`, `pnpm test`.
- [ ] **Step 7: Commit** `chore: scaffold monorepo with api, web and local emulators`

---

### Task 2: Shared types, validation, slugify and image helpers

**Files:**
- Create: `packages/shared/src/{types,schemas,slugify,images}.ts`
- Test: `packages/shared/src/{schemas,slugify,images}.test.ts`

**Interfaces:**
- Produces (exported from `@vinyl/shared`):
  - `type Photo = { id: string; width: number; height: number; paths: { original: string; w1000: string; w300: string }; wpPath?: string }`
  - `type PostStatus = 'draft' | 'published'`
  - `type Post = { id: string; slug: string; title: string; categorySlug: string; tagSlugs: string[]; discogsUrl?: string; text?: string; publishedAt: string /* YYYY-MM-DD */; status: PostStatus; photos: Photo[]; wpId?: number; createdAt: string; updatedAt: string }`
  - `type Term = { slug: string; name: string; count?: number }`
  - `type Page<T> = { items: T[]; page: number; totalPages: number }`
  - `PostInput` zod schema = Post minus `id/createdAt/updatedAt/wpId`, plus `categoryName?`, `tagNames?: string[]` (for new terms); `title` 1–200 chars; `slug` is a non-empty string without `/`, `?`, `#` or whitespace (so imported slugs like `david-bowie-★` stay valid); `discogsUrl` must be `https://(www.)?discogs.com/...` or empty; `photos` min 1.
  - `slugify(text: string): string`
  - `type VariantName = 'original' | 'w1000' | 'w300'`
  - `variantPaths(photoId: string): Photo['paths']` → `photos/{photoId}/original.jpg`, `.../w1000.jpg`, `.../w300.jpg`
  - `parseWpImagePath(path: string): { basePath: string; requestedWidth?: number }` — strips `-{w}x{h}` before the extension.
  - `pickVariant(requestedWidth?: number): VariantName` — undefined → `original`; ≤300 → `w300`; ≤1000 → `w1000`; else `original`.

- [ ] **Step 1: Write failing tests**
  - `slugify('Ajukaja & Ats – Soome Papp')` === `'ajukaja-ats-soome-papp'`; `slugify('depeche mode – useless / home')` === `'depeche-mode-useless-home'`; `slugify('Ytterlännäs gamla kyrka')` === `'ytterlannas-gamla-kyrka'`; `slugify('  --x--  ')` === `'x'`.
  - `parseWpImagePath('2026/01/DSCF2087-300x300.jpg')` → `{ basePath: '2026/01/DSCF2087.jpg', requestedWidth: 300 }`; `parseWpImagePath('2026/01/DSCF2087.jpg')` → `{ basePath: '2026/01/DSCF2087.jpg' }`.
  - `pickVariant(150)`→`w300`, `pickVariant(768)`→`w1000`, `pickVariant(1536)`→`original`, `pickVariant()`→`original`.
  - `PostInput.safeParse` rejects empty title, slug `'a/b'`, `discogsUrl:'https://evil.com'`, `photos: []`; accepts a valid post with slug `'david-bowie-★'`.
- [ ] **Step 2:** `vp test` in `packages/shared` → FAIL. Implement (slugify: NFKD, drop combining marks, lowercase, non-`[a-z0-9]` runs → `-`, trim `-`). → PASS.
- [ ] **Step 3: Commit** `feat(shared): post types, validation, slugify, image variant helpers`

---

### Task 3: API Firestore repositories

**Files:**
- Create: `apps/api/src/firebase.ts`, `apps/api/src/repo/posts.ts`, `apps/api/src/repo/terms.ts`, `apps/api/src/test/reset.ts`
- Modify: `firestore.indexes.json`
- Test: `apps/api/src/repo/posts.test.ts`, `apps/api/src/repo/terms.test.ts`

**Interfaces:**
- Consumes: `Post`, `Term`, `Page` from Task 2.
- Produces:
  - `initFirebase(config: Config): { db: Firestore; auth: Auth }`
  - `class PostRepo(db)`:
    - `listPublished(opts: { page: number; category?: string; tag?: string }): Promise<Page<Post>>` — 10 per page, `publishedAt desc` then `createdAt desc`; offset pagination; `totalPages` from `count()`.
    - `listAll(): Promise<Post[]>` (admin, incl. drafts, newest first)
    - `getById(id): Promise<Post | null>`; `getBySlug(slug): Promise<Post | null>`; `getByWpId(wpId): Promise<Post | null>`
    - `create(input: Omit<Post,'id'|'createdAt'|'updatedAt'>): Promise<Post>` — throws `SlugTakenError` if slug exists (check in a transaction against `slugs/{slug}` doc)
    - `update(id, input): Promise<Post>` — same slug rule; frees old slug doc on change
    - `delete(id): Promise<Post | null>` — returns deleted post (caller removes photos)
  - `class TermRepo(db, kind: 'categories' | 'tags')`: `upsert(terms: Term[])`, `get(slug)`, `listNonEmpty(): Promise<Term[]>` (count = published posts using it; sort by name), `listAll(): Promise<Term[]>`.
  - `resetEmulator(projectId)` test helper: `DELETE http://localhost:8080/emulator/v1/projects/{id}/databases/(default)/documents`.
- Indexes: `posts(status ASC, publishedAt DESC, createdAt DESC)`, `posts(status, categorySlug, publishedAt DESC, createdAt DESC)`, `posts(status, tagSlugs CONTAINS, publishedAt DESC, createdAt DESC)`.

- [ ] **Step 1: Write failing tests** (run against Firestore emulator; `beforeEach(resetEmulator)`):
  - 23 published posts + 2 drafts → `listPublished({page:1})` has 10 items, `totalPages` 3, first item is the newest; page 3 has 3 items; no drafts appear in any page.
  - `listPublished({page:1, category:'cassette'})` returns only cassette posts; `{tag:'ambient'}` only posts whose `tagSlugs` contain `ambient`.
  - `create` twice with slug `'x'` → second rejects with `SlugTakenError`; `update` of post A to post B's slug rejects; after updating A's slug from `'a'` to `'a2'`, creating a new post with slug `'a'` succeeds.
  - `getBySlug('david-bowie-★')` finds the post created with that slug.
  - `TermRepo.listNonEmpty()` omits a category whose only post is a draft and a category with no posts; counts are correct.
- [ ] **Step 2:** `pnpm test` → FAIL; implement; → PASS.
- [ ] **Step 3: Commit** `feat(api): Firestore post and term repositories`

---

### Task 4: API public routes

**Files:**
- Create: `apps/api/src/routes/public.ts`, `apps/api/src/errors.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/public.test.ts`

**Interfaces:**
- Consumes: `PostRepo`, `TermRepo` (Task 3).
- Produces (JSON; `Post` shapes from Task 2; drafts excluded):
  - `GET /v1/posts?page=1&category=&tag=` → `Page<Post>`; `page` must be integer ≥1 else 400; `page > totalPages` (and totalPages>0) → 404; unknown `category`/`tag` → 404.
  - `GET /v1/posts/by-slug/:slug` → `Post` or 404 (slug decoded by Express).
  - `GET /v1/posts/by-wp-id/:wpId` → `{ categorySlug, slug }` or 404.
  - `GET /v1/categories` and `GET /v1/tags` → `Term[]` non-empty only, with `count`.
  - `GET /v1/legacy-images/*path` → `{ url }` where url = `IMAGE_BASE_URL/` + chosen variant path, or 404. Needs lookup `wpImages/{basePath with '/' → '__'}` → `{ photoId }` (written by importer, Task 7); add `PhotoIndexRepo` with `get(basePath)` / `put(basePath, photoId)` in `apps/api/src/repo/photoIndex.ts`.
  - Error body format everywhere: `{ "error": "<code>", "message": "<text>" }`.

- [ ] **Step 1: Write failing tests** (supertest + emulator, seeded):
  - `/v1/posts?page=1` → 10 items; `?page=99` → 404; `?page=0` and `?page=abc` → 400.
  - `/v1/posts?category=nope` → 404; `?category=cassette` → only cassette.
  - `/v1/posts/by-slug/david-bowie-%E2%98%85` → 200 title `david bowie – ★`; a draft's slug → 404.
  - `/v1/posts/by-wp-id/123` → `{categorySlug:'vinyl', slug:'…'}`.
  - `/v1/legacy-images/2026/01/DSCF2087-300x300.jpg` → url ending `photos/{photoId}/w300.jpg`; `/v1/legacy-images/2026/01/missing.jpg` → 404.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(api): public post, term and legacy image endpoints`

---

### Task 5: API admin auth and post CRUD

**Files:**
- Create: `apps/api/src/auth.ts`, `apps/api/src/routes/admin.ts`, `apps/api/src/test/idToken.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/api/src/routes/admin.test.ts`

**Interfaces:**
- Consumes: `PostRepo`, `TermRepo`, `PostInput`, `slugify`.
- Produces:
  - `requireAdmin(auth: Auth, adminEmails: string[]): RequestHandler` — `Authorization: Bearer <Firebase ID token>`; missing/invalid → 401; email not in list or not verified → 403.
  - `GET /v1/admin/posts` → `Post[]` (drafts included); `GET /v1/admin/posts/:id`.
  - `GET /v1/admin/categories`, `GET /v1/admin/tags` → all `Term[]` (for dropdown/autocomplete).
  - `POST /v1/admin/posts` (body `PostInput`) → 201 `Post`; `PUT /v1/admin/posts/:id` → 200 `Post`; slug taken → 409 `{error:'slug_taken'}`; invalid → 400 with zod issues. New category/tag names are upserted into `TermRepo` (slug = `slugify(name)`).
  - `DELETE /v1/admin/posts/:id` → 204; removes photos via `PhotoStore.deletePhoto(photoId)` (Task 6 — inject; until then a no-op stub in deps).
  - On `PUT`, photos present before but absent after are deleted from storage.
  - Test helper `getIdToken(email): Promise<string>` — `auth.createUser({email, emailVerified:true})`, `createCustomToken`, exchange via `POST http://localhost:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`.

- [ ] **Step 1: Write failing tests**
  - No token → 401; token for `stranger@x.ee` → 403; token for allowlisted email → 200.
  - `POST` valid post with `categoryName:'Tape Loops'` → 201 and `/v1/admin/categories` contains `{slug:'tape-loops', name:'Tape Loops'}`.
  - `POST` with existing slug → 409 `slug_taken`; with `photos:[]` → 400.
  - `PUT` removing one of three photos → stub `deletePhoto` called once with that photo id.
  - `DELETE` → 204, then `/v1/posts/by-slug/…` → 404, `deletePhoto` called for each photo.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(api): admin auth and post CRUD`

---

### Task 6: Photo storage, uploads and variants

**Files:**
- Create: `apps/api/src/storage/bucket.ts`, `apps/api/src/images/variants.ts`, `apps/api/src/routes/uploads.ts`, `apps/api/src/test/fixtures/{photo-2000x1333.jpg,photo-2000x2000.jpg,not-an-image.txt}`
- Modify: `apps/api/src/app.ts`, `apps/api/src/server.ts` (ensure bucket exists on start when emulator)
- Test: `apps/api/src/images/variants.test.ts`, `apps/api/src/routes/uploads.test.ts`

**Interfaces:**
- Consumes: `variantPaths`, `Photo` (Task 2), `requireAdmin` (Task 5).
- Produces:
  - `class PhotoStore(config)`:
    - `createUploadTarget(objectPath, contentType): Promise<{ url: string; method: 'PUT' | 'POST'; headers: Record<string,string> }>` — with `STORAGE_EMULATOR_HOST`: `POST {host}/upload/storage/v1/b/{bucket}/o?uploadType=media&name={encoded path}`; otherwise v4 signed URL, `PUT`, 15 min expiry.
    - `read(path): Promise<Buffer>`; `write(path, buffer, contentType)` with `Cache-Control: public, max-age=31536000, immutable`; `deletePhoto(photoId)` deletes prefix `photos/{photoId}/`; `publicUrl(path) = IMAGE_BASE_URL + '/' + path`.
  - `makeVariants(input: Buffer): Promise<{ width; height; w1000: Buffer; w300: Buffer }>` — sharp, auto-rotate from EXIF, `withoutEnlargement`, JPEG q85. Single function so later "downscale originals >2000px" is one added branch.
  - `POST /v1/admin/uploads` body `{ files: [{ fileName, contentType, size }] }` (max 50 files) → per file either `{ photoId, objectPath, upload: {url,method,headers} }` or `{ fileName, error: 'unsupported_type' | 'too_large' }`. Allowed types `image/jpeg`, `image/png`, `image/webp`; max size **30 MB**.
  - `POST /v1/admin/uploads/:photoId/complete` → reads original, runs `makeVariants`, writes `w1000`/`w300`, returns `Photo`; original not a decodable image → 422 `{error:'not_an_image'}` and the object is deleted.

- [ ] **Step 1: Write failing tests** (fake-gcs running):
  - `makeVariants(2000x1333 jpg)` → width 2000, height 1333, w1000 is 1000px wide, w300 is 300px wide; a 600px-wide input yields w1000 still 600px (no upscaling).
  - Upload flow end-to-end: request target → `fetch(url,{method, headers, body})` → `complete` → returned `Photo.paths` all readable from the bucket.
  - Batch with `[a.jpg (2MB), b.heic, c.jpg (40MB)]` → a gets a target, b `unsupported_type`, c `too_large`.
  - Uploading `not-an-image.txt` bytes as `image/jpeg` then `complete` → 422 and the object no longer exists.
  - `deletePhoto(id)` removes all three objects.
- [ ] **Step 2:** FAIL → implement → PASS. Replace the `deletePhoto` stub from Task 5 with `PhotoStore`.
- [ ] **Step 3: Commit** `feat(api): direct-to-bucket uploads and image variants`

---

### Task 7: WordPress importer

**Files:**
- Create: `scripts/import-wordpress/{package.json,parse.ts,run.ts}`, `scripts/import-wordpress/fixtures/{posts-sample.json,categories.json,tags.json}` (saved from the live WP API: include `david-bowie-%e2%98%85`, `ajukaja-ats-soome-papp`, the multi-category `supersilent-14`, and the cassette post with text `maria-w-horn-…`)
- Test: `scripts/import-wordpress/parse.test.ts`, `scripts/import-wordpress/run.test.ts`

**Interfaces:**
- Consumes: `slugify`, `variantPaths`, `makeVariants`, `PhotoStore`, `PostRepo`, `TermRepo`, `PhotoIndexRepo` (import from `apps/api` source via workspace dependency).
- Produces:
  - `parseWpPost(wp: WpPost, categoriesById: Map<number, Term>, tagsById: Map<number, Term>): ImportedPost` where `ImportedPost = { wpId; slug /* decodeURIComponent(wp.slug) */; title /* entities decoded */; categorySlug /* first path segment of wp.link */; tagSlugs; discogsUrl?; text? /* markdown paragraphs */; publishedAt /* wp.date[0..10] */; imageUrls: string[] /* full-size src of each wp-block-image, in order */ }`.
  - `runImport({ baseUrl = 'https://vinyl.rehab', fetchImpl = fetch, deps }): Promise<{ posts: number; photos: number; skipped: number }>` — paginates `/wp-json/wp/v2/{posts,categories,tags}?per_page=100`; upserts all terms (incl. empty); for each post: if `getByWpId` exists, update fields but reuse already-imported photos (match by `wpPath`); else download each image, write original + variants, `PhotoIndexRepo.put(wpPath, photoId)`. Status `published`.
  - Root script `pnpm import` → `node --env-file=.env scripts/import-wordpress/run.ts`.

- [ ] **Step 1: Write failing tests** (`parse.test.ts`, fixtures only):
  - Bowie: slug `david-bowie-★`, title `david bowie – ★`, category `vinyl`, ≥5 imageUrls starting with `…/2026/01/DSCF2087.jpg` (no `-300x300` variants), no discogsUrl.
  - Ajukaja: `discogsUrl` `https://www.discogs.com/release/25623145-Ajukaja-Ats-Soome-Papp`, the "disccogs.com" paragraph not in `text`, 2 images.
  - supersilent-14: `categorySlug` equals the category in its `link`, not `uncategorized`.
  - maria-w-horn cassette post: `text` contains `Limited edition of 150 clear cassette`.
- [ ] **Step 2: Write failing test** (`run.test.ts`, emulators + fake-gcs, `fetchImpl` serving fixtures and a fixture JPEG for every image URL): first run imports N posts; second run creates no new posts or photos (`photos` count unchanged in bucket); `GET /v1/legacy-images/2026/01/DSCF2087.jpg` resolves.
- [ ] **Step 3:** FAIL → implement → PASS.
- [ ] **Step 4:** Run `pnpm import` against live vinyl.rehab into local emulators; expect `posts: 116`.
- [ ] **Step 5: Commit** `feat: WordPress importer`

---

### Task 8: Web SSR server, routing, data loading and theme

**Files:**
- Create: `apps/web/src/{router,api,pageData}.ts`, `apps/web/src/styles/theme.css`, `apps/web/src/App.vue`, `apps/web/src/components/SiteHeader.vue`
- Modify: `apps/web/server.ts`, `apps/web/src/entry-{client,server}.ts`, `apps/web/index.html`
- Test: `apps/web/server.test.ts`

**Interfaces:**
- Consumes: api public endpoints (Task 4), `Post`, `Page`, `Term`.
- Produces:
  - `createApiClient(baseUrl: string, fetchImpl = fetch): ApiClient` with `listPosts({page,category?,tag?})`, `getPostBySlug(slug)`, `getPostByWpId(id)`, `listCategories()`, `listTags()`, `legacyImage(path)`; 404 → `null` (or throws `NotFoundError` for lists), other errors throw.
  - Route records (`router.ts`) each with `meta.load(ctx: { params, api }): Promise<unknown>`; names: `home`, `homePage`, `category`, `categoryPage`, `tag`, `tagPage`, `post`, `notFound`. `strict: true` trailing-slash paths.
  - `render(url: string, api: ApiClient): Promise<{ html: string; head: string; state: string; status: number }>` in `entry-server.ts`; state serialised with `devalue.uneval`; loader returning `null`/`NotFoundError` → status 404 with NotFound page.
  - `usePageData<T>(): Ref<T>` — on client first load reads `window.__STATE__`, afterwards runs the route loader on navigation.
  - `createWebServer({ apiUrl, dev }): Promise<Express>` in `server.ts`: dev → Vite middleware + `ssrLoadModule`; prod → built assets. Non-slash GET paths (no file extension) → 301 to slash form. `/admin/*` serves the client-only shell (no SSR).
  - `theme.css` variables: `--bg:#6d6d6d; --text:#f2f2f2; --text-muted:#ddd; --accent:#ecae80; --dark:#2C3033; --font-heading:'Patua One',serif; --font-body:'Droid Sans',sans-serif; --max-photo:2000px`.

- [ ] **Step 1: Write failing tests** (supertest on `createWebServer` with a fake api via `nock`-style stub server or injected `ApiClient`):
  - `GET /` → 200, HTML contains `Vinyl Rehab`, `music is my radar`, and the titles of the stubbed posts.
  - `GET /category/vinyl` → 301 `Location: /category/vinyl/`.
  - `GET /no/such/thing/x/` → 404 with NotFound content.
  - HTML contains `window.__STATE__` and no unescaped `</script>` from a post title `</script><script>alert(1)`.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(web): SSR server, routes, data loading, theme`

---

### Task 9: Public pages and photo components

**Files:**
- Create: `apps/web/src/components/{PostEntry,ThumbStrip,Lightbox,Pager}.vue`, `apps/web/src/pages/{ListPage,PostPage,NotFound}.vue`, `apps/web/src/markdown.ts`
- Test: `apps/web/src/components/{ThumbStrip,PostEntry,Lightbox,Pager}.test.ts`, extend `apps/web/server.test.ts`

**Interfaces:**
- Consumes: `Post`, `Photo`, `pageData` loaders. `Photo.paths` are bucket-relative; web reads `IMAGE_BASE_URL` on the server and passes it to the client in the serialised state as `imageBaseUrl`.
- Produces:
  - `<PostEntry :post :imageBaseUrl :full="false">` — big photo `<img>` with `src` = original, `srcset` = `w300 300w, w1000 1000w, original {width}w`, `sizes="(max-width: 2000px) 100vw, 2000px"`, `width`/`height` attrs from the current photo; below it `<ThumbStrip>`; meta line `YYYY-MM-DD · [category chip → /category/{slug}/] · discogs ↗` (link only if `discogsUrl`); title `<h2><a href="/{category}/{slug}/">`; tags `→ /tag/{slug}/`. When `full`, renders `text` via `markdown.ts` (markdown-it, `html:false`).
  - `<ThumbStrip :photos v-model:selected>` — `overflow-x:auto`, 120×120 `object-fit:cover` thumbs from `w300`, selected one outlined `var(--accent)`; emits `update:selected(index)`.
  - `<Lightbox :photos :start @close>` — full-screen, shows `original`, ←/→ keys and swipe step, Esc closes; opened by clicking the big photo.
  - `<Pager :page :totalPages :basePath>` — "newer" / "older" links using `/page/{n}/` (page 1 = basePath).
  - Pages: `ListPage` (home/category/tag; heading shows category/tag name when filtered), `PostPage` (`PostEntry full`; 404 if `params.category !== post.categorySlug` → instead 301 to correct category path), `NotFound`.
  - Head (via @unhead/vue): `<title>` = `"{post title} – Vinyl Rehab"` / `"{category} – Vinyl Rehab"` / `"Vinyl Rehab – music is my radar"`; meta description; `og:image` = main photo w1000; `<link rel=canonical>`.

- [ ] **Step 1: Write failing tests**
  - ThumbStrip: 9 photos → 9 thumbs; clicking the 3rd emits `update:selected` with `2`; selected thumb has class `on`.
  - PostEntry: big image `width`/`height` match current photo; after selecting a 2000×2000 thumb the big image has `height="2000"` (no crop: no `object-fit:cover` on `.hero`); no discogs link when `discogsUrl` is absent; tag links point to `/tag/{slug}/`.
  - Lightbox: ArrowRight advances, Escape emits `close`.
  - Pager: page 1 of 3 shows only "older" → `/page/2/`; page 2 of category vinyl shows "newer" → `/category/vinyl/`.
  - Server: `/vinyl/david-bowie-%e2%98%85/` → 200 containing `david bowie – ★`; `/cassette/david-bowie-%e2%98%85/` → 301 to `/vinyl/…/`; `/page/99/` → 404; `/category/nope/` → 404; `/tag/ambient/` lists only stubbed ambient posts.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Manual check against mockup v4 (`.superpowers/brainstorm/*/content/homepage-layout-v4.html`) at widths 375, 1440 and 2560: photo never exceeds 2000px, strip matches photo width and scrolls.
- [ ] **Step 4: Commit** `feat(web): public list and post pages with photo strip and lightbox`

---

### Task 10: Legacy redirects, RSS feed, sitemap

**Files:**
- Create: `apps/web/src/legacy.ts`, `apps/web/src/feed.ts`, `apps/web/src/sitemap.ts`
- Modify: `apps/web/server.ts`
- Test: `apps/web/src/legacy.test.ts`, extend `apps/web/server.test.ts`

**Interfaces:**
- Consumes: `ApiClient` (Task 8), `parseWpImagePath`/`pickVariant` (via api `legacyImage`).
- Produces:
  - `resolveLegacy(url: URL, api: ApiClient, categories: Set<string>): Promise<string | null>` → 301 target or null. Rules:
    - `/wp-content/uploads/*` → `api.legacyImage(path).url`
    - `/?p={id}` → `/{categorySlug}/{slug}/`
    - `/{category}/{slug}/{anything}/` where `{category}` is a known category → `/{category}/{slug}/` (attachment pages)
    - `/{YYYY}/` and `/{YYYY}/{MM}/` (and with `/page/n/`) → `/`
    - `/wp-sitemap.xml` → `/sitemap.xml`; `/feed` and `/feed/` handled by feed (not redirect).
  - `GET /feed/` → RSS 2.0, `Content-Type: application/rss+xml; charset=utf-8`, latest 20 published posts, each item with title, link, pubDate, and main photo w1000 `<enclosure>`.
  - `GET /sitemap.xml` → home, every published post, every non-empty category and tag page.
  - Absolute URLs use env `SITE_URL` (default `http://localhost:3000`; add to `.env.example`).

- [ ] **Step 1: Write failing tests**
  - `/wp-content/uploads/2026/01/DSCF2087-1024x1024.jpg` → 301 to `…/photos/{id}/original.jpg` (1024 > 1000); `-768x768` → `…/w1000.jpg`; `-150x150` → `…/w300.jpg`; unknown image → 404.
  - `/?p=123` → 301 `/vinyl/some-slug/`; `/?p=999999` → 404.
  - `/vinyl/depeche-mode-useless-home/dscf6032/` → 301 `/vinyl/depeche-mode-useless-home/`.
  - `/2021/05/` → 301 `/`.
  - `/feed/` parses as XML, has ≤20 `<item>`, first item is newest; `/sitemap.xml` contains `/tag/ambient/` and not an empty category.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3: Commit** `feat(web): legacy WordPress redirects, RSS feed and sitemap`

---

### Task 11: Admin UI

**Files:**
- Create: `apps/web/src/admin/{AdminApp.vue,auth.ts,PostsList.vue,PostForm.vue,PhotoGrid.vue,TagInput.vue,useUploads.ts,adminApi.ts}`, `apps/web/src/admin/entry-admin.ts`
- Modify: `apps/web/src/router.ts` (admin routes client-only), `apps/web/server.ts`
- Test: `apps/web/src/admin/{useUploads,PhotoGrid,PostForm,TagInput}.test.ts`

**Interfaces:**
- Consumes: admin endpoints (Tasks 5–6), `PostInput`, `slugify`.
- Produces:
  - `auth.ts`: `initAuth()` (firebase client SDK; `connectAuthEmulator(VITE_FIREBASE_AUTH_EMULATOR_URL)` in dev), `signIn()` = `signInWithPopup(GoogleAuthProvider)`, `signOut()`, `getIdToken(): Promise<string>`, reactive `user`.
  - `adminApi.ts`: typed wrappers for every `/v1/admin/*` endpoint, attaching `Authorization: Bearer`; 403 → shows "This Google account is not allowed".
  - `useUploads(api): { items: Ref<UploadItem[]>; addFiles(files: File[]); remove(id); move(from, to); busy: ComputedRef<boolean>; photos: ComputedRef<Photo[]> }` where `UploadItem = { id; fileName; previewUrl; progress: number; state: 'uploading'|'processing'|'done'|'error'; error?: string; photo?: Photo }`. Uploads run with max 4 in parallel; progress via `XMLHttpRequest.upload.onprogress`.
  - Routes: `/admin/` → PostsList; `/admin/posts/new/` and `/admin/posts/:id/` → PostForm.
  - `PostForm`: fields per mockup `admin-new-post.html` — drop zone + file picker (`multiple`, `accept="image/jpeg,image/png,image/webp"`), `PhotoGrid` (drag to reorder, × remove, first = MAIN badge), title, category `<select>` + "new category…" text option, `TagInput` (chips, autocomplete from `/v1/admin/tags`, Enter/comma adds), Discogs link, date (default today), text (textarea, Markdown), address (auto `slugify(title)` until edited manually; preview `/{category}/{slug}/`). Buttons Save draft / Publish (/ Unpublish when published), disabled while `busy`.
  - `PostsList`: newest first; main photo w300, title, category, status badge; actions Edit, Unpublish, Delete (confirm dialog "Delete '{title}' and its photos?").

- [ ] **Step 1: Write failing tests** (@vue/test-utils, mocked `adminApi`, fake XHR):
  - `useUploads.addFiles([jpg, heic, jpg])` → heic item state `error` with message "unsupported file type"; two jpg items reach `done`; `busy` true until both done.
  - `move(2, 0)` reorders `photos`; MAIN badge on new first item in `PhotoGrid`.
  - `PostForm`: typing title `Ajukaja & Ats – Soome Papp` sets address `ajukaja-ats-soome-papp`; after manual address edit, changing the title doesn't overwrite it; Publish disabled while an upload is `uploading`; API 409 → shows "address already in use" and all field values remain.
  - `TagInput`: typing `amb` suggests `ambient`; Enter adds a chip; × removes it.
- [ ] **Step 2:** FAIL → implement → PASS.
- [ ] **Step 3:** Manual check with `pnpm dev`: sign in via Auth emulator popup with the allowlisted email; with another email see the not-allowed message.
- [ ] **Step 4: Commit** `feat(web): admin posts list and post editor with multi-photo upload`

---

### Task 12: End-to-end admin flow and phase 1 acceptance

**Files:**
- Create: `e2e/admin.spec.ts`, `playwright.config.ts`
- Modify: root `package.json` (`e2e` script), `README.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the e2e test** (Playwright, against `pnpm dev` with emulators; empty Firestore + one seeded category `vinyl`):
  - Sign in through the Auth emulator popup as the allowlisted email.
  - New post: upload 3 fixture JPEGs, wait for all thumbnails done, drag the 3rd to first, title `e2e – test record`, category `vinyl`, tags `ambient`, `e2e`, Publish.
  - Visit `/`: first entry title `e2e – test record`, big image `src` contains the photo id of the dragged file, thumb strip has 3 thumbs.
  - `/category/vinyl/` and `/tag/e2e/` both list it; `/vinyl/e2e-test-record/` renders it.
  - Admin: delete it (accept confirm) → `/vinyl/e2e-test-record/` returns 404.
- [ ] **Step 2:** Run `pnpm e2e` → PASS.
- [ ] **Step 3: Acceptance (spec "Done when")** — run `pnpm import` into a fresh local setup, then verify and record results in the PR/commit message:
  - 116 posts imported; front page matches mockup v4 look.
  - `curl -I` 200 for `/vinyl/depeche-mode-useless-home/`, `/category/vinyl/`, `/page/2/`, `/tag/ambient/`; 301 for `/wp-content/uploads/2025/08/DSCF6032.jpg` with a Location that returns 200.
  - `pnpm test`, `pnpm e2e`, `vp check` all pass.
- [ ] **Step 4:** README: how to run the import, how to log in to admin locally, list of env vars.
- [ ] **Step 5: Commit** `test: end-to-end admin flow; docs`
