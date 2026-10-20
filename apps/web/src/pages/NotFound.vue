<script setup lang="ts">
import { useHead } from '@unhead/vue';
import { RouterLink } from 'vue-router';

useHead({ title: 'Page not found' });
</script>

<template>
  <section class="not-found">
    <h2>Page not found</h2>
    <p><RouterLink to="/">Back to the front page</RouterLink></p>
  </section>
</template>
