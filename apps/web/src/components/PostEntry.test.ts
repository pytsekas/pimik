// @vitest-environment happy-dom
import { mount, RouterLinkStub } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { testPost } from '../testFixtures.ts';
import PostEntry from './PostEntry.vue';

const mountEntry = (post = testPost(), props: Record<string, unknown> = {}) =>
  mount(PostEntry, {
    props: { post, imageBaseUrl: 'http://img.test/b', ...props },
    global: { stubs: { RouterLink: RouterLinkStub } },
  });

const links = (wrapper: ReturnType<typeof mountEntry>) =>
  wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'));

describe('PostEntry', () => {
  it('sizes the big photo from the current photo and builds the srcset', () => {
    const hero = mountEntry().find('img.hero');
    expect(hero.attributes('width')).toBe('2000');
    expect(hero.attributes('height')).toBe('1333');
    expect(hero.attributes('src')).toBe('http://img.test/b/photos/p0/original.jpg');
    expect(hero.attributes('srcset')).toBe(
      'http://img.test/b/photos/p0/w300.jpg 300w, http://img.test/b/photos/p0/w1000.jpg 1000w, http://img.test/b/photos/p0/original.jpg 2000w',
    );
    expect(hero.attributes('sizes')).toBe('(max-width: 2000px) 100vw, 2000px');
    expect(hero.attributes('loading')).toBeUndefined();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the selected photo uncropped at its own height', async () => {
    vi.useFakeTimers();
    const wrapper = mountEntry();
    await wrapper.findAll('.thumbs button')[1]?.trigger('click');
    await vi.runAllTimersAsync();
    const hero = wrapper.find('img.hero');
    expect(hero.attributes('height')).toBe('2000');
    expect(hero.attributes('src')).toContain('photos/p1/original.jpg');
    expect(hero.attributes('style')).toBeUndefined();
  });

  it('fades the big photo out, swaps it and fades in once the new photo has loaded', async () => {
    vi.useFakeTimers();
    const wrapper = mountEntry();
    const hero = () => wrapper.find('img.hero');
    await wrapper.findAll('.thumbs button')[1]?.trigger('click');
    expect(hero().classes()).toContain('fading');
    expect(hero().attributes('src')).toContain('photos/p0/');

    await vi.advanceTimersByTimeAsync(150);
    expect(hero().attributes('src')).toContain('photos/p1/');
    expect(hero().classes()).toContain('fading');

    await hero().trigger('load');
    expect(hero().classes()).not.toContain('fading');
  });

  it('stays hidden when the photo it is leaving finishes loading', async () => {
    vi.useFakeTimers();
    const wrapper = mountEntry();
    const hero = () => wrapper.find('img.hero');
    await wrapper.findAll('.thumbs button')[1]?.trigger('click');
    await hero().trigger('load');
    expect(hero().classes()).toContain('fading');
  });

  it('fades back in without a load when the choice returns to the photo showing', async () => {
    vi.useFakeTimers();
    const wrapper = mountEntry();
    const thumbs = wrapper.findAll('.thumbs button');
    await thumbs[1]?.trigger('click');
    await thumbs[0]?.trigger('click');
    await vi.advanceTimersByTimeAsync(150);
    expect(wrapper.find('img.hero').classes()).not.toContain('fading');
    expect(wrapper.find('img.hero').attributes('src')).toContain('photos/p0/');
  });

  it('swaps at once when the visitor prefers reduced motion', async () => {
    const matchMedia = vi
      .spyOn(window, 'matchMedia')
      .mockReturnValue({ matches: true } as MediaQueryList);
    const wrapper = mountEntry();
    await wrapper.findAll('.thumbs button')[1]?.trigger('click');
    expect(wrapper.find('img.hero').attributes('src')).toContain('photos/p1/');
    expect(wrapper.find('img.hero').classes()).not.toContain('fading');
    matchMedia.mockRestore();
  });

  it('lazy-loads the big photo when asked to', () => {
    expect(mountEntry(testPost(), { lazy: true }).find('img.hero').attributes('loading')).toBe(
      'lazy',
    );
  });

  it('omits the discogs link without discogsUrl', () => {
    expect(mountEntry().text()).not.toContain('discogs');
  });

  it('opens discogs in a new tab safely', () => {
    const link = mountEntry(testPost({ discogsUrl: 'https://discogs.com/x' })).find(
      'a[href="https://discogs.com/x"]',
    );
    expect(link.text()).toBe('discogs ↗');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });

  it('links title, category and tags', () => {
    const wrapper = mountEntry(testPost(), { tagNames: { bowie: 'David Bowie' } });
    expect(links(wrapper)).toEqual([
      '/category/vinyl/',
      '/vinyl/david-bowie-%E2%98%85/',
      '/tag/bowie/',
      '/tag/2016/',
    ]);
    expect(wrapper.find('.tags').text()).toContain('David Bowie');
    expect(wrapper.find('.tags').text()).toContain('2016');
    expect(wrapper.find('.meta').text()).toContain('2026-01-09');
  });

  it('renders markdown text only when full', () => {
    const post = testPost({ text: 'hello **there** <script>x</script>' });
    expect(mountEntry(post).find('.text').exists()).toBe(false);
    const full = mountEntry(post, { full: true }).find('.text');
    expect(full.html()).toContain('<strong>there</strong>');
    expect(full.html()).not.toContain('<script>');
  });

  it('opens the lightbox from the big photo and closes it again', async () => {
    const wrapper = mountEntry(testPost(), {});
    expect(document.body.querySelector('.lightbox')).toBeNull();
    await wrapper.find('img.hero').trigger('click');
    expect(document.body.querySelector('.lightbox')).not.toBeNull();
    document.body.querySelector<HTMLElement>('.lightbox')?.click();
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('.lightbox')).toBeNull();
    wrapper.unmount();
  });
});
