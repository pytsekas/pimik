import { BUCKET, STORAGE_HOST } from './settings.ts';

/** Removes the e2e bucket from fake-gcs so nothing is left in the shared storage directory. */
export default async function globalTeardown(): Promise<void> {
  const base = `${STORAGE_HOST}/storage/v1/b/${BUCKET}`;
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
