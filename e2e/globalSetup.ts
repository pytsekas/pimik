import { FIRESTORE_HOST, PROJECT_ID } from './settings.ts';

/** Seeds the one category the test publishes into, straight through the Firestore emulator REST API. */
export default async function globalSetup(): Promise<void> {
  const url = `http://${FIRESTORE_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/categories/vinyl`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({
      fields: { slug: { stringValue: 'vinyl' }, name: { stringValue: 'Vinyl' } },
    }),
  });
  if (!response.ok) {
    throw new Error(`Seeding category failed: ${response.status} ${await response.text()}`);
  }
}
