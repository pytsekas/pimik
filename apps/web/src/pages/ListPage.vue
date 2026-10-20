<script setup lang="ts">
import { computed } from 'vue';
import PostEntry from '../components/PostEntry.vue';
import Pager from '../components/Pager.vue';
import { usePageData, type ListPageData } from '../pageData.ts';
import { useSeo } from '../seo.ts';
import { useSiteConfig } from '../siteConfig.ts';

const SITE_TAGLINE = 'Vinyl Rehab – music is my radar';

const data = usePageData<ListPageData>();
const { imageBaseUrl } = useSiteConfig();

const heading = computed(() => {
  const { category, tag, categories, tags } = data.value;
  if (category) return categories.find((term) => term.slug === category)?.name ?? category;
  if (tag) return tags.find((term) => term.slug === tag)?.name ?? tag;
  return undefined;
});

const basePath = computed(() => {
  const { category, tag } = data.value;
  if (category) return `/category/${encodeURIComponent(category)}/`;
  if (tag) return `/tag/${encodeURIComponent(tag)}/`;
  return '/';
});

const tagNames = computed(() =>
  Object.fromEntries(data.value.tags.map((term) => [term.slug, term.name])),
);

const currentPath = computed(() => {
  const { page } = data.value.posts;
  return page === 1 ? basePath.value : `${basePath.value}page/${page}/`;
});

useSeo({
  title: () => heading.value,
  description: () => (heading.value ? `${heading.value} – ${SITE_TAGLINE}` : SITE_TAGLINE),
  image: () => data.value.posts.items[0]?.photos[0]?.paths.w1000,
  path: () => currentPath.value,
});
</script>

<template>
  <section class="list-page">
    <h2 v-if="heading" class="list-heading">{{ heading }}</h2>
    <PostEntry
      v-for="(post, index) in data.posts.items"
      :key="post.id"
      :post="post"
      :image-base-url="imageBaseUrl"
      :lazy="index > 0"
      :tag-names="tagNames"
    />
    <Pager :page="data.posts.page" :total-pages="data.posts.totalPages" :base-path="basePath" />
  </section>
</template>

<style scoped>
.list-page {
  max-width: var(--max-photo);
  margin: 0 auto;
}

.list-heading {
  margin: 8px 0 0;
  font-size: 32px;
  color: var(--text-strong);
}
</style>
