# Vinyl Rehab blog — design

Date: 2026-10-20
Status: draft for approval

## Intent

Replace the WordPress blog at https://vinyl.rehab/ with a small, self-built blog. The blog is
essentially a photo log of a record collection: each post is one release (vinyl, cassette, …)
with a title like "artist – title", a Discogs link, and a gallery of photos. Text is rare.

WordPress is more than this needs. The owner wants their own code, a look similar to the current
site, a simple admin for adding posts with many photos at once, and eventually hosting on GCP
with WordPress switched off entirely.

## Current site (facts, gathered 2026-10-20 via the WP REST API)

- 116 posts, ~430 media items, 10 categories, 107 tags.
- Categories: vinyl (92), cassette (18), turntable (3), drinks (2), various (2), live (1),
  uncategorized (5), photo/sailing/tim (0).
- Tags: artists, labels, genres, formats (`ambient`, `4ad`, `7inch`, `depeche-mode`, …).
- Post content is Gutenberg HTML: a sequence of `<figure class="wp-block-image">` blocks
  (images are 2000px wide originals, aspect ratios vary: 1:1, 3:2, 16:9…), empty paragraphs,
  and often a paragraph linking to `discogs.com`. Occasionally a short text paragraph.
- Featured image is not used (`featured_media: 0`); the first image is effectively the main photo.
- URLs: posts `/{category}/{slug}/`, categories `/category/{slug}/`, pagination `/page/{n}/`,
  images `/wp-content/uploads/YYYY/MM/{file}.jpg` plus WP-generated variants
  `{file}-{w}x{h}.jpg`.
- Theme: weh-lite. Body background `#6d6d6d`, headings font Patua One, body font Droid Sans,
  accent/link colour `#ecae80`, dark text colour `#2C3033`. Tagline "music is my radar".
  10 posts per page, newest first, no search, no comments, no menu.

## Goals

1. Public blog that looks like the approved mockup (below) and is server-rendered so search
   engines see real content.
2. Every existing URL keeps working: posts, categories, pagination, and old image URLs.
3. Filtering by category (`/category/{slug}/`) and tag (`/tag/{slug}/`) via the URL.
4. Admin for creating/editing posts with multi-photo upload.
5. One-off import of all WordPress content (posts, categories, tags, photos).
6. Phase 1 runs fully on localhost; phase 2 moves to GCP with minimal code change.

## Non-goals (for now)

- Comments, search, menus, multiple users/roles.
- In-app downscaling of camera originals — photos are uploaded already resized to 2000px.
  The image pipeline must make this easy to add later (see Images).
- Final visual polish — colours and styling will be iterated later.
- Phase 2 (GCP deploy) is described but not built in phase 1.

## Anti-goals (would be a failure even if it works)

- Broken old links or lost Google ranking after the switch.
- Photos shown blurry, over-compressed, or not at full 2000px quality on large screens.
- An admin that feels heavier than WordPress for "drop photos, add title, publish".
- Hosting costs that are noticeable for a personal blog with no traffic spikes.

## Decisions made by the owner

- **Stack:** Vue (front end), Express.js (back end), Vite+ for building.
- **Repository:** one repo (monorepo), two apps.
- **Hosting target:** GCP; photos in Cloud Storage buckets.
- **SEO / old links:** wanted — public pages must be server-rendered and URL-compatible.
- **Front-page layout:** option "B" — each post opens with one big photo, thumbnails below.
- **Big photo size:** fills the browser width up to 2000px max; shrinks responsively on
  smaller screens.
- **Thumbnail strip:** exactly as wide as the big photo; scrolls horizontally when thumbnails
  overflow. Clicking a thumbnail swaps it into the big photo.
- **Look:** start from the current site's grey background, fonts and peach accent; change later.
- **Admin "new post" page:** approved as mocked (see Admin).
- **Replace WordPress completely**; domain moves to the new site.
- **Order of work:** localhost first, GCP later.

## Decisions made by Claude (approved in conversation, owner may still revise)

- `web` uses Vue's own SSR (`createSSRApp` + `renderToString`) served by a small Node server,
  not Nuxt.
- Post data in **Firestore**; photos in **Cloud Storage**; both apps on **Cloud Run** (phase 2).
- Admin login: Google sign-in via Firebase Auth, restricted to a single allowlisted email.
- Browser uploads photos **directly to the bucket** via signed URLs; the API never proxies image
  bytes.
