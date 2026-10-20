// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { photo } from '../testFixtures.ts';
import Lightbox from './Lightbox.vue';

const photos = [photo(0), photo(1), photo(2)];
const mountBox = (start = 0) =>
  mount(Lightbox, {
    props: { photos, start, imageBaseUrl: 'http://img.test/b' },
    attachTo: document.body,
  });

afterEach(() => {
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key }));

describe('Lightbox', () => {
  it('shows the original and steps with the arrow keys', async () => {
    const wrapper = mountBox();
    expect(wrapper.find('img').attributes('src')).toBe('http://img.test/b/photos/p0/original.jpg');
    press('ArrowRight');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('img').attributes('src')).toContain('photos/p1/original.jpg');
    press('ArrowLeft');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('img').attributes('src')).toContain('photos/p0/original.jpg');
    wrapper.unmount();
  });

  it('closes on Escape and on backdrop click, not on image click', async () => {
    const wrapper = mountBox();
    press('Escape');
    expect(wrapper.emitted('close')).toHaveLength(1);
    await wrapper.find('img').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(1);
    await wrapper.find('.lightbox').trigger('click');
    expect(wrapper.emitted('close')).toHaveLength(2);
    wrapper.unmount();
  });

  it('swipes to the next and previous photo', async () => {
    const wrapper = mountBox(1);
    const touch = (x: number) => ({ changedTouches: [{ clientX: x }] });
    await wrapper.find('.lightbox').trigger('touchstart', touch(300));
    await wrapper.find('.lightbox').trigger('touchend', touch(100));
    expect(wrapper.find('img').attributes('src')).toContain('photos/p2/original.jpg');
    await wrapper.find('.lightbox').trigger('touchstart', touch(100));
    await wrapper.find('.lightbox').trigger('touchend', touch(300));
    expect(wrapper.find('img').attributes('src')).toContain('photos/p1/original.jpg');
    wrapper.unmount();
  });

  it('is a modal dialog, focuses close and locks body scroll while open', () => {
    const wrapper = mountBox();
    expect(wrapper.find('[aria-modal="true"]').exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.find('button.close').element);
    expect(document.body.style.overflow).toBe('hidden');
    wrapper.unmount();
    expect(document.body.style.overflow).toBe('');
  });
});
