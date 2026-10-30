// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vite-plus/test';
import { uploadFile } from './adminApi.ts';
import { provideAdmin } from './context.ts';
import StatsPage from './StatsPage.vue';
import { adminContext, mockApi, photo, post } from './testHelpers.ts';

async function mountStats(api: ReturnType<typeof mockApi>) {
  const context = adminContext(api);
  const wrapper = mount(StatsPage, {
    global: { plugins: [(app) => provideAdmin(app, context)] },
  });
  await flushPromises();
  return wrapper;
}

describe('StatsPage', () => {
  it('shows totals, a row per category and every tag with its post count', async () => {
    const api = mockApi(uploadFile);
    api.listPosts.mockResolvedValue([
      post({ id: 'p1', status: 'published', tagSlugs: ['bowie'], photos: [photo('a')] }),
      post({ id: 'p2', categorySlug: 'cd', photos: [photo('b'), photo('c')] }),
    ]);
    const wrapper = await mountStats(api);

    expect(wrapper.findAll('.totals dd').map((value) => value.text())).toEqual([
      '2',
      'published 1 · drafts 1',
      '3',
    ]);

    const rows = wrapper
      .findAll('.categories tbody tr')
      .map((row) => row.findAll('td').map((cell) => cell.text()));
    expect(rows).toEqual([
      ['CD', '1', '2'],
      ['vinyl', '1', '1'],
    ]);

    const tags = wrapper.findAll('.tags li');
    expect(tags.map((tag) => tag.find('.count').text())).toEqual(['1', '0']);
    expect(tags[0]?.find('a').attributes('href')).toBe('/tag/bowie/');
    expect(tags[1]?.find('a').exists()).toBe(false);
    expect(tags[1]?.find('.name').text()).toBe('ambient');
    expect(tags[1]?.classes()).toContain('unused');
  });

  it('does not link a tag only drafts use, since its public page does not exist', async () => {
    const api = mockApi(uploadFile);
    api.listPosts.mockResolvedValue([post({ status: 'draft', tagSlugs: ['bowie'] })]);
    const wrapper = await mountStats(api);
    const bowie = wrapper.findAll('.tags li')[0];
    expect(bowie?.find('.name').text()).toBe('bowie');
    expect(bowie?.find('.count').text()).toBe('1');
    expect(bowie?.find('a').exists()).toBe(false);
  });

  it('says when there are no tags', async () => {
    const api = mockApi(uploadFile);
    api.listTags.mockResolvedValue([]);
    const wrapper = await mountStats(api);
    expect(wrapper.text()).toContain('No tags yet.');
  });

  it('says so when loading fails', async () => {
    const api = mockApi(uploadFile);
    api.listTags.mockRejectedValue(new Error('down'));
    const wrapper = await mountStats(api);
    expect(wrapper.find('[role=alert]').text()).toBe('Could not load statistics.');
  });
});
