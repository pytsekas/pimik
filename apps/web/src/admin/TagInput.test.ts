// @vitest-environment happy-dom
import type { Term } from '@vinyl/shared';
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vite-plus/test';
import { h, ref } from 'vue';
import TagInput from './TagInput.vue';

const suggestions: Term[] = [
  { slug: 'ambient', name: 'ambient' },
  { slug: 'bowie', name: 'bowie' },
];

/** Mounts TagInput under a parent that holds the v-model, as PostForm does. */
function mountInput(initial: Term[] = []) {
  const model = ref(initial);
  const wrapper = mount(() =>
    h(TagInput, {
      modelValue: model.value,
      suggestions,
      'onUpdate:modelValue': (value: Term[]) => (model.value = value),
    }),
  );
  return Object.assign(wrapper, { model });
}

const chips = (wrapper: ReturnType<typeof mountInput>) =>
  wrapper.findAll('.chip').map((chip) => chip.find('span').text());

describe('TagInput', () => {
  it('typing amb suggests ambient and Enter adds it', async () => {
    const wrapper = mountInput();
    const input = wrapper.find('input');
    await input.setValue('amb');
    expect(wrapper.findAll('[role="option"]').map((option) => option.text())).toEqual(['ambient']);

    await input.trigger('keydown', { key: 'Enter' });
    expect(chips(wrapper)).toEqual(['ambient']);
    expect(wrapper.model.value).toEqual([{ slug: 'ambient', name: 'ambient' }]);
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('picks another suggestion with the arrow keys', async () => {
    const wrapper = mountInput();
    const input = wrapper.find('input');
    await input.setValue('b');
    expect(wrapper.findAll('[role="option"]').map((option) => option.text())).toEqual([
      'ambient',
      'bowie',
    ]);
    await input.trigger('keydown', { key: 'ArrowDown' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(chips(wrapper)).toEqual(['bowie']);
  });

  it('adds the literal text with a comma, or with Enter after Escape', async () => {
    const wrapper = mountInput();
    const input = wrapper.find('input');
    await input.setValue('amb');
    await input.trigger('keydown', { key: ',' });
    await input.setValue('ambi');
    await input.trigger('keydown', { key: 'Escape' });
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.model.value).toEqual([
      { slug: 'amb', name: 'amb' },
      { slug: 'ambi', name: 'ambi' },
    ]);
  });

  it('adds a suggestion when clicked', async () => {
    const wrapper = mountInput();
    await wrapper.find('input').setValue('bo');
    await wrapper.find('[role="option"]').trigger('mousedown');
    expect(chips(wrapper)).toEqual(['bowie']);
  });

  it('adds the typed text with Enter or a comma', async () => {
    const wrapper = mountInput();
    const input = wrapper.find('input');
    await input.setValue('New Wave');
    await input.trigger('keydown', { key: 'Enter' });
    await input.setValue('2016');
    await input.trigger('keydown', { key: ',' });
    expect(wrapper.model.value).toEqual([
      { slug: 'new-wave', name: 'New Wave' },
      { slug: '2016', name: '2016' },
    ]);
  });

  it('reuses an existing tag typed in full and ignores duplicates', async () => {
    const wrapper = mountInput([{ slug: 'bowie', name: 'bowie' }]);
    const input = wrapper.find('input');
    await input.setValue('Ambient');
    await input.trigger('keydown', { key: 'Enter' });
    await input.setValue('bowie');
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.model.value).toEqual([
      { slug: 'bowie', name: 'bowie' },
      { slug: 'ambient', name: 'ambient' },
    ]);
  });

  it('removes a chip with ×', async () => {
    const wrapper = mountInput([
      { slug: 'ambient', name: 'ambient' },
      { slug: 'bowie', name: 'bowie' },
    ]);
    await wrapper.findAll('.chip button')[0]?.trigger('click');
    expect(chips(wrapper)).toEqual(['bowie']);
  });
});
