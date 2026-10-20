import type { VueHeadClient } from '@unhead/vue';
import { createSSRApp, ref } from 'vue';
import type { RouterHistory } from 'vue-router';
import AppRoot from './App.vue';
import { providePageState, type PageState } from './pageData.ts';
import { createAppRouter } from './router.ts';
import { provideSiteConfig, type SiteConfig } from './siteConfig.ts';

/** Everything the server hands to the client through `window.__STATE__`. */
export type AppState = { page: PageState; config: SiteConfig };

export type AppOptions = {
  history: RouterHistory;
  head: VueHeadClient;
  config: SiteConfig;
};

/** Shared by both entries; the caller fills `page` (server: loader, client: `__STATE__`). */
export function createVinylApp({ history, head, config }: AppOptions) {
  const app = createSSRApp(AppRoot);
  const router = createAppRouter(history);
  const page = ref<PageState>({ data: null, status: 200 });
  app.use(router);
  app.use(head);
  providePageState(app, page);
  provideSiteConfig(app, config);
  return { app, router, page };
}
