import type { Photo } from '@vinyl/shared';
import { computed, getCurrentScope, onScopeDispose, ref, type ComputedRef, type Ref } from 'vue';
import { AdminApiError, type AdminApi, type FileTransfer, type UploadTarget } from './adminApi.ts';

export type UploadState = 'uploading' | 'processing' | 'done' | 'error';

export type UploadItem = {
  id: string;
  fileName: string;
  previewUrl: string;
  /** 0..1 */
  progress: number;
  state: UploadState;
  error?: string;
  photo?: Photo;
};

export type UploadApi = Pick<AdminApi, 'requestUploads' | 'completeUpload' | 'uploadFile'>;

export type Uploads = {
  items: Ref<UploadItem[]>;
  addFiles(files: File[]): void;
  remove(id: string): void;
  move(from: number, to: number): void;
  /** Replaces all items with already stored photos (editing an existing post). */
  reset(photos: Photo[], previewUrl: (photo: Photo) => string): void;
  busy: ComputedRef<boolean>;
  photos: ComputedRef<Photo[]>;
};

const MAX_PARALLEL = 4;
/** The api accepts at most this many files per upload request. */
const MAX_BATCH = 50;

const MESSAGES: Record<string, string> = {
  unsupported_type: 'unsupported file type',
  too_large: 'file is larger than 30 MB',
  not_an_image: 'not a valid image',
};
const message = (code: string | undefined) => (code && MESSAGES[code]) || 'upload failed';

type Job = { id: string; file: File; target: UploadTarget; photoId: string };

let nextId = 0;

/** Photo list of the post form: uploads files straight to storage, in order, 4 at a time. */
export function useUploads(api: UploadApi): Uploads {
  const items = ref<UploadItem[]>([]);
  const queue: Job[] = [];
  const running = new Map<string, FileTransfer>();
  const blobUrls = new Set<string>();

  /** The reactive item, or undefined once it has been removed. */
  const find = (id: string) => items.value.find((item) => item.id === id);

  function fail(id: string, code?: string): void {
    const item = find(id);
    if (item) Object.assign(item, { state: 'error', error: message(code) });
  }

  function pump(): void {
    while (running.size < MAX_PARALLEL && queue.length > 0) {
      const job = queue.shift();
      if (job && find(job.id)) void run(job);
    }
  }

  async function run(job: Job): Promise<void> {
    const transfer = api.uploadFile(job.target, job.file, (fraction) => {
      const item = find(job.id);
      if (item) item.progress = fraction;
    });
    running.set(job.id, transfer);
    try {
      await transfer.done;
    } catch {
      fail(job.id);
      return;
    } finally {
      running.delete(job.id);
      pump();
    }
    const uploaded = find(job.id);
    if (!uploaded) return;
    Object.assign(uploaded, { state: 'processing', progress: 1 });
    try {
      const photo = await api.completeUpload(job.photoId);
      const item = find(job.id);
      if (item) Object.assign(item, { state: 'done', photo });
    } catch (error) {
      fail(job.id, error instanceof AdminApiError ? error.code : undefined);
    }
  }

  async function requestTargets(batch: { id: string; file: File }[]): Promise<void> {
    let slots;
    try {
      slots = await api.requestUploads(
        batch.map(({ file }) => ({ fileName: file.name, contentType: file.type, size: file.size })),
      );
    } catch {
      batch.forEach(({ id }) => fail(id));
      return;
    }
    batch.forEach(({ id, file }, index) => {
      const slot = slots[index];
      if (!slot || 'error' in slot) {
        fail(id, slot?.error);
        return;
      }
      queue.push({ id, file, target: slot.upload, photoId: slot.photoId });
    });
    pump();
  }

  function addFiles(files: File[]): void {
    const added = files.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      blobUrls.add(previewUrl);
      const item: UploadItem = {
        id: `upload-${++nextId}`,
        fileName: file.name,
        previewUrl,
        progress: 0,
        state: 'uploading',
      };
      return { item, file };
    });
    items.value.push(...added.map(({ item }) => item));
    for (let start = 0; start < added.length; start += MAX_BATCH) {
      const batch = added.slice(start, start + MAX_BATCH);
      void requestTargets(batch.map(({ item, file }) => ({ id: item.id, file })));
    }
  }

  function revoke(url: string): void {
    if (blobUrls.delete(url)) URL.revokeObjectURL(url);
  }

  function remove(id: string): void {
    const item = find(id);
    if (!item) return;
    items.value = items.value.filter((candidate) => candidate.id !== id);
    running.get(id)?.abort();
    revoke(item.previewUrl);
  }

  function move(from: number, to: number): void {
    const list = [...items.value];
    const [moved] = list.splice(from, 1);
    if (!moved) return;
    list.splice(to, 0, moved);
    items.value = list;
  }

  function reset(photos: Photo[], previewUrl: (photo: Photo) => string): void {
    items.value.forEach((item) => remove(item.id));
    items.value = photos.map((photo) => ({
      id: `photo-${photo.id}`,
      fileName: photo.id,
      previewUrl: previewUrl(photo),
      progress: 1,
      state: 'done',
      photo,
    }));
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      running.forEach((transfer) => transfer.abort());
      blobUrls.forEach(revoke);
    });
  }

  return {
    items,
    addFiles,
    remove,
    move,
    reset,
    busy: computed(() =>
      items.value.some((item) => item.state === 'uploading' || item.state === 'processing'),
    ),
    photos: computed(() =>
      items.value.flatMap((item) => (item.state === 'done' && item.photo ? [item.photo] : [])),
    ),
  };
}
