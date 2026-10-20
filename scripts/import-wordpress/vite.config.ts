import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    // Tests share one Firestore emulator project and one bucket, so files must not run concurrently.
    fileParallelism: false,
  },
});
