import { createApp } from 'vue';
import { createWebHistory } from 'vue-router';
import AdminApp from './AdminApp.vue';
import { createAdminApi } from './adminApi.ts';
import { forbidden, getIdToken, initAuth } from './auth.ts';
import { provideAdmin } from './context.ts';
import { createAdminRouter } from './router.ts';

/** Client-only admin; the server sends it an empty shell, never SSR content. */
export function startAdmin(): void {
  document.title = 'Admin – Vinyl Rehab';
  document.documentElement.classList.add('admin-page');
  let configError = '';
  try {
    initAuth();
  } catch (err) {
    configError = err instanceof Error ? err.message : String(err);
  }
  const api = createAdminApi({
    getIdToken,
    onForbidden: () => {
      forbidden.value = true;
    },
  });
  const app = createApp(AdminApp, { configError });
  app.use(createAdminRouter(createWebHistory()));
  provideAdmin(app, { api, imageBaseUrl: window.__ADMIN_CONFIG__?.imageBaseUrl ?? '' });
  app.mount('#app');
}
