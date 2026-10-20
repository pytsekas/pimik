import type { Firestore } from 'firebase-admin/firestore';

export class PhotoIndexRepo {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async get(basePath: string): Promise<{ photoId: string } | null> {
    const doc = await this.docRef(basePath).get();
    const photoId = doc.data()?.photoId;
    return typeof photoId === 'string' ? { photoId } : null;
  }

  async put(basePath: string, photoId: string): Promise<void> {
    await this.docRef(basePath).set({ photoId });
  }

  private docRef(basePath: string) {
    return this.db.collection('wpImages').doc(basePath.replaceAll('/', '__'));
  }
}
