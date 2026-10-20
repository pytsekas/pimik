import { fileURLToPath } from 'node:url';
import express, { type Express } from 'express';

export function createWebServer(): Express {
  const app = express();
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  return app;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.WEB_PORT ?? 3000);
  createWebServer().listen(port, () => {
    console.log(`web listening on http://localhost:${port}`);
  });
}
