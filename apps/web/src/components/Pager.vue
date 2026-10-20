<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';

const props = defineProps<{ page: number; totalPages: number; basePath: string }>();

/** Page 1 lives at the base path itself. */
function pagePath(page: number): string {
  return page === 1 ? props.basePath : `${props.basePath.replace(/\/$/, '')}/page/${page}/`;
}

const newer = computed(() => (props.page > 1 ? pagePath(props.page - 1) : null));
const older = computed(() => (props.page < props.totalPages ? pagePath(props.page + 1) : null));
</script>

<template>
  <nav v-if="newer || older" class="pager" aria-label="Pages">
    <RouterLink v-if="newer" :to="newer" rel="prev" class="newer">← newer</RouterLink>
    <RouterLink v-if="older" :to="older" rel="next" class="older">older →</RouterLink>
  </nav>
</template>

<style scoped>
.pager {
  display: flex;
  justify-content: space-between;
  max-width: var(--max-photo);
  margin: 0 auto;
  padding: 8px 0 32px;
}

.older {
  margin-left: auto;
}
</style>
