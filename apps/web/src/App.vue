<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { RouterView } from 'vue-router';
import SiteHeader from './components/SiteHeader.vue';
import NotFound from './pages/NotFound.vue';
import { usePageStatus } from './pageData.ts';

const SITE_NAME = 'Vinyl Rehab';

useHead({
  htmlAttrs: { lang: 'en' },
  titleTemplate: (title) =>
    title ? `${title} – ${SITE_NAME}` : `${SITE_NAME} – music is my radar`,
});

const status = usePageStatus();
</script>

<template>
  <SiteHeader />
  <main class="site-main">
    <NotFound v-if="status === 404" />
    <RouterView v-else />
  </main>
</template>

<style scoped>
.site-main {
  padding: 1rem;
}
</style>
