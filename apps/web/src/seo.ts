import { useHead } from '@unhead/vue';
import { useSiteConfig } from './siteConfig.ts';

export type SeoOptions = {
  /** Without a title the site-wide default ("Vinyl Rehab – music is my radar") applies. */
  title?: () => string | undefined;
  description: () => string;
  /** Bucket-relative path of the preview image. */
  image?: () => string | undefined;
  /** Canonical path, already encoded, with the trailing slash. */
  path: () => string;
};

/** Title, description, canonical link and Open Graph tags for a public page. */
export function useSeo(options: SeoOptions): void {
  const { imageBaseUrl, siteUrl } = useSiteConfig();
  useHead({
    title: () => options.title?.(),
    link: () => [{ rel: 'canonical', href: `${siteUrl}${options.path()}` }],
    meta: () => {
      const image = options.image?.();
      return [
        { name: 'description', content: options.description() },
        ...(image ? [{ property: 'og:image', content: `${imageBaseUrl}/${image}` }] : []),
      ];
    },
  });
}
