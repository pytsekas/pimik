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

    const totals = wrapper.findAll('.totals div').map((box) => box.text());
    expect(totals[0]).toContain('2');
    expect(totals[0]).toContain('published 1 · drafts 1');
    expect(totals[1]).toContain('3');

    const rows = wrapper
      .findAll('.categories tbody tr')
      .map((row) => row.findAll('td').map((cell) => cell.text()));
    expect(rows).toEqual([
      ['CD', '1', '2'],
      ['vinyl', '1', '1'],
    ]);

    const tags = wrapper.findAll('.tags li');
    expect(tags.map((tag) => [tag.find('a').text(), tag.find('span').text()])).toEqual([
      ['bowie', '1'],
      ['ambient', '0'],
    ]);
    expect(tags[0]?.find('a').attributes('href')).toBe('/tag/bowie/');
    expect(tags[1]?.classes()).toContain('unused');
  });

  it('says so when loading fails', async () => {
    const api = mockApi(uploadFile);
    api.listTags.mockRejectedValue(new Error('down'));
    const wrapper = await mountStats(api);
    expect(wrapper.find('[role=alert]').text()).toBe('Could not load statistics.');
  });
});
