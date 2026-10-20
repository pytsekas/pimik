// @vitest-environment happy-dom
import { mount, RouterLinkStub } from '@vue/test-utils';
import { describe, expect, it } from 'vite-plus/test';
import Pager from './Pager.vue';

const mountPager = (page: number, totalPages: number, basePath: string) =>
  mount(Pager, {
    props: { page, totalPages, basePath },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

const targets = (wrapper: ReturnType<typeof mountPager>) =>
  wrapper.findAllComponents(RouterLinkStub).map((link) => [link.text(), link.props('to')]);

describe('Pager', () => {
  it('shows only older on the first page', () => {
    expect(targets(mountPager(1, 3, '/'))).toEqual([['older →', '/page/2/']]);
  });

  it('points newer at the base path from page 2', () => {
    expect(targets(mountPager(2, 2, '/category/vinyl/'))).toEqual([
      ['← newer', '/category/vinyl/'],
    ]);
  });

  it('shows both in the middle and nothing for a single page', () => {
    expect(targets(mountPager(2, 3, '/tag/x/'))).toEqual([
      ['← newer', '/tag/x/'],
      ['older →', '/tag/x/page/3/'],
    ]);
    expect(mountPager(1, 1, '/').find('nav').exists()).toBe(false);
  });
});
