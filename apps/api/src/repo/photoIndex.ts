import type { Firestore } from 'firebase-admin/firestore';

export class PhotoIndexRepo {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async get(basePath: string): Promise<{ photoId: string } | null> {
    const id = toDocId(basePath);
    if (id === null) return null;
    const doc = await this.db.collection('wpImages').doc(id).get();
    const photoId = doc.data()?.photoId;
    return typeof photoId === 'string' ? { photoId } : null;
  }

  async put(basePath: string, photoId: string): Promise<void> {
    const id = toDocId(basePath);
    if (id === null) throw new Error(`Invalid image path: ${basePath}`);
    await this.db.collection('wpImages').doc(id).set({ photoId });
  }
}

/** Returns null for ids Firestore rejects, so lookups of junk paths simply miss. */
function toDocId(basePath: string): string | null {
  const id = basePath.replaceAll('/', '__');
  if (id === '.' || id === '..' || /^__.*__$/.test(id)) return null;
  return Buffer.byteLength(id) > 1500 ? null : id;
}
