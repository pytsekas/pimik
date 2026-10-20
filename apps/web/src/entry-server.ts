import { createHead, renderSSRHead } from '@unhead/vue/server';
import { uneval } from 'devalue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory } from 'vue-router';
import type { ApiClient } from './api.ts';
import { createVinylApp, type AppState } from './createApp.ts';
import { isRedirectError, loadPage } from './pageData.ts';
import type { SiteConfig } from './siteConfig.ts';

export type RenderResult = {
  html: string;
  /** Tags for `<head>`. */
  head: string;
  /** Attributes for `<html>`, with a leading space. */
  htmlAttrs: string;
  /** JavaScript expression for `window.__STATE__`; safe inside a `<script>`. */
  state: string;
  status: number;
  redirect?: { status: 301; location: string };
};

export async function render(
  url: string,
  api: ApiClient,
  config: SiteConfig,
): Promise<RenderResult> {
  const head = createHead({ disableDefaults: true });
  const { app, router, page } = createVinylApp({ history: createMemoryHistory(), head, config });
  await router.push(url);
  await router.isReady();
  try {
    page.value = await loadPage(router.currentRoute.value, api);
  } catch (error) {
    if (!isRedirectError(error)) throw error;
    return {
      html: '',
      head: '',
      htmlAttrs: '',
      state: '',
      status: 301,
      redirect: { status: 301, location: error.location },
    };
  }
  const html = await renderToString(app);
  const { headTags, htmlAttrs } = renderSSRHead(head);
  const state: AppState = { page: page.value, config };
  return { html, head: headTags, htmlAttrs, state: uneval(state), status: page.value.status };
}
