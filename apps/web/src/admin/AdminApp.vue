<script setup lang="ts">
import { ref } from 'vue';
import { authReady, forbidden, signIn, signOut, user } from './auth.ts';
import { useAdmin } from './context.ts';

defineProps<{ configError?: string }>();

const { unsaved } = useAdmin();

const signInError = ref('');

async function onSignOut(): Promise<void> {
  if (unsaved.value && !confirm('You have unsaved changes. Sign out anyway?')) return;
  await signOut();
}

async function onSignIn(): Promise<void> {
  signInError.value = '';
  try {
    await signIn();
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      signInError.value = 'Sign-in failed, try again.';
    }
  }
}
</script>

<template>
  <main class="admin">
    <header class="top">
      <b>Vinyl Rehab admin</b>
      <span v-if="user && !forbidden" class="who">
        signed in as {{ user.email }} · <RouterLink to="/admin/">all posts</RouterLink> ·
        <RouterLink to="/admin/stats/">statistics</RouterLink> ·
        <button type="button" class="link" @click="onSignOut">sign out</button>
      </span>
    </header>

    <p v-if="configError" class="error" role="alert">{{ configError }}</p>
    <p v-else-if="!authReady" class="muted">Loading…</p>
    <div v-else-if="!user" class="gate">
      <button type="button" class="b1" @click="onSignIn">Sign in with Google</button>
      <p v-if="signInError" class="error" role="alert">{{ signInError }}</p>
    </div>
    <div v-else-if="forbidden" class="gate">
      <p class="error" role="alert">This Google account is not allowed.</p>
      <button type="button" class="b2" @click="onSignOut">Sign out</button>
    </div>
    <RouterView v-else :key="$route.fullPath" />
  </main>
</template>

<style>
/* The admin is a plain light page; it overrides the public theme from theme.css. */
html.admin-page body {
  background: #fafafa;
  color: #222;
  font-family: system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.4;
}
.admin {
  max-width: 960px;
  margin: 0 auto;
  padding: 20px;
}
.admin h1 {
  font-family: inherit;
  font-weight: bold;
}
.admin .top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.admin .top b {
  font-size: 16px;
}
.admin .who {
  color: #888;
  font-size: 12px;
}
.admin .who a,
.admin .link {
  color: #555;
}
.admin .link {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  text-decoration: underline;
  cursor: pointer;
}
.admin .b1,
.admin .b2 {
  display: inline-block;
  padding: 8px 16px;
  border-radius: 4px;
  font: inherit;
  text-decoration: none;
  cursor: pointer;
}
.admin .b1 {
  border: 1px solid #2c3033;
  background: #2c3033;
  color: #fff;
}
.admin .b2 {
  border: 1px solid #999;
  background: #fff;
  color: #222;
}
.admin .b1:disabled,
.admin .b2:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.admin .gate {
  padding: 40px 0;
  text-align: center;
}
.admin .error {
  color: #b22;
}
.admin .muted {
  color: #888;
}
</style>
