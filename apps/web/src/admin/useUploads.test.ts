// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { AdminApiError, uploadFile } from './adminApi.ts';
import { FakeXhr, flush, jpeg, mockApi, photo } from './testHelpers.ts';
import { useUploads } from './useUploads.ts';

beforeEach(() => {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const xhr = (index: number) => {
  const instance = FakeXhr.instances[index];
  if (!instance) throw new Error(`no XHR #${index}`);
  return instance;
};

describe('useUploads', () => {
  it('rejects an unsupported file and uploads the rest', async () => {
    const api = mockApi(uploadFile);
    const uploads = useUploads(api);
    const heic = new File(['x'], 'b.heic', { type: 'image/heic' });

    uploads.addFiles([jpeg('a.jpg'), heic, jpeg('c.jpg')]);
    expect(uploads.busy.value).toBe(true);
    await flush();

    expect(api.requestUploads).toHaveBeenCalledTimes(1);
    expect(api.requestUploads).toHaveBeenCalledWith([
      { fileName: 'a.jpg', contentType: 'image/jpeg', size: 10 },
      { fileName: 'b.heic', contentType: 'image/heic', size: 1 },
      { fileName: 'c.jpg', contentType: 'image/jpeg', size: 10 },
    ]);
    const [first, second, third] = uploads.items.value;
    expect(second).toMatchObject({ state: 'error', error: 'unsupported file type' });
    expect(FakeXhr.instances).toHaveLength(2);
    expect(xhr(0)).toMatchObject({ method: 'PUT', url: 'http://gcs.test/0' });
    expect(xhr(0).headers).toEqual({ 'Content-Type': 'x' });

    xhr(0).progress(5, 10);
    expect(first?.progress).toBe(0.5);
    xhr(0).respond(200);
    await flush();
    expect(api.completeUpload).toHaveBeenCalledWith('photo0');
    expect(first?.state).toBe('done');
    expect(uploads.busy.value).toBe(true);

    xhr(1).respond(200);
    await flush();
    expect(third?.state).toBe('done');
    expect(uploads.busy.value).toBe(false);
    expect(uploads.photos.value.map((entry) => entry.id)).toEqual(['photo0', 'photo2']);
  });

  it('runs at most four uploads at a time', async () => {
    const uploads = useUploads(mockApi(uploadFile));
    uploads.addFiles(Array.from({ length: 6 }, (_, index) => jpeg(`${index}.jpg`)));
    await flush();
    expect(FakeXhr.instances).toHaveLength(4);

    xhr(0).respond(200);
    await flush();
    expect(FakeXhr.instances).toHaveLength(5);
  });

  it('is processing between the upload and the completed photo', async () => {
    const api = mockApi(uploadFile);
    let finish: (value: ReturnType<typeof photo>) => void = () => {};
    api.completeUpload.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const uploads = useUploads(api);
    uploads.addFiles([jpeg('a.jpg')]);
    await flush();
    xhr(0).respond(200);
    await flush();

    expect(uploads.items.value[0]?.state).toBe('processing');
    expect(uploads.busy.value).toBe(true);
    finish(photo('photo0'));
    await flush();
    expect(uploads.busy.value).toBe(false);
  });

  it('shows the api error for a file that is not an image', async () => {
    const api = mockApi(uploadFile);
    api.completeUpload.mockRejectedValue(new AdminApiError(422, 'not_an_image'));
    const uploads = useUploads(api);
    uploads.addFiles([jpeg('a.jpg')]);
    await flush();
    xhr(0).respond(200);
    await flush();

    expect(uploads.items.value[0]).toMatchObject({ state: 'error', error: 'not a valid image' });
    expect(uploads.busy.value).toBe(false);
    expect(uploads.photos.value).toEqual([]);
  });

  it('marks a failed transfer as upload failed', async () => {
    const uploads = useUploads(mockApi(uploadFile));
    uploads.addFiles([jpeg('a.jpg')]);
    await flush();
    xhr(0).respond(403);
    await flush();

    expect(uploads.items.value[0]).toMatchObject({ state: 'error', error: 'upload failed' });
  });

  it('marks every file as failed when the upload request fails', async () => {
    const api = mockApi(uploadFile);
    api.requestUploads.mockRejectedValue(new TypeError('network'));
    const uploads = useUploads(api);
    uploads.addFiles([jpeg('a.jpg'), jpeg('b.jpg')]);
    await flush();

    expect(uploads.items.value.map((item) => item.error)).toEqual([
      'upload failed',
      'upload failed',
    ]);
    expect(uploads.busy.value).toBe(false);
  });

  it('aborts the transfer of a removed item and starts the next one', async () => {
    const uploads = useUploads(mockApi(uploadFile));
    uploads.addFiles(Array.from({ length: 5 }, (_, index) => jpeg(`${index}.jpg`)));
    await flush();
    const firstId = uploads.items.value[0]?.id ?? '';

    uploads.remove(firstId);
    await flush();
    expect(xhr(0).aborted).toBe(true);
    expect(uploads.items.value).toHaveLength(4);
    expect(FakeXhr.instances).toHaveLength(5);
  });

  it('reorders photos with move', async () => {
    const uploads = useUploads(mockApi(uploadFile));
    uploads.addFiles([jpeg('a.jpg'), jpeg('b.jpg'), jpeg('c.jpg')]);
    await flush();
    FakeXhr.instances.forEach((instance) => instance.respond(200));
    await flush();

    uploads.move(2, 0);
    expect(uploads.photos.value.map((entry) => entry.id)).toEqual(['photo2', 'photo0', 'photo1']);
  });

  it('starts from existing photos as done items', () => {
    const uploads = useUploads(mockApi(uploadFile));
    uploads.reset([photo('a'), photo('b')], (entry) => `http://img.test/${entry.paths.w300}`);

    expect(uploads.items.value.map((item) => [item.state, item.previewUrl])).toEqual([
      ['done', 'http://img.test/photos/a/w300.jpg'],
      ['done', 'http://img.test/photos/b/w300.jpg'],
    ]);
    expect(uploads.photos.value.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(uploads.busy.value).toBe(false);
  });
});
