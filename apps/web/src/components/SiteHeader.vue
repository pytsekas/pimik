<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <header class="site-header">
    <h1 class="site-title"><RouterLink to="/">Vinyl Rehab</RouterLink></h1>
    <p class="site-tagline">music is my radar</p>
  </header>
</template>

<style scoped>
.site-header {
  max-width: var(--max-photo);
  margin: 0 auto;
  padding: 24px 16px 0;
}

.site-title {
  margin: 0;
  font-size: 44px;
}

.site-title a {
  color: var(--text-strong);
  text-decoration: none;
}

.site-title a:hover {
  color: var(--accent);
}

.site-tagline {
  margin: 0;
  color: var(--text-muted);
  font-style: italic;
}
</style>
