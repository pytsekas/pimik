import type { Photo, Post, PostInputData, Term } from '@vinyl/shared';

export type UploadTarget = { url: string; method: 'PUT' | 'POST'; headers: Record<string, string> };

export type UploadFileInfo = { fileName: string; contentType: string; size: number };

/** One entry of `POST /v1/admin/uploads`: a place to send the bytes, or why the file was refused. */
export type UploadSlot =
  | { photoId: string; objectPath: string; upload: UploadTarget }
  | { fileName: string; error: 'unsupported_type' | 'too_large' };

export type FileTransfer = { done: Promise<void>; abort(): void };

export type AdminApi = {
  listPosts(): Promise<Post[]>;
  getPost(id: string): Promise<Post>;
  listCategories(): Promise<Term[]>;
  listTags(): Promise<Term[]>;
  createPost(input: PostInputData): Promise<Post>;
  updatePost(id: string, input: PostInputData): Promise<Post>;
  deletePost(id: string): Promise<void>;
  requestUploads(files: UploadFileInfo[]): Promise<UploadSlot[]>;
  completeUpload(photoId: string): Promise<Photo>;
  uploadFile(
    target: UploadTarget,
    file: File,
    onProgress: (fraction: number) => void,
  ): FileTransfer;
};

/** A non-2xx answer; `code` is the api's `error` field (`slug_taken`, `not_an_image`, ...). */
export class AdminApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues: unknown;

  constructor(status: number, code: string, issues?: unknown) {
    super(`admin api ${status} ${code}`);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

export type AdminApiOptions = {
  getIdToken(): Promise<string>;
  /** Called on 403, when the signed-in account is not on the admin allowlist. */
  onForbidden(): void;
  fetchImpl?: typeof fetch;
};

/** Typed `/v1/admin/*` calls; each carries a fresh Firebase ID token. */
export function createAdminApi(options: AdminApiOptions): AdminApi {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await options.getIdToken()}`,
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetchImpl(`/v1/admin${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 204) return undefined as T;
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
      issues?: unknown;
    };
    if (!response.ok) {
      if (response.status === 403) options.onForbidden();
      throw new AdminApiError(response.status, payload.error ?? 'unknown', payload.issues);
    }
    return payload as T;
  }

  const postPath = (id: string) => `/posts/${encodeURIComponent(id)}`;

  return {
    listPosts: () => call('GET', '/posts'),
    getPost: (id) => call('GET', postPath(id)),
    listCategories: () => call('GET', '/categories'),
    listTags: () => call('GET', '/tags'),
    createPost: (input) => call('POST', '/posts', input),
    updatePost: (id, input) => call('PUT', postPath(id), input),
    deletePost: (id) => call('DELETE', postPath(id)),
    requestUploads: async (files) =>
      (await call<{ files: UploadSlot[] }>('POST', '/uploads', { files })).files,
    completeUpload: (photoId) => call('POST', `/uploads/${encodeURIComponent(photoId)}/complete`),
    uploadFile,
  };
}

/** Sends the file straight to storage; XHR rather than fetch, for upload progress. */
export function uploadFile(
  target: UploadTarget,
  file: File,
  onProgress: (fraction: number) => void,
): FileTransfer {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.open(target.method, target.url);
    for (const [name, value] of Object.entries(target.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload ${xhr.status}`));
    xhr.onerror = () => reject(new Error('upload network error'));
    xhr.onabort = () => reject(new Error('upload aborted'));
    xhr.send(file);
  });
  return { done, abort: () => xhr.abort() };
}
