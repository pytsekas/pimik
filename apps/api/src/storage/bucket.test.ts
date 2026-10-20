import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { loadConfig } from '../config.ts';
import { PhotoStore } from './bucket.ts';

describe('PhotoStore', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('creates and uses a bucket when STORAGE_EMULATOR_HOST is also set in the process', async () => {
    vi.stubEnv('STORAGE_EMULATOR_HOST', 'http://localhost:4443');
    const config = loadConfig({
      GCLOUD_PROJECT: 'vinyl-rehab-local',
      BUCKET: `vinyl-rehab-bucket-test-${Date.now()}`,
      IMAGE_BASE_URL: 'http://localhost:4443/x',
      ADMIN_EMAILS: 'admin@example.com',
      STORAGE_EMULATOR_HOST: 'http://localhost:4443',
    });
    const store = new PhotoStore(config);
    expect(process.env.STORAGE_EMULATOR_HOST).toBe('http://localhost:4443');

    await store.ensureBucket();
    await store.write('a.txt', Buffer.from('hi'), 'text/plain');
    expect((await store.read('a.txt')).toString()).toBe('hi');
    await store.deleteObject('a.txt');
  });
});
