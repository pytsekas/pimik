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
