import { readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { BUCKET, STORAGE_HOST } from './settings.ts';

const GCS_DATA = fileURLToPath(new URL('../.gcs-data/', import.meta.url));

/**
 * Removes the e2e photo and upload buckets from fake-gcs, then the files they leave in the shared
 * storage directory (bucket directories and `.bucketMetadata`). Only entries starting with the e2e
 * bucket name are touched.
 */
export default async function globalTeardown(): Promise<void> {
  await Promise.all([BUCKET, `${BUCKET}-uploads`].map(deleteBucket));

  const leftovers = (await readdir(GCS_DATA).catch(() => [])).filter((name) =>
    name.startsWith(BUCKET),
  );
  await Promise.all(
    leftovers.map((name) => rm(`${GCS_DATA}${name}`, { recursive: true, force: true })),
  );
}

async function deleteBucket(name: string): Promise<void> {
  const base = `${STORAGE_HOST}/storage/v1/b/${name}`;
  const listing = await fetch(`${base}/o`);
  if (listing.ok) {
    const { items = [] } = (await listing.json()) as { items?: { name: string }[] };
    await Promise.all(
      items.map((item) =>
        fetch(`${base}/o/${encodeURIComponent(item.name)}`, { method: 'DELETE' }),
      ),
    );
  }
  await fetch(base, { method: 'DELETE' });
}
