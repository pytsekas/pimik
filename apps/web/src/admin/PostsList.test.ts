// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createMemoryHistory } from 'vue-router';
import { uploadFile } from './adminApi.ts';
import { provideAdmin } from './context.ts';
import PostsList from './PostsList.vue';
import { createAdminRouter } from './router.ts';
import { adminContext, mockApi, photo, post } from './testHelpers.ts';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mountList(api: ReturnType<typeof mockApi>) {
  const context = adminContext(api);
  const router = createAdminRouter(createMemoryHistory());
  await router.push('/admin/');
  const wrapper = mount(PostsList, {
    global: {
      plugins: [router, (app) => provideAdmin(app, context)],
    },
  });
  await flushPromises();
  return wrapper;
}

const published = post({
  id: 'p1',
  title: 'Low',
  status: 'published',
  photos: [photo('a'), photo('b')],
});
const draft = post({ id: 'p2', title: 'Heroes', categorySlug: 'cd', photos: [photo('c')] });

describe('PostsList', () => {
  it('lists posts with main photo, category name and status', async () => {
    const api = mockApi(uploadFile);
    api.listPosts.mockResolvedValue([published, draft]);
    const wrapper = await mountList(api);

    const rows = wrapper.findAll('.rows li');
    expect(rows).toHaveLength(2);
    expect(rows[0]?.find('img').attributes('src')).toBe('http://img.test/b/photos/a/w300.jpg');
    expect(rows[0]?.text()).toContain('Low');
    expect(rows[0]?.find('.status').text()).toBe('published');
    expect(rows[1]?.text()).toContain('CD');
    expect(rows[1]?.find('.status').text()).toBe('draft');
    expect(rows[1]?.text()).not.toContain('Unpublish');
  });

  it('unpublishes a post with all its fields', async () => {
    const api = mockApi(uploadFile);
    api.listPosts.mockResolvedValue([published]);
    api.updatePost.mockResolvedValue({ ...published, status: 'draft' });
    const wrapper = await mountList(api);

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Unpublish')
      ?.trigger('click');
    await flushPromises();
    expect(api.updatePost).toHaveBeenCalledWith('p1', {
      slug: 'some-post',
      title: 'Low',
      categorySlug: 'vinyl',
      tagSlugs: [],
      discogsUrl: '',
      text: '',
      publishedAt: '2026-01-09',
      status: 'draft',
      photos: [photo('a'), photo('b')],
    });
    expect(wrapper.find('.status').text()).toBe('draft');
  });

  it('deletes only after confirmation', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const api = mockApi(uploadFile);
    api.listPosts.mockResolvedValue([published]);
    const wrapper = await mountList(api);
    const deleteButton = () =>
      wrapper.findAll('button').find((button) => button.text() === 'Delete');

    await deleteButton()?.trigger('click');
    expect(confirm).toHaveBeenCalledWith("Delete 'Low' and its photos?");
    expect(api.deletePost).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await deleteButton()?.trigger('click');
    await flushPromises();
    expect(api.deletePost).toHaveBeenCalledWith('p1');
    expect(wrapper.text()).toContain('No posts yet.');
  });
});
