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
  padding: 2rem 1rem 1rem;
  background: var(--dark);
  text-align: center;
}

.site-title {
  margin: 0;
  font-size: 2.5rem;
}

.site-title a {
  color: var(--text);
  text-decoration: none;
}

.site-title a:hover {
  color: var(--accent);
}

.site-tagline {
  margin: 0.25rem 0 0;
  color: var(--text-muted);
}
</style>
