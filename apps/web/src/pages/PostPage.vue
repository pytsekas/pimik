<script setup lang="ts">
import type { Post } from '@vinyl/shared';
import { useHead } from '@unhead/vue';
import { usePageData } from '../pageData.ts';

// Placeholder until the real post page lands; only shows the title.
const post = usePageData<Post>();
useHead({ title: () => post.value.title });
</script>

<template>
  <article class="post-page">
    <h2>{{ post.title }}</h2>
  </article>
</template>
