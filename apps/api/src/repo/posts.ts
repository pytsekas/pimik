import type { Page, Post } from '@vinyl/shared';
import type { Firestore, Query } from 'firebase-admin/firestore';

const PAGE_SIZE = 10;

export type PostFields = Omit<Post, 'id' | 'createdAt' | 'updatedAt'>;

export class SlugTakenError extends Error {
  readonly slug: string;

  constructor(slug: string) {
    super(`Slug already in use: ${slug}`);
    this.name = 'SlugTakenError';
    this.slug = slug;
  }
}

export class PostNotFoundError extends Error {
  constructor(id: string) {
    super(`Post not found: ${id}`);
    this.name = 'PostNotFoundError';
  }
}

export class PostRepo {
  private readonly db: Firestore;

  constructor(db: Firestore) {
    this.db = db;
  }

  async listPublished(opts: {
    page: number;
    category?: string;
    tag?: string;
  }): Promise<Page<Post>> {
    let query: Query = this.db.collection('posts').where('status', '==', 'published');
    if (opts.category) {
      query = query.where('categorySlug', '==', opts.category);
    }
    if (opts.tag) {
      query = query.where('tagSlugs', 'array-contains', opts.tag);
    }
    const [count, snapshot] = await Promise.all([
      query.count().get(),
      query
        .orderBy('publishedAt', 'desc')
        .orderBy('createdAt', 'desc')
        .offset((opts.page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .get(),
    ]);
    return {
      items: snapshot.docs.map((doc) => toPost(doc.id, doc.data())),
      page: opts.page,
      totalPages: Math.ceil(count.data().count / PAGE_SIZE),
    };
  }

  async listAll(): Promise<Post[]> {
    const snapshot = await this.db
      .collection('posts')
      .orderBy('publishedAt', 'desc')
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map((doc) => toPost(doc.id, doc.data()));
  }

  async getById(id: string): Promise<Post | null> {
    const doc = await this.db.collection('posts').doc(id).get();
    return doc.exists ? toPost(doc.id, doc.data() ?? {}) : null;
  }

  async getBySlug(slug: string): Promise<Post | null> {
    return this.findOne('slug', slug);
  }

  async getByWpId(wpId: number): Promise<Post | null> {
    return this.findOne('wpId', wpId);
  }

  async create(input: PostFields): Promise<Post> {
    const ref = this.db.collection('posts').doc();
    const now = new Date().toISOString();
    const post: Post = { ...input, id: ref.id, createdAt: now, updatedAt: now };
    await this.db.runTransaction(async (tx) => {
      const slugRef = this.slugRef(input.slug);
      if ((await tx.get(slugRef)).exists) {
        throw new SlugTakenError(input.slug);
      }
      tx.set(slugRef, { postId: ref.id });
      tx.set(ref, toDoc(post));
    });
    return post;
  }

  async update(id: string, input: PostFields): Promise<Post> {
    const ref = this.db.collection('posts').doc(id);
    return this.db.runTransaction(async (tx) => {
      const [postDoc, slugDoc] = await Promise.all([tx.get(ref), tx.get(this.slugRef(input.slug))]);
      if (!postDoc.exists) {
        throw new PostNotFoundError(id);
      }
      const existing = toPost(id, postDoc.data() ?? {});
      if (slugDoc.exists && slugDoc.data()?.postId !== id) {
        throw new SlugTakenError(input.slug);
      }
      const post: Post = {
        ...input,
        id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      };
      if (existing.slug !== input.slug) {
        tx.delete(this.slugRef(existing.slug));
        tx.set(this.slugRef(input.slug), { postId: id });
      }
      tx.set(ref, toDoc(post));
      return post;
    });
  }

  async delete(id: string): Promise<Post | null> {
    const ref = this.db.collection('posts').doc(id);
    return this.db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      if (!doc.exists) {
        return null;
      }
      const post = toPost(id, doc.data() ?? {});
      tx.delete(this.slugRef(post.slug));
      tx.delete(ref);
      return post;
    });
  }

  private async findOne(field: string, value: string | number): Promise<Post | null> {
    const snapshot = await this.db.collection('posts').where(field, '==', value).limit(1).get();
    const doc = snapshot.docs[0];
    return doc ? toPost(doc.id, doc.data()) : null;
  }

  private slugRef(slug: string) {
    return this.db.collection('slugs').doc(encodeURIComponent(slug));
  }
}

function toDoc(post: Post): Omit<Post, 'id'> {
  const { id: _id, ...fields } = post;
  return fields;
}

function toPost(id: string, data: FirebaseFirestore.DocumentData): Post {
  return { ...(data as Omit<Post, 'id'>), id };
}
