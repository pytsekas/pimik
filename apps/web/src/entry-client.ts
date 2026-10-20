import { createHead } from '@unhead/vue/client';
import { createWebHistory } from 'vue-router';
import { createApiClient } from './api.ts';
import { createVinylApp, type AppState } from './createApp.ts';
import { installClientLoading } from './pageData.ts';

async function startPublicSite(state: AppState): Promise<void> {
  const { app, router, page } = createVinylApp({
    history: createWebHistory(),
    head: createHead(),
    config: state.config,
  });
  page.value = state.page;
  installClientLoading(router, createApiClient(window.location.origin), page);
  await router.isReady();
  app.mount('#app');
}

if (window.location.pathname.startsWith('/admin/')) {
  void import('./admin/main.ts').then(({ startAdmin }) => startAdmin());
} else {
  void startPublicSite(window.__STATE__ as AppState);
}
