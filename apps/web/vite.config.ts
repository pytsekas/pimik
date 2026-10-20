import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite-plus';

export default defineConfig({
  plugins: [vue()],
  // Server tests run on node; component tests opt into happy-dom with a
  // `@vitest-environment` docblock.
  test: { environment: 'node' },
});
