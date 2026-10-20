<script setup lang="ts">
import type { Photo } from '@vinyl/shared';
import { photoUrl } from '../photoUrl.ts';

defineProps<{ photos: Photo[]; imageBaseUrl: string }>();
const selected = defineModel<number>('selected', { default: 0 });
</script>

<template>
  <div class="thumbs">
    <button
      v-for="(photo, index) in photos"
      :key="photo.id"
      type="button"
      class="thumb"
      :class="{ on: index === selected }"
      :aria-label="`Photo ${index + 1} of ${photos.length}`"
      :aria-current="index === selected"
      @click="selected = index"
    >
      <img
        :src="photoUrl(imageBaseUrl, photo.paths.w300)"
        width="120"
        height="120"
        alt=""
        loading="lazy"
        decoding="async"
      />
    </button>
  </div>
</template>

<style scoped>
.thumbs {
  display: flex;
  gap: 8px;
  margin-top: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
}

.thumb {
  flex: 0 0 auto;
  width: 120px;
  height: 120px;
  padding: 0;
  border: 0;
  background: none;
  cursor: pointer;
  opacity: 0.7;
}

.thumb img {
  display: block;
  width: 120px;
  height: 120px;
  object-fit: cover;
}

.thumb.on {
  opacity: 1;
  outline: 3px solid var(--accent);
  outline-offset: -3px;
}
</style>
