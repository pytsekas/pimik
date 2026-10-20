<script setup lang="ts">
import { slugify, type PostStatus, type Term } from '@vinyl/shared';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';
import { photoUrl } from '../photoUrl.ts';
import { AdminApiError } from './adminApi.ts';
import { useAdmin } from './context.ts';
import PhotoGrid from './PhotoGrid.vue';
import {
  buildPostInput,
  categorySlugOf,
  describeIssues,
  emptyForm,
  formFromPost,
  NEW_CATEGORY,
  validateForm,
  type PostFormState,
} from './postInput.ts';
import TagInput from './TagInput.vue';
import { useUploads } from './useUploads.ts';

const props = defineProps<{ id?: string }>();
const { api, imageBaseUrl, unsaved } = useAdmin();
const router = useRouter();
const uploads = useUploads(api);

const ACCEPT = 'image/jpeg,image/png,image/webp';

const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const error = ref('');
const slugError = ref('');
const savedNotice = ref(false);
const status = ref<PostStatus>('draft');
const categories = ref<Term[]>([]);
const tags = ref<Term[]>([]);
const form = ref<PostFormState>(emptyForm([]));
/** Once the address is typed by hand, the title stops rewriting it. */
const slugEdited = ref(false);
const cleanSnapshot = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const snapshot = () => JSON.stringify([form.value, uploads.items.value.map((item) => item.id)]);
/** Nothing to lose until the form has loaded. */
const dirty = computed(
  () =>
    !loading.value &&
    !loadError.value &&
    (uploads.busy.value || snapshot() !== cleanSnapshot.value),
);
const disabled = computed(() => loading.value || saving.value || uploads.busy.value);
const address = computed(() => `/${categorySlugOf(form.value) || '…'}/${form.value.slug || '…'}/`);

watch(
  () => form.value.title,
  (title) => {
    if (!slugEdited.value) form.value.slug = slugify(title);
  },
);
watch(dirty, (isDirty) => {
  if (isDirty) savedNotice.value = false;
});

/** Clearing the address resumes auto mode, but only before the post's URL has ever existed. */
function onSlugInput(): void {
  slugEdited.value = props.id !== undefined || form.value.slug !== '';
  slugError.value = '';
}

function markClean(): void {
  cleanSnapshot.value = snapshot();
}

onMounted(async () => {
  try {
    const [loadedCategories, loadedTags, post] = await Promise.all([
      api.listCategories(),
      api.listTags(),
      props.id ? api.getPost(props.id) : Promise.resolve(null),
    ]);
    categories.value = loadedCategories;
    tags.value = loadedTags;
    if (post) {
      form.value = formFromPost(post, loadedTags);
      slugEdited.value = true;
      status.value = post.status;
      uploads.reset(post.photos, (photo) => photoUrl(imageBaseUrl, photo.paths.w300));
    } else {
      form.value = emptyForm(loadedCategories);
    }
    markClean();
    showSavedFromCreate();
  } catch (err) {
    loadError.value =
      err instanceof AdminApiError && err.status === 404 ? 'Post not found.' : 'Could not load.';
  } finally {
    loading.value = false;
  }
});

/** "Saved" after a create redirect; the flag is cleared so a reload doesn't show it again. */
function showSavedFromCreate(): void {
  const history = router.options.history;
  if (history.state.saved !== true) return;
  savedNotice.value = true;
  history.replace(router.currentRoute.value.fullPath, { ...history.state, saved: false });
}

function addFiles(files: FileList | null | undefined): void {
  if (files && files.length > 0) uploads.addFiles([...files]);
}

function onPick(): void {
  addFiles(fileInput.value?.files);
  if (fileInput.value) fileInput.value.value = '';
}

function onDrop(event: DragEvent): void {
  addFiles(event.dataTransfer?.files);
}

async function save(nextStatus: PostStatus): Promise<void> {
  if (disabled.value) return;
  error.value = validateForm(form.value, uploads.photos.value.length);
  slugError.value = '';
  if (error.value) return;
  saving.value = true;
  try {
    const input = buildPostInput(form.value, uploads.photos.value, nextStatus, tags.value);
    if (props.id) {
      const saved = await api.updatePost(props.id, input);
      status.value = saved.status;
      markClean();
      savedNotice.value = true;
    } else {
      const saved = await api.createPost(input);
      markClean();
      await router.replace({ path: `/admin/posts/${saved.id}/`, state: { saved: true } });
    }
  } catch (err) {
    showSaveError(err);
  } finally {
    saving.value = false;
  }
}

function showSaveError(err: unknown): void {
  if (!(err instanceof AdminApiError)) {
    error.value = 'Saving failed, try again.';
  } else if (err.code === 'slug_taken') {
    slugError.value = 'address already in use';
    error.value = 'address already in use';
  } else if (err.code === 'invalid_input') {
    error.value = describeIssues(err.issues);
  } else if (err.code === 'unknown_category') {
    error.value = 'unknown category, reload the page';
  } else if (err.status !== 403) {
    error.value = 'Saving failed, try again.';
  }
}

