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
API_URL=http://localhost:3001
VITE_FIREBASE_API_KEY=fake-api-key
VITE_FIREBASE_AUTH_EMULATOR_URL=http://localhost:9099
```

The `VITE_FIREBASE_*` variables configure Firebase Auth in the admin UI (`/admin/`). Vite builds
them into the browser bundle from the process environment, so they must be set when the web app
starts (dev) or is built (production):

- `VITE_FIREBASE_API_KEY` - the Firebase web API key (any value works with the emulator)
- `VITE_FIREBASE_AUTH_EMULATOR_URL` - when set, sign-in goes to the Auth emulator at this URL
- `VITE_FIREBASE_PROJECT_ID` - optional, defaults to `vinyl-rehab-local`
- `VITE_FIREBASE_AUTH_DOMAIN` - optional, defaults to `<project id>.firebaseapp.com`

## Admin

Open http://localhost:3000/admin/ and sign in with Google. Locally the Auth emulator opens a popup
where you add an account; use an email listed in `ADMIN_EMAILS`. Any other account sees "This
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
```

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
