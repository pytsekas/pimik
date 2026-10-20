import type { Page, Post, Term } from '@vinyl/shared';
import { inject, toRef, type App, type InjectionKey, type Ref } from 'vue';
import type { RouteLocationNormalized, RouteParamsGeneric, Router } from 'vue-router';
import { isNotFoundError, type ApiClient } from './api.ts';

export type LoadContext = { params: RouteParamsGeneric; api: ApiClient };

/** Returns the page data; `null` or a thrown `NotFoundError` renders the 404 page. */
export type PageLoader = (ctx: LoadContext) => Promise<unknown>;

declare module 'vue-router' {
  interface RouteMeta {
    load?: PageLoader;
  }
}

export type PageState = { data: unknown; status: 200 | 404 };

/** Thrown by a loader to send a 301 (SSR) or replace the navigation (client). */
export class RedirectError extends Error {
  location: string;

  constructor(location: string) {
    super(`Redirect to ${location}`);
    this.name = 'RedirectError';
    this.location = location;
  }
}

export function isRedirectError(error: unknown): error is RedirectError {
  return error instanceof Error && error.name === 'RedirectError';
}

const PAGE_STATE_KEY: InjectionKey<Ref<PageState>> = Symbol('pageState');

function param(params: RouteParamsGeneric, name: string): string | undefined {
  const value = params[name];
  return typeof value === 'string' ? value : undefined;
}

function pageNumber(params: RouteParamsGeneric): number | null {
  const raw = param(params, 'page');
  if (raw === undefined) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? page : null;
}

export type ListPageData = {
  posts: Page<Post>;
  categories: Term[];
  tags: Term[];
  category?: string;
  tag?: string;
};

export const loadList: PageLoader = async ({ params, api }) => {
  const page = pageNumber(params);
  if (page === null) return null;
  const category = param(params, 'category');
  const tag = param(params, 'tag');
  const [posts, categories, tags] = await Promise.all([
    api.listPosts({ page, category, tag }),
    api.listCategories(),
    api.listTags(),
  ]);
  return { posts, categories, tags, category, tag } satisfies ListPageData;
};

export const loadPost: PageLoader = async ({ params, api }) => {
  const post = await api.getPostBySlug(param(params, 'slug') ?? '');
  if (!post) return null;
  if (post.categorySlug !== param(params, 'category')) {
    throw new RedirectError(
      `/${encodeURIComponent(post.categorySlug)}/${encodeURIComponent(post.slug)}/`,
    );
  }
  return post;
};

export const loadNotFound: PageLoader = async () => null;

/** Runs the matched route's loader. Redirects and unexpected errors propagate. */
export async function loadPage(route: RouteLocationNormalized, api: ApiClient): Promise<PageState> {
  const load = route.meta.load ?? loadNotFound;
  try {
    const data = await load({ params: route.params, api });
    return data === null ? { data: null, status: 404 } : { data, status: 200 };
  } catch (error) {
    if (isNotFoundError(error)) return { data: null, status: 404 };
    throw error;
  }
}

export function providePageState(app: App, state: Ref<PageState>): void {
  app.provide(PAGE_STATE_KEY, state);
}

function injectPageState(): Ref<PageState> {
  const state = inject(PAGE_STATE_KEY);
  if (!state) throw new Error('page state is not provided');
  return state;
}

/** Data returned by the current route's loader. */
export function usePageData<T>(): Readonly<Ref<T>> {
  const state = injectPageState();
  return toRef(() => state.value.data as T);
}

export function usePageStatus(): Readonly<Ref<PageState['status']>> {
  const state = injectPageState();
  return toRef(() => state.value.status);
}

/**
 * The first navigation reuses the server state; later ones run the loader before
 * the route commits, so the old page never sees the new page's data.
 */
export function installClientLoading(router: Router, api: ApiClient, state: Ref<PageState>): void {
  let initial = true;
  let pending: PageState | undefined;
  router.beforeResolve(async (to) => {
    if (initial) {
      initial = false;
      return true;
    }
    try {
      pending = await loadPage(to, api);
      return true;
    } catch (error) {
      if (isRedirectError(error)) return error.location;
      // Let the server render whatever went wrong.
      window.location.assign(to.fullPath);
      return false;
    }
  });
  router.afterEach((_to, _from, failure) => {
    if (!failure && pending) state.value = pending;
    pending = undefined;
  });
}
