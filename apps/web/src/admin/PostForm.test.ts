// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { h } from 'vue';
import { createMemoryHistory, RouterView, useRoute } from 'vue-router';
import { AdminApiError, uploadFile } from './adminApi.ts';
import { provideAdmin } from './context.ts';
import { createAdminRouter } from './router.ts';
import { FakeXhr, jpeg, mockApi, photo, post } from './testHelpers.ts';

let api: ReturnType<typeof mockApi>;

beforeEach(() => {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  api = mockApi(uploadFile);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mountAt(path: string) {
  const router = createAdminRouter(createMemoryHistory());
  await router.push(path);
  await router.isReady();
  // Keyed like AdminApp's RouterView, so a new route gets a fresh form.
  const Shell = {
    setup() {
      const route = useRoute();
      return () => h(RouterView, { key: route.fullPath });
    },
  };
  const wrapper = mount(Shell, {
    global: {
      plugins: [router, (app) => provideAdmin(app, { api, imageBaseUrl: 'http://img.test/b' })],
    },
  });
  await flushPromises();
  return { wrapper, router };
}

const field = (wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], name: string) =>
  wrapper.find(`[name="${name}"]`);
const value = (wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], name: string) =>
  (field(wrapper, name).element as HTMLInputElement).value;
const button = (wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], label: string) => {
  const found = wrapper.findAll('button').find((candidate) => candidate.text() === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
};

async function addPhotos(wrapper: Awaited<ReturnType<typeof mountAt>>['wrapper'], count: number) {
  const input = wrapper.find('input[type="file"]');
  const files = Array.from({ length: count }, (_, index) => jpeg(`${index}.jpg`));
  Object.defineProperty(input.element, 'files', { value: files, configurable: true });
  await input.trigger('change');
  await flushPromises();
}

async function finishUploads() {
  FakeXhr.instances.forEach((instance) => instance.respond(200));
  await flushPromises();
}

describe('PostForm (new post)', () => {
  it('derives the address from the title', async () => {
    const { wrapper } = await mountAt('/admin/posts/new/');
    await field(wrapper, 'title').setValue('Ajukaja & Ats – Soome Papp');
    expect(value(wrapper, 'slug')).toBe('ajukaja-ats-soome-papp');
    expect(wrapper.text()).toContain('/vinyl/ajukaja-ats-soome-papp/');
  });

  it('keeps a manually edited address when the title changes', async () => {
    const { wrapper } = await mountAt('/admin/posts/new/');
    await field(wrapper, 'title').setValue('First');
    await field(wrapper, 'slug').setValue('my-address');
    await field(wrapper, 'title').setValue('Second');
    expect(value(wrapper, 'slug')).toBe('my-address');
  });

  it('defaults the date to today', async () => {
    const { wrapper } = await mountAt('/admin/posts/new/');
    expect(value(wrapper, 'publishedAt')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('disables Publish and Save draft while an upload is running', async () => {
    const { wrapper } = await mountAt('/admin/posts/new/');
    await field(wrapper, 'title').setValue('Some title');
    await addPhotos(wrapper, 2);
    expect(button(wrapper, 'Publish').attributes('disabled')).toBeDefined();
    expect(button(wrapper, 'Save draft').attributes('disabled')).toBeDefined();

    await finishUploads();
    expect(button(wrapper, 'Publish').attributes('disabled')).toBeUndefined();
  });

  it('publishes and opens the saved post', async () => {
    api.createPost.mockResolvedValue(post({ id: 'new1', status: 'published' }));
    api.getPost.mockResolvedValue(post({ id: 'new1', status: 'published' }));
    const { wrapper, router } = await mountAt('/admin/posts/new/');
    await field(wrapper, 'title').setValue('David Bowie – Low');
    const tagInput = wrapper.find('.tags input');
    await tagInput.setValue('bowie');
    await tagInput.trigger('keydown', { key: 'Enter' });
    await tagInput.setValue('new wave');
    await tagInput.trigger('keydown', { key: 'Enter' });
    await field(wrapper, 'discogsUrl').setValue('https://www.discogs.com/release/1');
    await addPhotos(wrapper, 2);
    await finishUploads();

    await button(wrapper, 'Publish').trigger('click');
    await flushPromises();

    expect(api.createPost).toHaveBeenCalledWith({
      slug: 'david-bowie-low',
      title: 'David Bowie – Low',
      categorySlug: 'vinyl',
      tagSlugs: ['bowie'],
      tagNames: ['new wave'],
      discogsUrl: 'https://www.discogs.com/release/1',
      text: '',
      publishedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      status: 'published',
      photos: [photo('photo0'), photo('photo1')],
    });
    expect(router.currentRoute.value.fullPath).toBe('/admin/posts/new1/');
    expect(wrapper.text()).toContain('Saved');
  });

  it('sends a new category with its slug', async () => {
    const { wrapper } = await mountAt('/admin/posts/new/');
    await field(wrapper, 'title').setValue('Tape');
    await field(wrapper, 'category').setValue('__new__');
    await field(wrapper, 'categoryName').setValue('Kassetid Ö');
    expect(wrapper.text()).toContain('/kassetid-o/tape/');
    await addPhotos(wrapper, 1);
    await finishUploads();
    await button(wrapper, 'Save draft').trigger('click');
    await flushPromises();

    expect(api.createPost).toHaveBeenCalledWith(
      expect.objectContaining({
        categoryName: 'Kassetid Ö',
        categorySlug: 'kassetid-o',
        status: 'draft',
      }),
    );
  });

  it('shows "address already in use" on 409 and keeps the form', async () => {
    api.createPost.mockRejectedValue(new AdminApiError(409, 'slug_taken'));
    const { wrapper, router } = await mountAt('/admin/posts/new/');
    await field(wrapper, 'title').setValue('Taken');
    await field(wrapper, 'text').setValue('Some *text*');
    await addPhotos(wrapper, 1);
    await finishUploads();
    await button(wrapper, 'Publish').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('address already in use');
    expect(value(wrapper, 'title')).toBe('Taken');
    expect(value(wrapper, 'slug')).toBe('taken');
    expect(value(wrapper, 'text')).toBe('Some *text*');
    expect(wrapper.findAll('.photos li')).toHaveLength(1);
    expect(router.currentRoute.value.fullPath).toBe('/admin/posts/new/');
  });

  it('asks before leaving with unsaved changes', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const { wrapper, router } = await mountAt('/admin/posts/new/');
    await field(wrapper, 'title').setValue('Unsaved');
    await router.push('/admin/');
    expect(confirm).toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe('/admin/posts/new/');
  });
});

describe('PostForm (existing post)', () => {
  it('prefills the form and unpublishes', async () => {
    const existing = post({
      id: 'p1',
      title: 'david bowie – ★',
      slug: 'david-bowie-★',
      status: 'published',
      tagSlugs: ['bowie'],
      photos: [photo('a'), photo('b')],
    });
    api.getPost.mockResolvedValue(existing);
    api.updatePost.mockResolvedValue({ ...existing, status: 'draft' });
    const { wrapper } = await mountAt('/admin/posts/p1/');

    expect(api.getPost).toHaveBeenCalledWith('p1');
    expect(value(wrapper, 'title')).toBe('david bowie – ★');
    expect(value(wrapper, 'slug')).toBe('david-bowie-★');
    expect(wrapper.findAll('.chip span').map((chip) => chip.text())).toEqual(['bowie']);
    const thumbs = wrapper.findAll('.photos img').map((img) => img.attributes('src'));
    expect(thumbs).toEqual([
      'http://img.test/b/photos/a/w300.jpg',
      'http://img.test/b/photos/b/w300.jpg',
    ]);

    await field(wrapper, 'title').setValue('david bowie – ★ (2)');
    expect(value(wrapper, 'slug')).toBe('david-bowie-★');

    await button(wrapper, 'Unpublish').trigger('click');
    await flushPromises();
    expect(api.updatePost).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ status: 'draft', photos: [photo('a'), photo('b')] }),
    );
    expect(wrapper.findAll('button').map((candidate) => candidate.text())).toContain('Publish');
  });
});
