import { describe, expect, it } from 'vite-plus/test';
import { loadConfig } from './config.ts';

const BASE = {
  GCLOUD_PROJECT: 'vinyl-rehab-local',
  BUCKET: 'vinyl-rehab-photos',
  IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-photos',
  ADMIN_EMAILS: 'admin@example.com',
};

describe('loadConfig', () => {
  it('trims a trailing slash from IMAGE_BASE_URL', () => {
    const config = loadConfig({ ...BASE, IMAGE_BASE_URL: 'https://img.example/bucket//' });
    expect(config.imageBaseUrl).toBe('https://img.example/bucket');
  });

  it.each(['FIREBASE_AUTH_EMULATOR_HOST', 'FIRESTORE_EMULATOR_HOST', 'STORAGE_EMULATOR_HOST'])(
    'refuses to load in production when %s is set',
    (name) => {
      expect(() => loadConfig({ ...BASE, NODE_ENV: 'production', [name]: 'localhost:1' })).toThrow(
        name,
      );
    },
  );

  it('loads in production without emulator hosts', () => {
    expect(loadConfig({ ...BASE, NODE_ENV: 'production' }).projectId).toBe('vinyl-rehab-local');
  });

  it('allows emulator hosts outside production', () => {
    const config = loadConfig({
      ...BASE,
      FIRESTORE_EMULATOR_HOST: 'localhost:8080',
      STORAGE_EMULATOR_HOST: 'http://localhost:4443',
    });
    expect(config.storageEmulatorHost).toBe('http://localhost:4443');
  });
});
