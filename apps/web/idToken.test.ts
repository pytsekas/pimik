import { describe, expect, it } from 'vite-plus/test';
import { createIdTokenSource, withIdToken } from './idToken.ts';

const AUDIENCE = 'https://api.example.run.app';

function tokenExpiringAt(expMs: number, tag = 'a'): string {
  const payload = Buffer.from(JSON.stringify({ exp: expMs / 1000, tag })).toString('base64url');
  return `header.${payload}.signature`;
}

function metadataServer(tokens: string[]) {
  const calls: { url: string; headers: Headers }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : input.toString();
    calls.push({ url, headers: new Headers(init?.headers) });
    return new Response(tokens[calls.length - 1] ?? 'missing');
  };
  return { calls, fetchImpl };
}

describe('createIdTokenSource', () => {
  it('asks the metadata server for a token for the audience', async () => {
    const token = tokenExpiringAt(3_600_000);
    const server = metadataServer([token]);
    const source = createIdTokenSource(AUDIENCE, server.fetchImpl, () => 0);

    expect(await source()).toBe(token);

    const [call] = server.calls;
    expect(call?.url).toBe(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=https%3A%2F%2Fapi.example.run.app',
    );
    expect(call?.headers.get('Metadata-Flavor')).toBe('Google');
  });

  it('reuses the token until five minutes before it expires, then fetches a new one', async () => {
    const first = tokenExpiringAt(3_600_000, 'first');
    const second = tokenExpiringAt(7_200_000, 'second');
    const server = metadataServer([first, second]);
    let clock = 0;
    const source = createIdTokenSource(AUDIENCE, server.fetchImpl, () => clock);

    expect(await source()).toBe(first);
    clock = 3_600_000 - 5 * 60 * 1000 - 1;
    expect(await source()).toBe(first);
    clock += 1;
    expect(await source()).toBe(second);
    expect(server.calls).toHaveLength(2);
  });

  it('shares one metadata request between concurrent callers', async () => {
    const server = metadataServer([tokenExpiringAt(3_600_000)]);
    const source = createIdTokenSource(AUDIENCE, server.fetchImpl, () => 0);

    await Promise.all([source(), source(), source()]);

    expect(server.calls).toHaveLength(1);
  });

  it('fails when the metadata server refuses', async () => {
    const refusing: typeof fetch = async () => new Response('no', { status: 404 });
    const source = createIdTokenSource(AUDIENCE, refusing);
    await expect(source()).rejects.toThrow('404');
  });
});

describe('withIdToken', () => {
  it('adds X-Serverless-Authorization and keeps the other headers', async () => {
    let seen = new Headers();
    const inner: typeof fetch = async (_input, init) => {
      seen = new Headers(init?.headers);
      return new Response('ok');
    };
    const wrapped = withIdToken(inner, async () => 'id-token');

    await wrapped('http://api.test/v1/posts', { headers: { authorization: 'Bearer firebase' } });

    expect(seen.get('X-Serverless-Authorization')).toBe('Bearer id-token');
    expect(seen.get('authorization')).toBe('Bearer firebase');
  });
});
