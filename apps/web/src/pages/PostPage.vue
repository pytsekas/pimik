<script setup lang="ts">
import type { Post } from '@vinyl/shared';
import PostEntry from '../components/PostEntry.vue';
import { usePageData } from '../pageData.ts';
import { useSeo } from '../seo.ts';
import { useSiteConfig } from '../siteConfig.ts';

const DESCRIPTION_MAX = 160;

const post = usePageData<Post>();
const { imageBaseUrl } = useSiteConfig();

function description(): string {
  const text = post.value.text?.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, DESCRIPTION_MAX) : `${post.value.title} on Vinyl Rehab`;
}

useSeo({
  title: () => post.value.title,
  description,
  image: () => post.value.photos[0]?.paths.w1000,
  path: () =>
    `/${encodeURIComponent(post.value.categorySlug)}/${encodeURIComponent(post.value.slug)}/`,
});
</script>

<template>
  <!-- keyed so the photo selection resets when client navigation lands on another post -->
  <PostEntry :key="post.id" :post="post" :image-base-url="imageBaseUrl" full />
</template>
