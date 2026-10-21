import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { uneval } from 'devalue';
import express, {
  type ErrorRequestHandler,
  type Express,
  type Request,
  type RequestHandler,
} from 'express';
import { loadConfig } from './config.ts';
import { createIdTokenSource, withIdToken } from './idToken.ts';
import { createApiClient, type ApiClient } from './src/api.ts';
import type { RenderResult, render as renderPage } from './src/entry-server.ts';
import { renderFeed } from './src/feed.ts';
import { createCategoryCache, resolveLegacy, type CategoryCache } from './src/legacy.ts';
import { renderSitemap } from './src/sitemap.ts';

export type WebServerOptions = {
  apiUrl: string;
  imageBaseUrl: string;
  /** Public origin, used for canonical links. */
  siteUrl?: string;
  /** Vite middleware + on-the-fly SSR modules instead of the built `dist/`. */
  dev: boolean;
  /** Dev only; defaults to on. Tests turn it off so no websocket port is opened. */
  hmr?: boolean;
  /** Replaces the client built from `apiUrl` for server-side rendering (tests). */
  apiClient?: ApiClient;
  /** Legacy-URL category lookup; defaults to a 60 s cache over `apiClient` (tests inject one). */
  categoryCache?: CategoryCache;
  /** Fetch used for every call to the api, e.g. one that adds an ID token; defaults to `fetch`. */
  apiFetch?: typeof fetch;
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
/** Completing an upload decodes and re-encodes a photo of up to 30 MB, which can take a while. */
const COMPLETE_UPLOAD_TIMEOUT_MS = 60_000;
const MAX_PROXY_BODY_BYTES = 5 * 1024 * 1024;
const MAX_ADMIN_REQUEST_BYTES = 1024 * 1024;
const ADMIN_API_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);

async function devRenderer(app: Express, hmr: boolean): Promise<Renderer> {
  const { createServer } = await import('vite-plus');
  const vite = await createServer({
    root: ROOT,
    appType: 'custom',
    configLoader: 'native',
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

/** The api's public read endpoints; matched case-sensitively against the resolved path. */
const PUBLIC_API_PATHS = [
  /^\/v1\/posts$/,
  /^\/v1\/posts\/by-slug\/[^/]+$/,
  /^\/v1\/posts\/by-wp-id\/\d+$/,
  /^\/v1\/categories$/,
  /^\/v1\/tags$/,
  /^\/v1\/legacy-images\/[^/]+(\/[^/]+)*$/,
];

function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PATHS.some((pattern) => pattern.test(pathname));
}

export function upstreamTimeoutMs(pathname: string): number {
  return /^\/v1\/admin\/uploads\/[^/]+\/complete$/.test(pathname)
    ? COMPLETE_UPLOAD_TIMEOUT_MS
    : UPSTREAM_TIMEOUT_MS;
}

async function readCapped(response: Response, maxBytes: number): Promise<Buffer | null> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    size += next.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks);
}

/**
 * Admin calls pass with their bearer header and body. The path must already be in normal form
 * (no `..` or `%2e` segments to resolve), so only what the browser asked for literally is reached.
 */
function isAdminApiRequest(req: Request, target: URL): boolean {
  const rawPath = req.originalUrl.split('?', 1)[0];
  return (
    ADMIN_API_METHODS.has(req.method) &&
    target.pathname.startsWith('/v1/admin/') &&
    target.pathname === rawPath
  );
}

/**
 * Reads the request body, or resolves null as soon as it exceeds `maxBytes`. The rest is then
 * drained and discarded (not destroyed), so the client finishes sending and receives the 413.
 */
function readRequestCapped(req: Request, maxBytes: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const overCap = () => {
      req.off('data', onData);
      req.resume();
      resolve(null);
    };
    if (Number(req.headers['content-length'] ?? 0) > maxBytes) {
      overCap();
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    function onData(chunk: Buffer): void {
      size += chunk.byteLength;
      if (size > maxBytes) overCap();
      else chunks.push(chunk);
    }
    req.on('data', onData);
    req.once('end', () => resolve(Buffer.concat(chunks)));
    req.once('error', reject);
  });
}

