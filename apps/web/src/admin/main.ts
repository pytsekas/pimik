import { createApp } from 'vue';
import AdminApp from './AdminApp.vue';

/** Client-only admin; the server sends it an empty shell, never SSR content. */
export function startAdmin(): void {
  document.title = 'Admin – Vinyl Rehab';
  createApp(AdminApp).mount('#app');
}
