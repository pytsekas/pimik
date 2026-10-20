import { createRouter, type RouteRecordRaw, type Router, type RouterHistory } from 'vue-router';
import { loadList, loadNotFound, loadPost } from './pageData.ts';
import ListPage from './pages/ListPage.vue';
import NotFound from './pages/NotFound.vue';
import PostPage from './pages/PostPage.vue';

const PAGE = ':page(\\d+)';

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: ListPage, meta: { load: loadList } },
  { path: `/page/${PAGE}/`, name: 'homePage', component: ListPage, meta: { load: loadList } },
  { path: '/category/:category/', name: 'category', component: ListPage, meta: { load: loadList } },
  {
    path: `/category/:category/page/${PAGE}/`,
    name: 'categoryPage',
    component: ListPage,
    meta: { load: loadList },
  },
  { path: '/tag/:tag/', name: 'tag', component: ListPage, meta: { load: loadList } },
  {
    path: `/tag/:tag/page/${PAGE}/`,
    name: 'tagPage',
    component: ListPage,
    meta: { load: loadList },
  },
  // Outranks the post route, so `/page/abc/`, `/tag/x/y/`, ... never reach a post lookup.
  {
    path: '/:reserved(category|tag|page|admin)/:rest(.*)*',
    component: NotFound,
    meta: { load: loadNotFound },
  },
  { path: '/:category/:slug/', name: 'post', component: PostPage, meta: { load: loadPost } },
  { path: '/:pathMatch(.*)*', name: 'notFound', component: NotFound, meta: { load: loadNotFound } },
];

export function createAppRouter(history: RouterHistory): Router {
  return createRouter({
    history,
    routes,
    strict: true,
    scrollBehavior: (_to, _from, saved) => saved ?? { top: 0 },
  });
}
