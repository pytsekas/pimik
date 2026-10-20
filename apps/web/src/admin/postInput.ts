import {
  slugify,
  type Photo,
  type Post,
  type PostInputData,
  type PostStatus,
  type Term,
} from '@vinyl/shared';

/** `<select>` value of the "new category…" option. */
export const NEW_CATEGORY = '__new__';

export type PostFormState = {
  title: string;
  slug: string;
  /** A known category slug, or NEW_CATEGORY. */
  category: string;
  categoryName: string;
  tags: Term[];
  discogsUrl: string;
  publishedAt: string;
  text: string;
};

/** Local date as YYYY-MM-DD. */
export function today(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The busiest category is the likely one for a new post. */
function defaultCategory(categories: Term[]): string {
  const [first] = [...categories].sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  return first?.slug ?? NEW_CATEGORY;
}

export function emptyForm(categories: Term[]): PostFormState {
  return {
    title: '',
    slug: '',
    category: defaultCategory(categories),
    categoryName: '',
    tags: [],
    discogsUrl: '',
    publishedAt: today(),
    text: '',
  };
}

export function formFromPost(post: Post, knownTags: Term[]): PostFormState {
  const names = new Map(knownTags.map((tag) => [tag.slug, tag.name]));
  return {
    title: post.title,
    slug: post.slug,
    category: post.categorySlug,
    categoryName: '',
    tags: post.tagSlugs.map((slug) => ({ slug, name: names.get(slug) ?? slug })),
    discogsUrl: post.discogsUrl ?? '',
    publishedAt: post.publishedAt,
    text: post.text ?? '',
  };
}

export function categorySlugOf(form: PostFormState): string {
  return form.category === NEW_CATEGORY ? slugify(form.categoryName) : form.category;
}

/** Existing tags travel as slugs, new ones as names (the api creates them). */
export function buildPostInput(
  form: PostFormState,
  photos: Photo[],
  status: PostStatus,
  knownTags: Term[],
): PostInputData {
  const known = new Set(knownTags.map((tag) => tag.slug));
  const newTags = form.tags.filter((tag) => !known.has(tag.slug)).map((tag) => tag.name);
  return {
    slug: form.slug,
    title: form.title.trim(),
    categorySlug: categorySlugOf(form),
    ...(form.category === NEW_CATEGORY ? { categoryName: form.categoryName.trim() } : {}),
    tagSlugs: form.tags.filter((tag) => known.has(tag.slug)).map((tag) => tag.slug),
    ...(newTags.length > 0 ? { tagNames: newTags } : {}),
    discogsUrl: form.discogsUrl.trim(),
    text: form.text,
    publishedAt: form.publishedAt,
    status,
    photos,
  };
}

/** The same post with another status, for actions outside the form (Unpublish in the list). */
export function postToInput(post: Post, status: PostStatus): PostInputData {
  return {
    slug: post.slug,
    title: post.title,
    categorySlug: post.categorySlug,
    tagSlugs: post.tagSlugs,
    discogsUrl: post.discogsUrl ?? '',
    text: post.text ?? '',
    publishedAt: post.publishedAt,
    status,
    photos: post.photos,
  };
}

/** Client-side checks the api would also make; returns the first problem, or ''. */
export function validateForm(form: PostFormState, photoCount: number): string {
  if (!form.title.trim()) return 'title is required';
  if (form.category === NEW_CATEGORY && !categorySlugOf(form)) return 'category name is required';
  if (!form.slug) return 'address is required';
  if (photoCount === 0) return 'add at least one photo';
  return '';
}

const FIELD_LABELS: Record<string, string> = {
  slug: 'address',
  title: 'title',
  categorySlug: 'category',
  categoryName: 'category',
  discogsUrl: 'Discogs link',
  publishedAt: 'date',
  photos: 'photos',
};

/** Turns the api's zod issues into one line, e.g. "Discogs link: Must be a discogs.com URL". */
export function describeIssues(issues: unknown): string {
  if (!Array.isArray(issues) || issues.length === 0) return 'please check the fields';
  return issues
    .map((issue: { path?: unknown[]; message?: string }) => {
      const key = issue.path?.[0];
      const field = typeof key === 'string' || typeof key === 'number' ? String(key) : '';
      return `${FIELD_LABELS[field] ?? field}: ${issue.message ?? 'invalid'}`;
    })
    .join('; ');
}
