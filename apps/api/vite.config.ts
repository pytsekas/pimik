import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    // All files share one Firestore emulator, so they must not run concurrently.
    fileParallelism: false,
  },
});
