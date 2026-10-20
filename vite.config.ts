import { defineConfig } from 'vite-plus';

export default defineConfig({
  lint: { options: { typeAware: true, typeCheck: true } },
  fmt: {
    singleQuote: true,
    ignorePatterns: ['docs/**', '.superpowers/**', '.omc/**', 'pnpm-lock.yaml'],
  },
});
