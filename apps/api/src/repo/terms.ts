import type { Term } from '@vinyl/shared';
import type { Firestore } from 'firebase-admin/firestore';

export type TermKind = 'categories' | 'tags';

const BATCH_LIMIT = 400;

export class TermRepo {
  private readonly db: Firestore;
  private readonly kind: TermKind;

  constructor(db: Firestore, kind: TermKind) {
    this.db = db;
    this.kind = kind;
  }

  async upsert(terms: Term[]): Promise<void> {
    for (let start = 0; start < terms.length; start += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const term of terms.slice(start, start + BATCH_LIMIT)) {
        batch.set(this.docRef(term.slug), { slug: term.slug, name: term.name });
      }
      await batch.commit();
    }
  }

  async get(slug: string): Promise<Term | null> {
    const doc = await this.docRef(slug).get();
    return doc.exists ? toTerm(doc.data() ?? {}) : null;
  }

  async listAll(): Promise<Term[]> {
    const snapshot = await this.db.collection(this.kind).get();
    return snapshot.docs.map((doc) => toTerm(doc.data())).sort(byName);
  }

  async listNonEmpty(): Promise<Term[]> {
    const terms = await this.listAll();
    const counted = await Promise.all(
      terms.map(async (term) => ({ ...term, count: await this.countPublished(term.slug) })),
    );
    return counted.filter((term) => term.count > 0);
  }

  private async countPublished(slug: string): Promise<number> {
    const published = this.db.collection('posts').where('status', '==', 'published');
    const query =
      this.kind === 'categories'
        ? published.where('categorySlug', '==', slug)
        : published.where('tagSlugs', 'array-contains', slug);
    return (await query.count().get()).data().count;
  }

  private docRef(slug: string) {
    return this.db.collection(this.kind).doc(encodeURIComponent(slug));
  }
}

function toTerm(data: FirebaseFirestore.DocumentData): Term {
  return { slug: data.slug as string, name: data.name as string };
}

function byName(a: Term, b: Term): number {
  return a.name.localeCompare(b.name);
}
