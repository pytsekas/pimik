# Vinyl Rehab

Blog (Vue SSR web app + Express API) replacing the old WordPress site. pnpm monorepo managed with Vite+.

- `apps/web` - Express + Vue SSR (port 3000)
- `apps/api` - Express API on Firestore and Cloud Storage (port 3001)
- `packages/shared` - shared types and helpers

## Prerequisites

- Node 24
- pnpm
- Docker (fake-gcs-server for photo storage)
- Java 21+ (Firebase emulators)

## Getting started

Create a file named `.env` (gitignored) in the repo root with these variables:

```
GCLOUD_PROJECT=vinyl-rehab-local
FIRESTORE_EMULATOR_HOST=localhost:8080
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
STORAGE_EMULATOR_HOST=http://localhost:4443
BUCKET=vinyl-rehab-photos
IMAGE_BASE_URL=http://localhost:4443/vinyl-rehab-photos
ADMIN_EMAILS=marko.pytsep@iglu.ee
API_PORT=3001
WEB_PORT=3000
SITE_URL=http://localhost:3000
API_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_EMULATOR_URL=http://localhost:9099
```

All variables:

| Variable                      | Used by            | Meaning                                                                                                            |
| ----------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `GCLOUD_PROJECT`              | api, importer      | Firebase project id (`vinyl-rehab-local` locally)                                                                  |
| `FIRESTORE_EMULATOR_HOST`     | api, importer      | Firestore emulator `host:port`; unset in production                                                                |
| `FIREBASE_AUTH_EMULATOR_HOST` | api                | Auth emulator `host:port`; unset in production                                                                     |
| `STORAGE_EMULATOR_HOST`       | api, importer      | fake-gcs URL; unset in production (real Cloud Storage)                                                             |
| `BUCKET`                      | api, importer      | Photo bucket name                                                                                                  |
| `IMAGE_BASE_URL`              | api, web, importer | Public base URL of the bucket, used to build photo URLs                                                            |
| `ADMIN_EMAILS`                | api                | Comma-separated emails allowed into the admin; everyone else gets 403                                              |
| `API_PORT`                    | api                | Listen port, default 3001                                                                                          |
| `API_URL`                     | web                | Where the web server reaches the api                                                                               |
| `WEB_PORT`                    | web                | Listen port, default 3000                                                                                          |
| `SITE_URL`                    | web                | Public site URL (feed, sitemap, canonical links), default `http://localhost:3000`; set it together with `WEB_PORT` |
| `WP_BASE_URL`                 | importer           | Optional, defaults to `https://vinyl.rehab`                                                                        |

The `VITE_FIREBASE_*` variables configure Firebase Auth in the admin UI (`/admin/`). Vite builds
them into the browser bundle from the process environment, so they must be set when the web app
starts (dev) or is built (production):

- `VITE_FIREBASE_API_KEY` - the Firebase web API key (any value works with the emulator)
- `VITE_FIREBASE_AUTH_EMULATOR_URL` - when set, sign-in goes to the Auth emulator at this URL
- `VITE_FIREBASE_PROJECT_ID` - optional, defaults to `vinyl-rehab-local`
- `VITE_FIREBASE_AUTH_DOMAIN` - optional, defaults to `<project id>.firebaseapp.com`

## Admin

Open http://localhost:3000/admin/ and click "Sign in with Google". Locally the Auth emulator opens
a popup: choose "Add new account", enter an email listed in `ADMIN_EMAILS` (any display name) and
click "Sign in with Google.com". The emulator remembers the account (it is kept in
`.emulator-data/`), so later sign-ins just pick it from the list. Any other account sees "This
Google account is not allowed".

Then:

```sh
pnpm install
pnpm dev     # starts fake-gcs, Firebase emulators (UI on :4000), web and api
```

## Tests and checks

```sh
docker compose up -d   # storage emulator, required by tests
pnpm test              # needs no .env; runs all tests inside the Firestore + Auth emulators
pnpm check             # lint, format and type-check (vp check)
pnpm e2e               # Playwright end-to-end test of the admin flow
```

`pnpm e2e` needs `docker compose up -d` (fake-gcs on :4443) and Google Chrome installed. It starts
its own Firestore and Auth emulators (ports 8180 and 9199, nothing imported or exported), its own
api (3191) and web (3190) with project `vinyl-rehab-e2e` and bucket `vinyl-rehab-e2e-photos`, all
configured in `playwright.config.ts` and `e2e/settings.ts` (no `.env` file). It seeds the `vinyl`
category, signs in through the Auth emulator popup, publishes a post with three photos, checks the
public pages, then deletes the post. Your `pnpm dev` data is not touched and the dev stack can
keep running meanwhile.

## Importing the WordPress site

`pnpm import` copies every post, category, tag and image from https://vinyl.rehab into the
configured Firestore and bucket. It reads the same configuration as the api, so start the
emulators (`pnpm dev`, or `firebase emulators:start` plus `docker compose up -d`) first.

```sh
pnpm import
```

The importer is safe to run again: posts are matched by their WordPress id and already imported
images (matched by their `wp-content/uploads` path) are reused, not downloaded again. Posts whose
slug is already used by another post are skipped and logged; images that cannot be downloaded are
logged and the post is imported without them. The last line printed is a JSON summary
(`posts`, `photos`, `skipped`, `noPhotos`, `failedImages`).

`pnpm dev` keeps the data between runs: the Firebase emulators export to `.emulator-data/` when they
stop (Ctrl+C) and import it on the next start, and fake-gcs stores objects in `.gcs-data/` (both are
gitignored). Delete those two directories for a clean slate. `pnpm test` starts its own emulators
without importing or exporting anything, and its buckets are named differently, so it never touches
this data. Stopping the emulators in any other way (kill -9, a crash) skips the export, so run the
import again.

The importer only fetches images from the same site as the WordPress base URL, rejects anything that
is not an image or is larger than 30 MB, and does not follow redirects to other hosts.
