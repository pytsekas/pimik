import request from 'supertest';
import { describe, expect, it } from 'vite-plus/test';
import { createWebServer } from './server.ts';

describe('web GET /health', () => {
  it('returns ok', async () => {
    const res = await request(createWebServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
