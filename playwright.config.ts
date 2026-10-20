import { defineConfig } from '@playwright/test';
import {
  ADMIN_EMAIL,
  API_PORT,
  AUTH_HOST,
  BUCKET,
  FIRESTORE_HOST,
  IMAGE_BASE_URL,
  PROJECT_ID,
  STORAGE_HOST,
  WEB_PORT,
  WEB_URL,
} from './e2e/settings.ts';

const apiUrl = `http://localhost:${API_PORT}`;

// Run through `pnpm e2e`, which wraps this in its own Firestore + Auth emulators.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/globalSetup.ts',
  globalTeardown: './e2e/globalTeardown.ts',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: WEB_URL,
    // The system Chrome avoids downloading a bundled browser.
    channel: 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node src/server.ts',
      cwd: 'apps/api',
      url: `${apiUrl}/health`,
      timeout: 60_000,
      env: {
        API_PORT: String(API_PORT),
        GCLOUD_PROJECT: PROJECT_ID,
        FIRESTORE_EMULATOR_HOST: FIRESTORE_HOST,
        FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST,
        STORAGE_EMULATOR_HOST: STORAGE_HOST,
        BUCKET,
        IMAGE_BASE_URL,
        ADMIN_EMAILS: ADMIN_EMAIL,
      },
    },
    {
      command: 'node server.ts',
      cwd: 'apps/web',
      url: WEB_URL,
      timeout: 120_000,
      env: {
        WEB_PORT: String(WEB_PORT),
        SITE_URL: WEB_URL,
        API_URL: apiUrl,
        IMAGE_BASE_URL,
        VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
        VITE_FIREBASE_API_KEY: 'e2e-fake-key',
        VITE_FIREBASE_AUTH_EMULATOR_URL: `http://${AUTH_HOST}`,
      },
    },
  ],
});
