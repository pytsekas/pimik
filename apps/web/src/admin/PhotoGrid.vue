<script setup lang="ts">
import { computed, ref } from 'vue';
import type { UploadItem } from './useUploads.ts';

const props = defineProps<{ items: UploadItem[] }>();
const emit = defineEmits<{ remove: [id: string]; move: [from: number, to: number] }>();

/** The first photo that will be saved; failed items are not part of the post. */
const mainIndex = computed(() => props.items.findIndex((item) => item.state !== 'error'));
const dragFrom = ref<number | null>(null);
const dragOver = ref<number | null>(null);

function caption(item: UploadItem): string {
  if (item.state === 'uploading') return `uploading ${Math.round(item.progress * 100)}%`;
  if (item.state === 'processing') return 'processing…';
  if (item.state === 'error') return item.error ?? 'upload failed';
  return item.fileName;
}

function onDragStart(index: number, event: DragEvent): void {
  dragFrom.value = index;
  event.dataTransfer?.setData('text/plain', String(index));
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
}

/** Only reorders tiles; files dragged in from outside bubble up to the form's drop zone. */
function onDragOver(index: number, event: DragEvent): void {
  if (dragFrom.value === null) return;
  event.preventDefault();
  dragOver.value = index;
}

function onDrop(index: number, event: DragEvent): void {
  if (dragFrom.value === null) return;
  event.preventDefault();
  event.stopPropagation();
  if (dragFrom.value !== index) emit('move', dragFrom.value, index);
  onDragEnd();
}

function onDragEnd(): void {
  dragFrom.value = null;
  dragOver.value = null;
}
</script>

<template>
  <ul class="photos">
    <li
      v-for="(item, index) in items"
      :key="item.id"
      :class="{
        main: index === mainIndex,
        failed: item.state === 'error',
        target: index === dragOver && index !== dragFrom,
      }"
      draggable="true"
      @dragstart="onDragStart(index, $event)"
      @dragover="onDragOver(index, $event)"
      @drop="onDrop(index, $event)"
      @dragend="onDragEnd"
    >
      <img :src="item.previewUrl" :alt="item.fileName" draggable="false" />
      <span v-if="index === mainIndex" class="badge">MAIN</span>
      <button
        type="button"
        class="x"
        :aria-label="`Remove ${item.fileName}`"
        @click="emit('remove', item.id)"
      >
        ×
      </button>
      <div class="bar"><i :style="{ width: `${Math.round(item.progress * 100)}%` }" /></div>
      <div class="n" :title="caption(item)">{{ caption(item) }}</div>
    </li>
  </ul>
</template>

<style scoped>
.photos {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 14px 0 20px;
  padding: 0;
  list-style: none;
}
li {
  position: relative;
  width: 120px;
  cursor: grab;
}
li.target img {
  outline: 3px dashed #888;
  outline-offset: -3px;
}
img {
  display: block;
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 4px;
  background: #eee;
}
li.main img {
  outline: 3px solid #ecae80;
  outline-offset: -3px;
}
li.failed img {
  opacity: 0.35;
}
.badge {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 1px 5px;
  border-radius: 3px;
  background: #ecae80;
  color: #2c3033;
  font-size: 10px;
  font-weight: bold;
}
.x {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: rgb(0 0 0 / 60%);
  color: #fff;
  font-size: 13px;
  line-height: 20px;
  cursor: pointer;
}
.bar {
  height: 4px;
  margin-top: 4px;
  border-radius: 2px;
  background: #ddd;
}
.bar i {
  display: block;
  height: 4px;
  border-radius: 2px;
  background: #4a4;
}
li.failed .bar i {
  background: #c33;
}
.n {
  overflow: hidden;
  margin-top: 2px;
  color: #888;
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
li.failed .n {
  color: #b22;
}
</style>