- Clicking the **title** opens the post page; clicking the **big photo** opens a full-screen
  viewer (lightbox) that steps through the post's photos with arrow keys / swipe.
- Post page = same layout as a front-page entry, plus the full text if any.
- Empty categories are hidden on the public site.
- No separate category/tag management screen: new ones are created by typing them in the post
  form.
- Phones get a ~1000px variant; thumbnails get small variants.

## Architecture

```
repo/
  apps/
    web/      Vue 3 + Vite+ ; SSR public site + client-only admin (/admin/*)
    api/      Express.js ; JSON API, auth check, signed upload URLs, image variants
  packages/
    shared/   shared types/validation (post shape, slug rules)  — builder's call if needed
  scripts/
    import-wordpress/   one-off WP → Firestore + bucket importer
  docker-compose.yml    local emulators
```

- **web** renders public pages server-side by fetching from **api**. Admin routes under
  `/admin` are client-rendered only and call **api** with the user's Firebase ID token.
- **api** is the only component that talks to Firestore and Cloud Storage.
- Both apps read all endpoints/project IDs/bucket names from environment variables, so
  localhost (emulators) vs GCP differs only by config.

### Data model (Firestore)

`posts/{id}`
- `slug` (unique), `title`, `categorySlug`, `tagSlugs[]`, `discogsUrl?`, `text?`
  (sanitised HTML or Markdown — builder's call), `publishedAt` (date shown), `status`
  (`draft` | `published`), `photos[]` ordered list of
  `{ id, width, height, original, variants: { w1000, w300 } }` (paths in bucket),
  `createdAt`, `updatedAt`, `wpId?` (imported posts).
- The first entry of `photos[]` is the main photo.

`categories/{slug}` — `{ slug, name }`. `tags/{slug}` — `{ slug, name }`.
Post counts per category/tag are derived (query or maintained counter — builder's call).

Queries needed: published posts by `publishedAt desc` paginated (10/page), filtered by
`categorySlug` or `array-contains tagSlug`; post by `slug`. Builder defines required
composite indexes.

### Images

- Bucket layout (suggested): `photos/{postId}/{photoId}/original.jpg`, `w1000.jpg`, `w300.jpg`.
  Imported photos may keep their WP path for simpler redirects — builder's call.
- Upload flow: admin requests signed upload URLs from api → browser PUTs files directly to the
  bucket, showing per-file progress → api is told the upload finished → api generates variants
  (e.g. with `sharp`) and records dimensions.
- Later feature (not phase 1): if an original is wider than 2000px, api downsizes it to 2000px
  in the same step. Variant generation must be structured so this is a small addition.
- Public pages use `srcset`/`sizes` so the browser picks w300 / w1000 / original.
- Images are served publicly from the bucket (phase 2: behind Cloud CDN or bucket public URL —
  builder's call), with long cache headers.

### Public site (web)

Routes:
- `/` and `/page/{n}/` — published posts, newest first, 10 per page.
- `/category/{slug}/` and `/category/{slug}/page/{n}/` — filtered by category.
- `/tag/{slug}/` and `/tag/{slug}/page/{n}/` — filtered by tag.
- `/{category}/{slug}/` — single post.
- `/feed/` — simple RSS feed of latest published posts (keeps existing subscribers).
- Other WordPress URL forms: attachment pages `/{cat}/{slug}/{attachment}/` and `?p={wpId}`
  → 301 to the post; date archives (`/YYYY/`, `/YYYY/MM/`) → 301 to `/`; `/wp-sitemap.xml`
  → 301 to `/sitemap.xml`.
- `/wp-content/uploads/...` — 301 redirect to the corresponding bucket image (map WP variant
  sizes like `-1024x1024` to the nearest new variant).
- Unknown URL → 404 page. Draft posts are not publicly reachable.

Each post entry (approved mockup v4, saved in `.superpowers/brainstorm/…/homepage-layout-v4.html`):
- Big photo: `width: 100%`, `max-width: 2000px`, centred; **never cropped** — always the
  image's natural aspect ratio (owner's decision). Height follows the photo, so swapping to a
  thumbnail of a different shape changes the height and content below moves; that is accepted.
  Set `width`/`height` attributes so the browser reserves space and avoids load-time jumps.
  (Note: the mockup v4 uses a 3:2 crop — the text here overrides it.)
- Thumbnail strip under it, same width, `overflow-x: auto`, ~120px square thumbnails, selected
  thumbnail outlined in accent colour; click swaps the big photo (client-side hydration).
- Meta line: date (YYYY-MM-DD) · category chip (links to category page) · "discogs ↗" link.
- Title (Patua One) linking to the post page.
- Tags as links to tag pages.
- Header: site name "Vinyl Rehab" + tagline "music is my radar".
- Styling: background `#6d6d6d`, light text, Patua One / Droid Sans (Google Fonts), accent
  `#ecae80`. Styling must be centralised (CSS variables) for easy later change.
- Proper `<title>`, meta description, Open Graph image (main photo), canonical URL, and
  `sitemap.xml` for SEO.

### Admin (web `/admin`, api)

- **Login:** Google sign-in (Firebase Auth); api verifies the ID token and the email against an
  allowlist from env config. Everyone else gets 403.
- **All posts list** (`/admin`): newest first, main photo thumbnail, title, category,
  draft/published. Click → edit. Actions: unpublish, delete (with confirmation; deleting removes
  the post's photos from the bucket).
- **New/edit post** (approved mockup `admin-new-post.html`):
  - Drop zone + file picker, many files at once; per-file upload progress.
  - Photo grid: drag to reorder, × to remove; first photo marked MAIN.
  - Fields: title, category (dropdown, can type a new one), tags (chips with autocomplete from
    existing tags, can create new), Discogs link, date (defaults to today), optional text,
    address/slug (auto from title, editable, must be unique).
  - Buttons: Save draft, Publish.
- api endpoints (shape is builder's call): CRUD for posts, list categories/tags, signed upload
  URL issuance, upload-complete hook.

### WordPress import (scripts/import-wordpress)

- Reads from `https://vinyl.rehab/wp-json/wp/v2/` (posts, categories, tags, media), paginated.
- For each post: keep `slug`, title (HTML-entity decoded), date, category (the one in the
  post's current permalink `link` field — 7 posts have two categories, mostly
  `uncategorized` + one real one; the extra one is dropped),
  tags, status; extract image URLs from `<figure class="wp-block-image">` in content order;
  extract the first `discogs.com` link as `discogsUrl`; keep remaining non-empty text paragraphs
  as `text`.
- Downloads each full-size image, uploads to the bucket, generates variants.
- Idempotent (safe to re-run; keyed by `wpId`), so it can run once locally and once more at
  cutover.
- Imports all categories/tags, including empty ones (hidden publicly).

## Phase 1 — localhost

- One command starts everything (e.g. `vp dev` / workspace script + `docker compose up`).
- Firestore → official Firestore emulator. Cloud Storage → `fake-gcs-server` in Docker.
  Auth → Firebase Auth emulator. Same SDK code paths as production.
- Seed: run the importer against the live vinyl.rehab into the local emulators.

**Done when:**
- Site runs locally with all 116 imported posts and looks like mockup v4.
- `/vinyl/depeche-mode-useless-home/`, `/category/vinyl/`, `/page/2/`, `/tag/ambient/`, and an
  old `/wp-content/uploads/...jpg` URL all work.
- Owner can log in to admin, create a post with several photos, reorder them, publish, and see it
  on the front page, its category page and its tag pages; edit and delete work.
- Tests for api, import parsing, and key UI behaviour pass.

## Phase 2 — GCP (described, not built now)

- GCP project; Firestore (native mode); Cloud Storage bucket; Cloud Run services for `web` and
  `api`; Firebase Auth with real Google provider; secrets via Secret Manager / env.
- Final import from WordPress, then point the vinyl.rehab DNS at Cloud Run (domain mapping or
  load balancer — builder's call), verify old URLs, then switch WordPress off.
- Deployment method (Cloud Build, GitHub Actions, manual `gcloud`) is open.

## Left to the builder

- Vite+ workspace layout and scripts; package manager.
- Vue SSR wiring details, hydration strategy, router.
- API route design, validation library, error format.
- Text format (Markdown vs sanitised HTML).
- Image library and exact variant widths/quality (must not visibly degrade 2000px originals).
- Testing tools and depth (unit + some end-to-end for the admin flow).
- Lightbox implementation.

## Resolved after review

- **Cropping:** never crop the big photo; natural aspect ratio, max 2000px wide (owner).
- **Unpublished WP posts:** none exist; importing via the public API is sufficient (owner).
- **Multi-category posts:** keep the permalink category, drop the extra (Claude's call).
- **Other WP URLs:** redirects + `/feed/` as listed under Public site (Claude's call).
