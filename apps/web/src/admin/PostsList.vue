<script setup lang="ts">
import type { Post } from '@vinyl/shared';
import { computed, onMounted, ref } from 'vue';
import { photoUrl } from '../photoUrl.ts';
import { useAdmin } from './context.ts';
import { postToInput } from './postInput.ts';

const { api, imageBaseUrl } = useAdmin();

const posts = ref<Post[]>([]);
const categoryNames = ref(new Map<string, string>());
const loading = ref(true);
const error = ref('');
const pending = ref<string | null>(null);

const count = computed(() => posts.value.length);

onMounted(async () => {
  try {
    const [loaded, categories] = await Promise.all([api.listPosts(), api.listCategories()]);
    posts.value = loaded;
    categoryNames.value = new Map(categories.map((category) => [category.slug, category.name]));
  } catch {
    error.value = 'Could not load posts.';
  } finally {
    loading.value = false;
  }
});

const publicUrl = (post: Post) =>
  `/${encodeURIComponent(post.categorySlug)}/${encodeURIComponent(post.slug)}/`;

async function act(post: Post, action: () => Promise<void>, failure: string): Promise<void> {
  pending.value = post.id;
  error.value = '';
  try {
    await action();
  } catch {
    error.value = failure;
  } finally {
    pending.value = null;
  }
}

function unpublish(post: Post): Promise<void> {
  return act(
    post,
    async () => {
      const saved = await api.updatePost(post.id, postToInput(post, 'draft'));
      posts.value = posts.value.map((candidate) => (candidate.id === post.id ? saved : candidate));
    },
    `Could not unpublish '${post.title}'.`,
  );
}

async function remove(post: Post): Promise<void> {
  if (!confirm(`Delete '${post.title}' and its photos?`)) return;
  await act(
    post,
    async () => {
      await api.deletePost(post.id);
      posts.value = posts.value.filter((candidate) => candidate.id !== post.id);
    },
    `Could not delete '${post.title}'.`,
  );
}
</script>

<template>
  <section class="posts-list">
    <div class="head">
      <h1>
        Posts <span v-if="!loading" class="muted">({{ count }})</span>
      </h1>
      <RouterLink to="/admin/posts/new/" class="b1">New post</RouterLink>
    </div>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="count === 0 && !error" class="muted">No posts yet.</p>
    <ul v-else class="rows">
      <li v-for="post in posts" :key="post.id">
        <img
          v-if="post.photos[0]"
          :src="photoUrl(imageBaseUrl, post.photos[0].paths.w300)"
          alt=""
          loading="lazy"
          width="90"
          height="90"
        />
        <span v-else class="no-photo" />
        <div class="info">
          <RouterLink :to="`/admin/posts/${post.id}/`" class="title">{{ post.title }}</RouterLink>
          <div class="meta">
            {{ categoryNames.get(post.categorySlug) ?? post.categorySlug }} · {{ post.publishedAt }}
            <span class="status" :class="post.status">{{ post.status }}</span>
          </div>
        </div>
        <div class="actions">
          <a v-if="post.status === 'published'" :href="publicUrl(post)" target="_blank">View</a>
          <RouterLink :to="`/admin/posts/${post.id}/`">Edit</RouterLink>
          <button
            v-if="post.status === 'published'"
            type="button"
            :disabled="pending === post.id"
            @click="unpublish(post)"
          >
            Unpublish
          </button>
          <button
            type="button"
            class="danger"
            :disabled="pending === post.id"
            @click="remove(post)"
          >
            Delete
          </button>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
h1 {
  margin: 0;
  font-size: 18px;
}
.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}
li {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #e4e4e4;
}
img,
.no-photo {
  flex: none;
  width: 90px;
  height: 90px;
  border-radius: 4px;
  background: #e4e4e4;
  object-fit: cover;
}
.info {
  flex: 1;
  min-width: 0;
}
.title {
  color: #222;
  font-weight: bold;
  text-decoration: none;
}
.title:hover {
  text-decoration: underline;
}
.meta {
  margin-top: 2px;
  color: #777;
  font-size: 12px;
}
.status {
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 11px;
  text-transform: uppercase;
}
.status.published {
  background: #dcefd9;
  color: #2d6a2d;
}
.status.draft {
  background: #eee;
  color: #666;
}
.actions {
  display: flex;
  gap: 10px;
  align-items: center;
  font-size: 13px;
}
.actions a {
  color: #2c3033;
}
.actions button {
  padding: 0;
  border: 0;
  background: none;
  color: #2c3033;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.actions .danger {
  color: #b22;
}
.error {
  color: #b22;
}
.muted {
  color: #888;
}
</style>
