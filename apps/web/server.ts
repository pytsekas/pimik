import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { type ErrorRequestHandler, type Express, type RequestHandler } from 'express';
import { loadConfig } from './config.ts';
import { createApiClient, type ApiClient } from './src/api.ts';
import type { RenderResult, render as renderPage } from './src/entry-server.ts';

export type WebServerOptions = {
  apiUrl: string;
  imageBaseUrl: string;
  /** Vite middleware + on-the-fly SSR modules instead of the built `dist/`. */
  dev: boolean;
  /** Dev only; defaults to on. Tests turn it off so no websocket port is opened. */
  hmr?: boolean;
  /** Replaces the client built from `apiUrl` for server-side rendering (tests). */
  apiClient?: ApiClient;
};

export type WebServer = { app: Express; close(): Promise<void> };

type Renderer = {
  template(url: string): Promise<string>;
  render: typeof renderPage;
  fixError(error: unknown): void;
  close: () => Promise<void>;
};

const ROOT = dirname(fileURLToPath(import.meta.url));
const UPSTREAM_TIMEOUT_MS = 10_000;

async function devRenderer(app: Express, hmr: boolean): Promise<Renderer> {
  const { createServer } = await import('vite-plus');
  const vite = await createServer({
    root: ROOT,
    appType: 'custom',
    server: { middlewareMode: true, hmr, ws: hmr ? undefined : false },
  });
  app.use(vite.middlewares);
  return {
    async template(url) {
      return vite.transformIndexHtml(url, await readFile(join(ROOT, 'index.html'), 'utf8'));
    },
    async render(...args) {
      const entry = (await vite.ssrLoadModule('/src/entry-server.ts')) as {
        render: typeof renderPage;
      };
      return entry.render(...args);
    },
    fixError(error) {
      if (error instanceof Error) vite.ssrFixStacktrace(error);
    },
    close: () => vite.close(),
  };
}

async function prodRenderer(app: Express): Promise<Renderer> {
  const clientDir = join(ROOT, 'dist/client');
  // Only hashed build output is public; `index.html` is the SSR template, never served as-is.
  app.use('/assets', express.static(join(clientDir, 'assets'), { immutable: true, maxAge: '1y' }));
  const template = await readFile(join(clientDir, 'index.html'), 'utf8');
  const entryUrl = pathToFileURL(join(ROOT, 'dist/server/entry-server.js')).href;
  const entry = (await import(entryUrl)) as { render: typeof renderPage };
  return {
    template: async () => template,
    render: entry.render,
    fixError: () => {},
    close: async () => {},
  };
}

/** Forwards public api reads so the browser can use same-origin `/v1`. */
function publicApiProxy(apiUrl: string): RequestHandler {
  const apiOrigin = new URL(apiUrl).origin;
  return async (req, res) => {
    const target = new URL(req.originalUrl, apiUrl);
    // The admin UI's `/v1/admin` proxy (with auth header forwarding) belongs here.
    const isPublic =
      target.origin === apiOrigin &&
      target.pathname.startsWith('/v1/') &&
      !/^\/v1\/admin(\/|$)/.test(target.pathname);
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !isPublic) {
      res.status(404).json({ error: 'not_found', message: 'Not found' });
      return;
    }
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        method: req.method,
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch {
      res.status(502).json({ error: 'bad_gateway', message: 'API unavailable' });
      return;
    }
    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.type(contentType);
    res.send(Buffer.from(await upstream.arrayBuffer()));
  };
}

/** `/category/vinyl` → 301 `/category/vinyl/`; file-like paths (`/feed.xml`) are left alone. */
const trailingSlashRedirect: RequestHandler = (req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.endsWith('/')) {
    next();
    return;
  }
  const lastSegment = req.path.slice(req.path.lastIndexOf('/') + 1);
  if (lastSegment.includes('.')) {
    next();
    return;
  }
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
  // Collapsing leading slashes keeps `//evil.example` from becoming an open redirect.
  res.redirect(301, `${req.path.replace(/^\/+/, '/')}/${query}`);
};

function fillTemplate(template: string, page?: RenderResult): string {
  const state = page ? `<script>window.__STATE__=${page.state}</script>` : '';
  return template
    .replace('<html lang="en">', () =>
      page?.htmlAttrs ? `<html${page.htmlAttrs}>` : '<html lang="en">',
    )
    .replace('<!--app-head-->', () => page?.head ?? '')
    .replace('<!--app-html-->', () => page?.html ?? '')
    .replace('<!--app-state-->', () => state);
}

export async function createWebServer(options: WebServerOptions): Promise<WebServer> {
  const app = express();
  app.disable('x-powered-by');
  const api = options.apiClient ?? createApiClient(options.apiUrl);
  const siteConfig = { imageBaseUrl: options.imageBaseUrl };

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/v1', publicApiProxy(options.apiUrl));

  const renderer = options.dev
    ? await devRenderer(app, options.hmr ?? true)
    : await prodRenderer(app);

  app.use(trailingSlashRedirect);

  app.get(['/admin/', '/admin/{*rest}'], async (req, res) => {
    res.type('html').send(fillTemplate(await renderer.template(req.originalUrl)));
  });

  app.get('/{*path}', async (req, res) => {
    const url = req.originalUrl;
    const page = await renderer.render(url, api, siteConfig);
    if (page.redirect) {
      res.redirect(page.redirect.status, page.redirect.location);
      return;
    }
    const template = await renderer.template(url);
    res.status(page.status).type('html').send(fillTemplate(template, page));
  });

  const onError: ErrorRequestHandler = (error, _req, res, _next) => {
    renderer.fixError(error);
    console.error(error);
    res.status(500).type('text').send('Internal Server Error');
  };
  app.use(onError);

  return { app, close: renderer.close };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const { app } = await createWebServer({
    apiUrl: config.apiUrl,
    imageBaseUrl: config.imageBaseUrl,
    dev: process.env.NODE_ENV !== 'production',
  });
  app.listen(config.port, () => {
    console.log(`web listening on http://localhost:${config.port}`);
  });
}
