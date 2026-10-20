import { inject, type App, type InjectionKey } from 'vue';

/** Runtime config the app needs on both server and client; travels in `window.__STATE__`. */
export type SiteConfig = { imageBaseUrl: string; siteUrl: string };

const SITE_CONFIG_KEY: InjectionKey<SiteConfig> = Symbol('siteConfig');

export function provideSiteConfig(app: App, config: SiteConfig): void {
  app.provide(SITE_CONFIG_KEY, config);
}

export function useSiteConfig(): SiteConfig {
  const config = inject(SITE_CONFIG_KEY);
  if (!config) throw new Error('site config is not provided');
  return config;
}
