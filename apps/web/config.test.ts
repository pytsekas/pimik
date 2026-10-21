import { describe, expect, it } from 'vite-plus/test';
import { loadConfig } from './config.ts';

const BASE = {
  API_URL: 'http://localhost:3001',
  IMAGE_BASE_URL: 'http://localhost:4443/vinyl-rehab-photos/',
};

describe('loadConfig', () => {
  it('defaults SITE_URL to localhost outside production and trims slashes', () => {
    const config = loadConfig(BASE);
    expect(config.siteUrl).toBe('http://localhost:3000');
    expect(config.imageBaseUrl).toBe('http://localhost:4443/vinyl-rehab-photos');
  });

  it('reads API_AUDIENCE only when set', () => {
    expect(loadConfig(BASE).apiAudience).toBeUndefined();
    const audience = 'https://api-abc-lz.a.run.app';
    expect(loadConfig({ ...BASE, API_AUDIENCE: audience }).apiAudience).toBe(audience);
  });

  it('requires SITE_URL in production', () => {
    expect(() => loadConfig({ ...BASE, NODE_ENV: 'production' })).toThrow('SITE_URL');
  });

  it('uses SITE_URL in production', () => {
    const config = loadConfig({
      ...BASE,
      NODE_ENV: 'production',
      SITE_URL: 'https://vinyl.rehab/',
    });
    expect(config.siteUrl).toBe('https://vinyl.rehab');
  });
});
