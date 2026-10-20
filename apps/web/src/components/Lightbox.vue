<script setup lang="ts">
import type { Photo } from '@vinyl/shared';
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from 'vue';
import { photoUrl } from '../photoUrl.ts';

const SWIPE_PX = 50;

const props = defineProps<{ photos: Photo[]; start: number; imageBaseUrl: string }>();
const emit = defineEmits<{ close: [] }>();

const index = ref(props.start);
const current = computed(() => props.photos[index.value]);
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton');
let previousOverflow = '';
let touchStartX = 0;

function step(delta: number): void {
  const count = props.photos.length;
  index.value = (index.value + delta + count) % count;
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
  else if (event.key === 'ArrowRight') step(1);
  else if (event.key === 'ArrowLeft') step(-1);
}

function onTouchStart(event: TouchEvent): void {
  touchStartX = event.changedTouches[0]?.clientX ?? 0;
}

function onTouchEnd(event: TouchEvent): void {
  const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX;
  if (Math.abs(delta) >= SWIPE_PX) step(delta < 0 ? 1 : -1);
}

onMounted(() => {
  previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  window.addEventListener('keydown', onKeydown);
  closeButton.value?.focus();
});

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow;
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    class="lightbox"
    role="dialog"
    aria-modal="true"
    aria-label="Photo viewer"
    @click.self="emit('close')"
    @touchstart.passive="onTouchStart"
    @touchend.passive="onTouchEnd"
  >
    <button ref="closeButton" type="button" class="close" aria-label="Close" @click="emit('close')">
      ×
    </button>
    <img
      v-if="current"
      :src="photoUrl(imageBaseUrl, current.paths.original)"
      :width="current.width"
      :height="current.height"
      alt=""
    />
  </div>
</template>

<style scoped>
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgb(0 0 0 / 0.92);
}

.lightbox img {
  max-width: 100vw;
  max-height: 100vh;
  width: auto;
  height: auto;
  object-fit: contain;
}

.close {
  position: absolute;
  top: 8px;
  right: 12px;
  padding: 0 12px;
  border: 0;
  background: none;
  color: #fff;
  font-size: 40px;
  line-height: 1.2;
  cursor: pointer;
}

.close:focus-visible {
  outline: 2px solid var(--accent);
}
</style>
