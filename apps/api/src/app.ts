import express, { type Express } from 'express';
import type { Config } from './config.ts';
import { errorHandler, notFoundHandler } from './errors.ts';
import type { PhotoIndexRepo } from './repo/photoIndex.ts';
import type { PostRepo } from './repo/posts.ts';
import type { TermRepo } from './repo/terms.ts';
import { publicRouter } from './routes/public.ts';

export type AppDeps = {
  config: Config;
  posts: PostRepo;
  categories: TermRepo;
  tags: TermRepo;
  photoIndex: PhotoIndexRepo;
};

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/v1', publicRouter(deps));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
