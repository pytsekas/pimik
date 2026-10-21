/**
 * Google-signed ID tokens from the Cloud Run metadata server, so the web server may call an api
 * that only accepts its service account. The token goes in `X-Serverless-Authorization`, which
 * Cloud Run checks instead of `Authorization`; that header keeps carrying the admin's Firebase
 * token through to the api.
 */
const METADATA_IDENTITY_URL =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5_000;

export type TokenSource = () => Promise<string>;

function expiryOf(token: string): number {
  const payload = token.split('.')[1] ?? '';
  const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { exp?: number };
  if (typeof exp !== 'number') throw new Error('ID token has no exp claim');
  return exp * 1000;
}

/** Fetches a token for `audience` and reuses it until five minutes before it expires. */
export function createIdTokenSource(
  audience: string,
  fetchImpl: typeof fetch = fetch,
  now: () => number = Date.now,
): TokenSource {
  let cached: { token: string; expiresAt: number } | undefined;
  let pending: Promise<string> | undefined;

  async function fetchToken(): Promise<string> {
    const url = `${METADATA_IDENTITY_URL}?audience=${encodeURIComponent(audience)}`;
    const res = await fetchImpl(url, {
      headers: { 'Metadata-Flavor': 'Google' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Metadata server answered ${res.status} for an ID token`);
    const token = (await res.text()).trim();
    cached = { token, expiresAt: expiryOf(token) };
    return token;
  }

  return async () => {
    if (cached && now() < cached.expiresAt - REFRESH_MARGIN_MS) return cached.token;
    pending ??= fetchToken().finally(() => {
      pending = undefined;
    });
    return pending;
  };
}

/** A fetch that adds the service account's ID token to every request. */
export function withIdToken(fetchImpl: typeof fetch, tokenSource: TokenSource): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('X-Serverless-Authorization', `Bearer ${await tokenSource()}`);
    return fetchImpl(input, { ...init, headers });
  };
}
