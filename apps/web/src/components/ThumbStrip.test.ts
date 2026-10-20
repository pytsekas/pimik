// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vite-plus/test';
import { photo } from '../testFixtures.ts';
import ThumbStrip from './ThumbStrip.vue';

const photos = Array.from({ length: 9 }, (_, index) => photo(index));
const mountStrip = (selected = 0) =>
  mount(ThumbStrip, { props: { photos, selected, imageBaseUrl: 'http://img.test/b' } });

describe('ThumbStrip', () => {
  it('renders one w300 thumb per photo', () => {
    const thumbs = mountStrip().findAll('img');
    expect(thumbs).toHaveLength(9);
    expect(thumbs[0]?.attributes('src')).toBe('http://img.test/b/photos/p0/w300.jpg');
    expect(thumbs[0]?.attributes('loading')).toBe('lazy');
  });

  it('emits update:selected with the clicked index', async () => {
    const wrapper = mountStrip();
    await wrapper.findAll('button')[2]?.trigger('click');
    expect(wrapper.emitted('update:selected')).toEqual([[2]]);
  });

  it('marks the selected thumb with class on', () => {
    const buttons = mountStrip(4).findAll('button');
    expect(buttons[4]?.classes()).toContain('on');
    expect(buttons.filter((button) => button.classes().includes('on'))).toHaveLength(1);
  });
});
