<script setup lang="ts">
import type { Post } from '@vinyl/shared';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import { renderMarkdown } from '../markdown.ts';
import { photoUrl } from '../photoUrl.ts';
import Lightbox from './Lightbox.vue';
import ThumbStrip from './ThumbStrip.vue';

const props = withDefaults(
  defineProps<{
    post: Post;
    imageBaseUrl: string;
    full?: boolean;
    /** Defer the big photo; set for every entry but the first on a page. */
    lazy?: boolean;
    /** Tag slug → display name; a missing entry falls back to the slug. */
    tagNames?: Record<string, string>;
  }>(),
  { full: false, lazy: false, tagNames: () => ({}) },
);

// A thumbnail click fades the big photo out, swaps it while invisible and fades it back in once
// the new photo has loaded, so a half-loaded photo never shows. Keep in step with the CSS transition.
const FADE_MS = 150;

const selected = ref(0);
const shown = ref(0);
// Whether the photo in `shown` has finished loading; the server-rendered one counts as loaded.
const loaded = ref(true);
const fading = ref(false);
const lightboxOpen = ref(false);
let swapTimer: ReturnType<typeof setTimeout> | undefined;

const current = computed(() => props.post.photos[shown.value]);

const show = (index: number) => {
  if (shown.value === index) return;
  shown.value = index;
  loaded.value = false;
};

watch(selected, (index) => {
  clearTimeout(swapTimer);
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    show(index);
    fading.value = false;
    return;
  }
  fading.value = true;
  swapTimer = setTimeout(() => {
    show(index);
    // Back on the photo already showing: its load event may have come already.
    if (loaded.value) fading.value = false;
  }, FADE_MS);
});

const photoReady = () => {
  loaded.value = true;
  if (shown.value === selected.value) fading.value = false;
};

onBeforeUnmount(() => clearTimeout(swapTimer));

const postPath = computed(
  () => `/${encodeURIComponent(props.post.categorySlug)}/${encodeURIComponent(props.post.slug)}/`,
);
// Safe for v-html: markdown-it runs with html:false, so raw markup is escaped.
const html = computed(() => (props.post.text ? renderMarkdown(props.post.text) : ''));

const srcset = computed(() => {
  const photo = current.value;
  if (!photo) return undefined;
  const url = (path: string) => photoUrl(props.imageBaseUrl, path);
  return [
    `${url(photo.paths.w300)} 300w`,
    `${url(photo.paths.w1000)} 1000w`,
    `${url(photo.paths.original)} ${photo.width}w`,
  ].join(', ');
});
</script>

<template>
  <article class="post">
    <div v-if="current" class="photo-block">
      <img
        class="hero"
        :class="{ fading }"
        :src="photoUrl(imageBaseUrl, current.paths.original)"
        :srcset="srcset"
        sizes="(max-width: 2000px) 100vw, 2000px"
        :width="current.width"
        :height="current.height"
        :alt="post.title"
        :loading="lazy ? 'lazy' : undefined"
        decoding="async"
        @click="lightboxOpen = true"
        @load="photoReady"
        @error="photoReady"
      />
      <ThumbStrip
        v-if="post.photos.length > 1"
        v-model:selected="selected"
        :photos="post.photos"
        :image-base-url="imageBaseUrl"
      />
    </div>
    <div class="meta">
      {{ post.publishedAt }} ·
      <RouterLink class="cat" :to="`/category/${encodeURIComponent(post.categorySlug)}/`">{{
        post.categorySlug
      }}</RouterLink>
      <template v-if="post.discogsUrl">
        ·
        <a :href="post.discogsUrl" target="_blank" rel="noopener noreferrer">discogs ↗</a>
      </template>
    </div>
    <h2 class="title">
      <RouterLink :to="postPath">{{ post.title }}</RouterLink>
    </h2>
    <div v-if="post.tagSlugs.length" class="tags">
      <RouterLink
        v-for="slug in post.tagSlugs"
        :key="slug"
        :to="`/tag/${encodeURIComponent(slug)}/`"
        >#{{ tagNames[slug] ?? slug }}</RouterLink
      >
    </div>
    <div v-if="full && html" class="text" v-html="html" />
    <!-- v-if on the Teleport itself: an empty Teleport hydrates with a stray comment node -->
    <Teleport v-if="lightboxOpen" to="body">
      <Lightbox
        :photos="post.photos"
        :start="selected"
        :image-base-url="imageBaseUrl"
        @close="lightboxOpen = false"
      />
    </Teleport>
  </article>
</template>

<style scoped>
.post {
  margin: 32px 0 48px;
}

.photo-block {
  width: 100%;
  max-width: var(--max-photo);
  margin: 0 auto;
}

.hero {
  display: block;
  width: 100%;
  height: auto;
  cursor: zoom-in;
  transition: opacity 150ms ease; /* FADE_MS */
}

.hero.fading {
  opacity: 0;
}

.meta,
.title,
.tags,
.text {
  max-width: var(--max-photo);
  margin-left: auto;
  margin-right: auto;
}

.meta {
  margin-top: 10px;
  font: 13px sans-serif;
  color: var(--text-muted);
}

.cat {
  padding: 1px 7px;
  border-radius: 3px;
  background: var(--accent);
  color: var(--dark);
  font-size: 12px;
  text-decoration: none;
}

.title {
  margin-top: 4px;
  margin-bottom: 4px;
  font-size: 28px;
}

.title a {
  color: var(--text-strong);
  text-decoration: none;
}

.title a:hover {
  color: var(--accent);
}

.tags {
  font: 12px sans-serif;
}

.tags a {
  margin-right: 8px;
  text-decoration: none;
}

.text {
  margin-top: 16px;
  max-width: 720px;
}
</style>
