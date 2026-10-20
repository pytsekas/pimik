export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30_000;
const ATTEMPTS = 3;

/** An error that another attempt cannot fix. */
export class PermanentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentError';
  }
}

export type Retry = { backoffMs: number };

/**
 * The URL (resolved against baseUrl) when it points at the same site as baseUrl, else null.
 * http and https count as the same site and the result uses baseUrl's protocol; other
 * hosts and ports do not match.
 */
export function sameSiteUrl(url: string, baseUrl: string): URL | null {
  let target: URL;
  let base: URL;
  try {
    base = new URL(baseUrl);
    target = new URL(url, base);
  } catch {
    return null;
  }
  const web = (u: URL) => u.protocol === 'http:' || u.protocol === 'https:';
  if (!web(target) || !web(base) || target.host !== base.host) return null;
  target.protocol = base.protocol;
  return target;
}

export async function withRetry<T>(retry: Retry, fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof PermanentError) throw err;
      lastError = err;
      if (attempt < ATTEMPTS) await sleep(retry.backoffMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

/** GET with a timeout, retries and a same-site check on every redirect hop. */
export function getJson(
  fetchImpl: typeof fetch,
  url: string,
  retry: Retry,
): Promise<{ body: unknown; totalPages: number }> {
  return withRetry(retry, async () => {
    const res = await fetchImpl(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return { body: await res.json(), totalPages: Number(res.headers.get('x-wp-totalpages')) };
  });
}

/**
 * Downloads an image from the site at baseUrl. Other hosts (also via redirects), non-image
 * content types and bodies above MAX_IMAGE_BYTES are rejected.
 */
export function downloadImage(
  fetchImpl: typeof fetch,
  url: string,
  baseUrl: string,
  retry: Retry,
): Promise<Buffer> {
  return withRetry(retry, async () => {
    let current = sameSiteUrl(url, baseUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      if (!current) throw new PermanentError(`refusing to fetch from another host: ${url}`);
      const res = await fetchImpl(current.href, {
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        current = sameSiteUrl(location, current.href);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return readBounded(res);
    }
    throw new PermanentError(`too many redirects: ${url}`);
  });
}

async function readBounded(res: Response): Promise<Buffer> {
  const type = res.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('image/')) {
    await res.body?.cancel();
    throw new PermanentError(`not an image: content-type "${type}"`);
  }
  const declared = Number(res.headers.get('content-length'));
  if (declared > MAX_IMAGE_BYTES) {
    await res.body?.cancel();
    throw new PermanentError(`image too large: ${declared} bytes`);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of res.body ?? []) {
    total += chunk.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      throw new PermanentError(`image too large: more than ${MAX_IMAGE_BYTES} bytes`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