/** Forwards public api reads and admin calls so the browser can use same-origin `/v1`. */
function apiProxy(apiUrl: string, apiFetch: typeof fetch): RequestHandler {
  const apiOrigin = new URL(apiUrl).origin;
  return async (req, res) => {
    const target = new URL(req.originalUrl, apiUrl);
    const publicRead =
      (req.method === 'GET' || req.method === 'HEAD') && isPublicApiPath(target.pathname);
    const admin = isAdminApiRequest(req, target);
    if (target.origin !== apiOrigin || !(publicRead || admin)) {
      res.status(404).json({ error: 'not_found', message: 'Not found' });
      return;
    }
    const headers: Record<string, string> = { accept: 'application/json' };
    let requestBody: Buffer | undefined;
    if (admin) {
      for (const name of ['authorization', 'content-type'] as const) {
        const value = req.headers[name];
        if (value) headers[name] = value;
      }
      if (req.method === 'POST' || req.method === 'PUT') {
        const read = await readRequestCapped(req, MAX_ADMIN_REQUEST_BYTES);
        if (read === null) {
          res.status(413).json({ error: 'too_large', message: 'Request body too large' });
          return;
        }
        requestBody = read;
      }
    }
    try {
      const upstream = await apiFetch(target, {
        method: req.method,
        headers,
        body: requestBody && Uint8Array.from(requestBody),
        signal: AbortSignal.timeout(upstreamTimeoutMs(target.pathname)),
      });
      const body = await readCapped(upstream, MAX_PROXY_BODY_BYTES);
      if (body === null) {
        res.status(502).json({ error: 'bad_gateway', message: 'API response too large' });
        return;
      }
      res.status(upstream.status);
      const contentType = upstream.headers.get('content-type');
      if (contentType) res.type(contentType);
      res.send(body);
    } catch {
      res.status(502).json({ error: 'bad_gateway', message: 'API unavailable' });
    }
  };
}

/**
 * `/category/vinyl` → 301 `/category/vinyl/`; file-like paths (`/feed.xml`) are left alone.
 * Browsers read `\` as `/`, so paths containing one are never redirected (they render 404),
 * and leading slashes are collapsed so the target can't become `//evil.example`.
 */
const trailingSlashRedirect: RequestHandler = (req, res, next) => {
  if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.endsWith('/')) {
    next();
    return;
  }
  const lastSegment = req.path.slice(req.path.lastIndexOf('/') + 1);
  if (lastSegment.includes('.') || req.path.includes('\\')) {
    next();
    return;
  }
  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
  const location = `/${req.path.replace(/^[/\\]+/, '')}/${query}`;
  if (new URL(location, 'http://x').host !== 'x') {
    next();
    return;
  }
  res.redirect(301, location);
};

function fillTemplate(
  template: string,
  page?: RenderResult,
  state = page ? `<script>window.__STATE__=${page.state}</script>` : '',
): string {
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
  const apiFetch = options.apiFetch ?? fetch;
  const api = options.apiClient ?? createApiClient(options.apiUrl, apiFetch);
  const siteUrl = (options.siteUrl ?? '').replace(/\/+$/, '');
  const siteConfig = { imageBaseUrl: options.imageBaseUrl, siteUrl };
  const categoryCache = options.categoryCache ?? createCategoryCache(api);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/v1', apiProxy(options.apiUrl, apiFetch));

  const renderer = options.dev
    ? await devRenderer(app, options.hmr ?? true)
    : await prodRenderer(app);

  app.get(['/feed', '/feed/'], async (_req, res) => {
    const xml = await renderFeed(api, siteConfig);
    res.set('Cache-Control', 'public, max-age=600');
    res.set('Content-Type', 'application/rss+xml; charset=utf-8').send(xml);
  });
  app.get('/sitemap.xml', async (_req, res) => {
    const xml = await renderSitemap(api, siteUrl);
    res.set('Cache-Control', 'public, max-age=3600');
    res.set('Content-Type', 'application/xml; charset=utf-8').send(xml);
  });

  // Before the trailing-slash redirect and SSR: old WordPress URLs keep working.
  app.use(async (req, res, next) => {
    const plain = req.originalUrl.startsWith('/') && !req.originalUrl.includes('\\');
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !plain) {
      next();
      return;
    }
    // Concatenated, not resolved: `//evil.example/x` must stay a path, not become a host.
    const url = new URL(`http://x${req.originalUrl}`);
    const legacy = await resolveLegacy(url, api, await categoryCache.get(), {
      imageBaseUrl: options.imageBaseUrl,
    });
    if (!legacy) {
      next();
    } else if (legacy.status === 301) {
      res.redirect(301, legacy.location);
    } else {
      res.status(404).type('text').send('Not found');
    }
  });

  app.use(trailingSlashRedirect);

  // The client-only admin gets an empty shell plus the config it can't get from Vite.
  const adminState = `<script>window.__ADMIN_CONFIG__=${uneval({ imageBaseUrl: options.imageBaseUrl })}</script>`;
  app.get(['/admin/', '/admin/{*rest}'], async (req, res) => {
    const template = await renderer.template(req.originalUrl);
    res.type('html').send(fillTemplate(template, undefined, adminState));
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
    siteUrl: config.siteUrl,
    dev: process.env.NODE_ENV !== 'production',
    apiFetch: config.apiAudience
      ? withIdToken(fetch, createIdTokenSource(config.apiAudience))
      : fetch,
  });
  app.listen(config.port, () => {
    console.log(`web listening on http://localhost:${config.port}`);
  });
}
