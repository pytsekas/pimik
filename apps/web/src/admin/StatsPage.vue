<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useAdmin } from './context.ts';
import { computeStats, type Stats } from './stats.ts';

const { api } = useAdmin();

const stats = ref<Stats | null>(null);
const error = ref('');

onMounted(async () => {
  try {
    const [posts, categories, tags] = await Promise.all([
      api.listPosts(),
      api.listCategories(),
      api.listTags(),
    ]);
    stats.value = computeStats(posts, categories, tags);
  } catch {
    error.value = 'Could not load statistics.';
  }
});

const tagUrl = (slug: string) => `/tag/${encodeURIComponent(slug)}/`;
</script>

<template>
  <section class="stats">
    <h1>Statistics</h1>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-else-if="!stats" class="muted">Loading…</p>
    <template v-else>
      <dl class="totals">
        <div>
          <dt>Posts</dt>
          <dd>{{ stats.posts }}</dd>
          <dd class="muted">published {{ stats.published }} · drafts {{ stats.drafts }}</dd>
        </div>
        <div>
          <dt>Photos</dt>
          <dd>{{ stats.photos }}</dd>
        </div>
      </dl>

      <p class="muted note">Category and tag counts include drafts.</p>

      <h2>By category</h2>
      <table class="categories">
        <thead>
          <tr>
            <th>Category</th>
            <th>Posts</th>
            <th>Photos</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="category in stats.categories" :key="category.slug">
            <td>{{ category.name }}</td>
            <td>{{ category.posts }}</td>
            <td>{{ category.photos }}</td>
          </tr>
        </tbody>
      </table>

      <h2>
        Tags <span class="muted">({{ stats.tags.length }})</span>
      </h2>
      <p v-if="stats.tags.length === 0" class="muted">No tags yet.</p>
      <ul v-else class="tags">
        <li v-for="tag in stats.tags" :key="tag.slug" :class="{ unused: tag.posts === 0 }">
          <a v-if="tag.published > 0" :href="tagUrl(tag.slug)" target="_blank">{{ tag.name }}</a>
          <span v-else class="name">{{ tag.name }}</span>
          <span class="count muted" :aria-label="`${tag.posts} posts`">{{ tag.posts }}</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 12px;
  font-size: 18px;
}
h2 {
  margin: 24px 0 8px;
  font-size: 15px;
}
.totals {
  display: flex;
  gap: 16px;
  margin: 0;
}
.totals div {
  min-width: 160px;
  padding: 12px 16px;
  border: 1px solid #e4e4e4;
  border-radius: 4px;
  background: #fff;
}
.totals dt {
  color: #777;
  font-size: 12px;
}
.totals dd {
  margin: 0;
  font-size: 24px;
  font-weight: bold;
}
.totals dd.muted {
  font-size: 12px;
  font-weight: normal;
}
table {
  border-collapse: collapse;
}
th,
td {
  padding: 4px 16px 4px 0;
  border-bottom: 1px solid #e4e4e4;
  text-align: left;
}
th:not(:first-child),
td:not(:first-child) {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
th {
  color: #777;
  font-size: 12px;
  font-weight: normal;
}
.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.tags a {
  color: #2c3033;
}
.tags .unused .name {
  color: #767676;
}
.note {
  margin: 8px 0 0;
  font-size: 12px;
}
.error {
  color: #b22;
}
.muted {
  color: #888;
}
</style>
