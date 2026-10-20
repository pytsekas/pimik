<script setup lang="ts">
import { slugify, type Term } from '@vinyl/shared';
import { computed, ref } from 'vue';

const props = defineProps<{ modelValue: Term[]; suggestions: Term[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: Term[]] }>();

const MAX_SUGGESTIONS = 8;

const text = ref('');
/**
 * Highlighted index into `matches`, the one Enter adds; typing highlights the first match.
 * -1 (after Escape) makes Enter add the typed text, as a comma always does.
 */
const active = ref(0);

const chosen = computed(() => new Set(props.modelValue.map((tag) => tag.slug)));
const matches = computed(() => {
  const query = text.value.trim().toLowerCase();
  if (!query) return [];
  const slug = slugify(query);
  return props.suggestions
    .filter((tag) => !chosen.value.has(tag.slug))
    .filter((tag) => tag.name.toLowerCase().includes(query) || (slug && tag.slug.includes(slug)))
    .slice(0, MAX_SUGGESTIONS);
});

function add(tag: Term): void {
  if (!tag.slug || chosen.value.has(tag.slug)) return;
  emit('update:modelValue', [...props.modelValue, tag]);
}

/** A typed name that matches an existing tag reuses it instead of creating a new one. */
function addTyped(): void {
  const name = text.value.trim();
  if (!name) return;
  const slug = slugify(name);
  const existing = props.suggestions.find(
    (tag) => tag.slug === slug || tag.name.toLowerCase() === name.toLowerCase(),
  );
  add(existing ?? { slug, name });
}

function commit(tag?: Term): void {
  if (tag) add(tag);
  else addTyped();
  text.value = '';
  active.value = 0;
}

function onKeydown(event: KeyboardEvent): void {
  const count = matches.value.length;
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    commit(event.key === 'Enter' ? matches.value[active.value] : undefined);
  } else if (event.key === 'ArrowDown' && count > 0) {
    event.preventDefault();
    active.value = (active.value + 1) % count;
  } else if (event.key === 'ArrowUp' && count > 0) {
    event.preventDefault();
    active.value = active.value <= 0 ? count - 1 : active.value - 1;
  } else if (event.key === 'Escape') {
    active.value = -1;
  } else if (event.key === 'Backspace' && text.value === '' && props.modelValue.length > 0) {
    emit('update:modelValue', props.modelValue.slice(0, -1));
  }
}

function onInput(): void {
  active.value = 0;
}

function remove(slug: string): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((tag) => tag.slug !== slug),
  );
}
</script>

<template>
  <div class="tags">
    <span v-for="tag in modelValue" :key="tag.slug" class="chip">
      <span>{{ tag.name }}</span>
      <button type="button" :aria-label="`Remove tag ${tag.name}`" @click="remove(tag.slug)">
        ×
      </button>
    </span>
    <div class="entry">
      <input
        v-model="text"
        name="tags"
        type="text"
        autocomplete="off"
        placeholder="type to add, suggests existing…"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="matches.length > 0"
        @keydown="onKeydown"
        @input="onInput"
        @blur="active = -1"
      />
      <ul v-if="matches.length > 0" class="suggestions" role="listbox">
        <li
          v-for="(tag, index) in matches"
          :key="tag.slug"
          role="option"
          :aria-selected="index === active"
          :class="{ active: index === active }"
          @mousedown.prevent="commit(tag)"
        >
          {{ tag.name }}
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 4px 6px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px 4px 2px 9px;
  border-radius: 10px;
  background: #eee;
  font-size: 12px;
}
.chip button {
  padding: 0 4px;
  border: 0;
  background: none;
  color: #666;
  cursor: pointer;
}
.entry {
  position: relative;
  flex: 1;
  min-width: 160px;
}
input {
  width: 100%;
  padding: 3px;
  border: 0;
  outline: none;
  font: inherit;
}
.suggestions {
  position: absolute;
  z-index: 1;
  top: 100%;
  left: 0;
  min-width: 180px;
  margin: 2px 0 0;
  padding: 4px 0;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  box-shadow: 0 2px 6px rgb(0 0 0 / 12%);
  list-style: none;
}
.suggestions li {
  padding: 4px 10px;
  cursor: pointer;
}
.suggestions li:hover,
.suggestions li.active {
  background: #f0e3d8;
}
</style>
