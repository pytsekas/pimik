import { createRouter, type Router, type RouterHistory } from 'vue-router';
import PostForm from './PostForm.vue';
import PostsList from './PostsList.vue';
import StatsPage from './StatsPage.vue';

/** The admin SPA's own router; the public site's router never handles `/admin/*`. */
export function createAdminRouter(history: RouterHistory): Router {
  return createRouter({
    history,
    strict: true,
    routes: [
      { path: '/admin/', name: 'posts', component: PostsList },
      { path: '/admin/posts/new/', name: 'newPost', component: PostForm },
      { path: '/admin/posts/:id/', name: 'editPost', component: PostForm, props: true },
      { path: '/admin/stats/', name: 'stats', component: StatsPage },
      { path: '/admin/:rest(.*)*', redirect: '/admin/' },
    ],
  });
}
