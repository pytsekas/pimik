import { describe, expect, it, vi } from 'vite-plus/test';
import { AdminApiError, createAdminApi } from './adminApi.ts';

function setup(response: () => Response) {
  const fetchImpl = vi.fn<typeof fetch>(async () => response());
  const onForbidden = vi.fn();
  const api = createAdminApi({ getIdToken: async () => 'id-1', onForbidden, fetchImpl });
  const lastCall = () => {
    const [url, init] = fetchImpl.mock.calls.at(-1) ?? [];
    return { url, init, headers: (init?.headers ?? {}) as Record<string, string> };
  };
  return { api, onForbidden, lastCall };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('createAdminApi', () => {
  it('sends a fresh bearer header to the same-origin admin path', async () => {
    const { api, lastCall } = setup(() => json(200, []));
    await api.listPosts();
    expect(lastCall().url).toBe('/v1/admin/posts');
    expect(lastCall().init?.method).toBe('GET');
    expect(lastCall().headers).toEqual({ Authorization: 'Bearer id-1' });
  });

  it('sends JSON bodies and encodes ids', async () => {
    const { api, lastCall } = setup(() => json(200, { id: 'a/b' }));
    await api.updatePost('a/b', { title: 'x' } as never);
    expect(lastCall().url).toBe('/v1/admin/posts/a%2Fb');
    expect(lastCall().init?.method).toBe('PUT');
    expect(lastCall().headers['Content-Type']).toBe('application/json');
    expect(lastCall().init?.body).toBe('{"title":"x"}');
  });

  it('unwraps the upload slots', async () => {
    const slot = { fileName: 'a.heic', error: 'unsupported_type' };
    const { api, lastCall } = setup(() => json(200, { files: [slot] }));
    const files = [{ fileName: 'a.heic', contentType: 'image/heic', size: 1 }];
    expect(await api.requestUploads(files)).toEqual([slot]);
    expect(JSON.parse(lastCall().init?.body as string)).toEqual({ files });
  });

  it('returns undefined for 204', async () => {
    const { api, lastCall } = setup(() => new Response(null, { status: 204 }));
    await expect(api.deletePost('p1')).resolves.toBeUndefined();
    expect(lastCall().init?.method).toBe('DELETE');
  });

  it('calls onForbidden and throws on 403', async () => {
    const { api, onForbidden } = setup(() => json(403, { error: 'forbidden' }));
    const error = await api.listTags().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AdminApiError);
    expect(error).toMatchObject({ status: 403, code: 'forbidden' });
    expect(onForbidden).toHaveBeenCalledTimes(1);
  });

  it('carries the error code and issues', async () => {
    const issues = [{ path: ['slug'], message: 'bad' }];
    const { api, onForbidden } = setup(() => json(400, { error: 'invalid_input', issues }));
    await expect(api.createPost({} as never)).rejects.toMatchObject({
      status: 400,
      code: 'invalid_input',
      issues,
    });
    expect(onForbidden).not.toHaveBeenCalled();
  });

  it('copes with a non-JSON error body', async () => {
    const { api } = setup(() => new Response('<h1>Bad Gateway</h1>', { status: 502 }));
    await expect(api.getPost('p1')).rejects.toMatchObject({ status: 502, code: 'unknown' });
  });
});