const LEAVE_PROMPT = 'You have unsaved changes. Leave anyway?';

onBeforeRouteLeave(() => !dirty.value || confirm(LEAVE_PROMPT));

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}
window.addEventListener('beforeunload', onBeforeUnload);
onBeforeUnmount(() => window.removeEventListener('beforeunload', onBeforeUnload));

watch(dirty, (isDirty) => (unsaved.value = isDirty), { immediate: true });
onBeforeUnmount(() => (unsaved.value = false));
</script>

<template>
  <section class="post-form">
    <h1>{{ id ? 'Edit post' : 'New post' }}</h1>
    <p v-if="loading" class="muted">Loading…</p>
    <p v-else-if="loadError" class="error" role="alert">{{ loadError }}</p>
    <form v-else @submit.prevent>
      <div class="drop-area" @dragover.prevent @drop.prevent="onDrop">
        <label class="drop">
          Drop photos here, or <u>choose files</u> (many at once)
          <input
            ref="fileInput"
            type="file"
            multiple
            :accept="ACCEPT"
            class="visually-hidden"
            @change="onPick"
          />
        </label>
        <PhotoGrid :items="uploads.items.value" @remove="uploads.remove" @move="uploads.move" />
      </div>

      <div class="row">
        <label for="f-title">Title</label>
        <input id="f-title" v-model="form.title" name="title" class="in" required />
      </div>
      <div class="row">
        <label for="f-category">Category</label>
        <div class="pair">
          <select id="f-category" v-model="form.category" name="category" class="in">
            <option v-for="category in categories" :key="category.slug" :value="category.slug">
              {{ category.name }}
            </option>
            <option :value="NEW_CATEGORY">new category…</option>
          </select>
          <input
            v-if="form.category === NEW_CATEGORY"
            v-model="form.categoryName"
            name="categoryName"
            class="in"
            placeholder="category name"
            aria-label="New category name"
          />
        </div>
      </div>
      <div class="row">
        <span class="label">Tags</span>
        <TagInput v-model="form.tags" :suggestions="tags" />
      </div>
      <div class="row">
        <label for="f-discogs">Discogs link</label>
        <input
          id="f-discogs"
          v-model="form.discogsUrl"
          name="discogsUrl"
          type="url"
          class="in"
          placeholder="https://www.discogs.com/release/…"
        />
      </div>
      <div class="row">
        <label for="f-date">Date</label>
        <input id="f-date" v-model="form.publishedAt" name="publishedAt" type="date" class="in" />
      </div>
      <div class="row top">
        <label for="f-text">Text</label>
        <textarea
          id="f-text"
          v-model="form.text"
          name="text"
          class="in"
          rows="3"
          placeholder="optional, Markdown"
        />
      </div>
      <div class="row">
        <label for="f-slug">Address</label>
        <div>
          <input
            id="f-slug"
            v-model="form.slug"
            name="slug"
            class="in"
            :aria-invalid="slugError !== ''"
            @input="onSlugInput"
          />
          <div class="hint" :class="{ error: slugError }">
            {{ slugError || address }}
          </div>
        </div>
      </div>

      <div class="btns">
        <span v-if="savedNotice" class="saved" role="status">Saved</span>
        <span v-if="error" class="error" role="alert">{{ error }}</span>
        <span v-if="uploads.busy.value" class="muted">waiting for photos…</span>
        <template v-if="status === 'published'">
          <button type="button" class="b2" :disabled="disabled" @click="save('draft')">
            Unpublish
          </button>
          <button type="button" class="b1" :disabled="disabled" @click="save('published')">
            Update
          </button>
        </template>
        <template v-else>
          <button type="button" class="b2" :disabled="disabled" @click="save('draft')">
            Save draft
          </button>
          <button type="button" class="b1" :disabled="disabled" @click="save('published')">
            Publish
          </button>
        </template>
      </div>
    </form>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 16px;
  font-size: 18px;
}
.drop {
  display: block;
  padding: 22px;
  border: 2px dashed #bbb;
  border-radius: 8px;
  background: #fff;
  color: #777;
  text-align: center;
  cursor: pointer;
}
.drop:focus-within {
  border-color: #2c3033;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.row {
  display: grid;
  grid-template-columns: 110px 1fr;
  gap: 8px 12px;
  align-items: center;
  margin-bottom: 10px;
}
.row.top {
  align-items: start;
}
.row > label,
.label {
  color: #555;
}
.pair {
  display: flex;
  gap: 8px;
}
.in {
  width: 100%;
  padding: 7px 9px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  font: inherit;
}
.in[aria-invalid='true'] {
  border-color: #c33;
}
textarea.in {
  resize: vertical;
}
.hint {
  margin-top: 3px;
  color: #888;
  font-size: 12px;
}
.btns {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: flex-end;
  margin-top: 18px;
}
.error {
  color: #b22;
}
.saved {
  color: #383;
  font-weight: bold;
}
.muted {
  color: #888;
}
</style>
