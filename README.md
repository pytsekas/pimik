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

The emulators keep everything in memory: Firestore data is lost when the emulator stops and the
fake-gcs backend is lost when its container restarts, so run the import again after either.
