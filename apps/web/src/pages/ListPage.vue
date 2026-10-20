<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { usePageData, type ListPageData } from '../pageData.ts';

// Placeholder until the real list page lands; only shows the post titles.
const data = usePageData<ListPageData>();
</script>

<template>
  <section class="list-page">
    <article v-for="post in data.posts.items" :key="post.id">
      <h2>
        <RouterLink :to="`/${post.categorySlug}/${post.slug}/`">{{ post.title }}</RouterLink>
      </h2>
    </article>
  </section>
</template>
