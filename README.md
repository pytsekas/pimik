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

```sh
cp .env.example .env
pnpm install
pnpm dev     # starts fake-gcs, Firebase emulators (UI on :4000), web and api
```

## Tests and checks

```sh
docker compose up -d   # storage emulator, required by tests
pnpm test              # runs all tests inside the Firestore + Auth emulators
pnpm check             # lint, format and type-check (vp check)
```
