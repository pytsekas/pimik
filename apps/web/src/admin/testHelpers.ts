import type { Photo, Post } from '@vinyl/shared';
import { vi } from 'vite-plus/test';
import type { AdminApi, UploadSlot } from './adminApi.ts';

/** Stands in for the browser's XMLHttpRequest; tests drive progress and completion by hand. */
export class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: unknown;
  status = 0;
  aborted = false;
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }

  send(body: unknown): void {
    this.body = body;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  progress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }

  respond(status: number): void {
    this.status = status;
    this.onload?.();
  }
}

export function photo(id: string): Photo {
  return {
    id,
    width: 2000,
    height: 1500,
    paths: {
      original: `photos/${id}/original.jpg`,
      w1000: `photos/${id}/w1000.jpg`,
      w300: `photos/${id}/w300.jpg`,
    },
  };
}

export function post(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    slug: 'some-post',
    title: 'Some Post',
    categorySlug: 'vinyl',
    tagSlugs: [],
    publishedAt: '2026-01-09',
    status: 'draft',
    photos: [photo('a')],
    createdAt: '2026-01-09T10:00:00.000Z',
    updatedAt: '2026-01-09T10:00:00.000Z',
    ...overrides,
  };
}

export function jpeg(name: string): File {
  return new File(['jpeg-bytes'], name, { type: 'image/jpeg' });
}

/** Grants an upload slot for every file whose type the api accepts. */
export function grantSlots(files: { fileName: string; contentType: string }[]): UploadSlot[] {
  return files.map((file, index) =>
    file.contentType.startsWith('image/') && file.contentType !== 'image/heic'
      ? {
          photoId: `photo${index}`,
          objectPath: `photos/photo${index}/original.jpg`,
          upload: {
            url: `http://gcs.test/${index}`,
            method: 'PUT',
            headers: { 'Content-Type': 'x' },
          },
        }
      : { fileName: file.fileName, error: 'unsupported_type' },
  );
}

/** An AdminApi whose network calls are vi.fn mocks; `uploadFile` is the real XHR-based one. */
export function mockApi(uploadFile: AdminApi['uploadFile']) {
  return {
    listPosts: vi.fn<AdminApi['listPosts']>(async () => []),
    getPost: vi.fn<AdminApi['getPost']>(async () => post()),
    listCategories: vi.fn<AdminApi['listCategories']>(async () => [
      { slug: 'vinyl', name: 'vinyl' },
      { slug: 'cd', name: 'CD' },
    ]),
    listTags: vi.fn<AdminApi['listTags']>(async () => [
      { slug: 'ambient', name: 'ambient' },
      { slug: 'bowie', name: 'bowie' },
    ]),
    createPost: vi.fn<AdminApi['createPost']>(async () => post()),
    updatePost: vi.fn<AdminApi['updatePost']>(async () => post()),
    deletePost: vi.fn<AdminApi['deletePost']>(async () => {}),
    requestUploads: vi.fn<AdminApi['requestUploads']>(async (files) => grantSlots(files)),
    completeUpload: vi.fn<AdminApi['completeUpload']>(async (photoId) => photo(photoId)),
    uploadFile,
  } satisfies AdminApi;
}

/** Lets pending promise callbacks run. */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
