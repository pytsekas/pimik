import type { Term } from '@vinyl/shared';
import type { Firestore } from 'firebase-admin/firestore';

export type TermKind = 'categories' | 'tags';

const BATCH_LIMIT = 400;
const NON_EMPTY_TTL_MS = 60_000;

export type TermRepoOptions = {
  /** Clock for the listNonEmpty cache, in ms; injectable for tests. */
  now?: () => number;
};

export class TermRepo {
  private readonly db: Firestore;
  private readonly kind: TermKind;
  private readonly now: () => number;
  private nonEmpty: { terms: Term[]; expiresAt: number } | null = null;
  /** Bumped by invalidate() so a count that was running during a write is not cached. */
  private generation = 0;

  constructor(db: Firestore, kind: TermKind, options: TermRepoOptions = {}) {
    this.db = db;
    this.kind = kind;
    this.now = options.now ?? Date.now;
  }

  async upsert(terms: Term[]): Promise<void> {
    this.invalidate();
    for (let start = 0; start < terms.length; start += BATCH_LIMIT) {
      const batch = this.db.batch();
      for (const term of terms.slice(start, start + BATCH_LIMIT)) {
        batch.set(this.docRef(term.slug), { slug: term.slug, name: term.name });
      }
      await batch.commit();
    }
  }

  /** Creates the terms that do not exist yet; existing terms keep their names. */
  async addMissing(terms: Term[]): Promise<void> {
    const unique = [...new Map(terms.map((term) => [term.slug, term])).values()];
    if (unique.length === 0) return;
    const docs = await this.db.getAll(...unique.map((term) => this.docRef(term.slug)));
    await this.upsert(unique.filter((_term, index) => !docs[index]?.exists));
  }

  async get(slug: string): Promise<Term | null> {
    const doc = await this.docRef(slug).get();
    return doc.exists ? toTerm(doc.data() ?? {}) : null;
  }

  async listAll(): Promise<Term[]> {
    const snapshot = await this.db.collection(this.kind).get();
    return snapshot.docs.map((doc) => toTerm(doc.data())).sort(byName);
  }

  /**
   * Terms with at least one published post. Counting runs one query per term, so the result is
   * kept in memory for 60 s; writes in this process call invalidate(), writes by other processes
   * (the importer) show up when the cache expires.
   */
  async listNonEmpty(): Promise<Term[]> {
    if (this.nonEmpty && this.now() < this.nonEmpty.expiresAt) {
      return this.nonEmpty.terms;
    }
    const expiresAt = this.now() + NON_EMPTY_TTL_MS;
    const generation = this.generation;
    const terms = await this.listAll();
    const counted = await Promise.all(
      terms.map(async (term) => ({ ...term, count: await this.countPublished(term.slug) })),
    );
    const nonEmpty = counted.filter((term) => term.count > 0);
    if (generation === this.generation) {
      this.nonEmpty = { terms: nonEmpty, expiresAt };
    }
    return nonEmpty;
  }

  /** Drops the cached listNonEmpty() result, e.g. after posts change. */
  invalidate(): void {
    this.generation += 1;
    this.nonEmpty = null;
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
