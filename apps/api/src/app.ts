import express, { type Express } from 'express';
import type { Config } from './config.ts';

export type AppDeps = {
  config: Config;
};

export function createApp(_deps: AppDeps): Express {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}
