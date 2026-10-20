// @vitest-environment happy-dom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vite-plus/test';
import { h, nextTick } from 'vue';
import { uploadFile } from './adminApi.ts';
import PhotoGrid from './PhotoGrid.vue';
import { mockApi, photo } from './testHelpers.ts';
import { useUploads, type UploadItem } from './useUploads.ts';

const item = (id: string, overrides: Partial<UploadItem> = {}): UploadItem => ({
  id,
  fileName: `${id}.jpg`,
  previewUrl: `blob:${id}`,
  progress: 1,
  state: 'done',
  photo: photo(id),
  ...overrides,
});

const badge = (wrapper: ReturnType<typeof mount>) =>
  wrapper.findAll('li').findIndex((tile) => tile.find('.badge').exists());

describe('PhotoGrid', () => {
  it('puts the MAIN badge on the first photo, also after a move', async () => {
    const uploads = useUploads(mockApi(uploadFile));
    uploads.reset([photo('a'), photo('b'), photo('c')], (entry) => `blob:${entry.id}`);
    const wrapper = mount(() => h(PhotoGrid, { items: uploads.items.value }));
    expect(badge(wrapper)).toBe(0);
    expect(wrapper.find('.badge').text()).toBe('MAIN');

    uploads.move(2, 0);
    await nextTick();
    expect(badge(wrapper)).toBe(0);
    expect(wrapper.findAll('li')[0]?.find('img').attributes('src')).toBe('blob:c');
    expect(uploads.photos.value[0]?.id).toBe('c');
  });

  it('skips a failed item when placing the MAIN badge', () => {
    const items = [item('a', { state: 'error', error: 'unsupported file type' }), item('b')];
    const wrapper = mount(PhotoGrid, { props: { items } });
    expect(badge(wrapper)).toBe(1);
    expect(wrapper.findAll('li')[0]?.text()).toContain('unsupported file type');
  });

  it('shows upload progress', () => {
    const wrapper = mount(PhotoGrid, {
      props: { items: [item('a', { state: 'uploading', progress: 0.6 })] },
    });
    expect(wrapper.text()).toContain('uploading 60%');
    expect(wrapper.find('.bar i').attributes('style')).toContain('width: 60%');
  });

  it('emits remove for the × button', async () => {
    const wrapper = mount(PhotoGrid, { props: { items: [item('a'), item('b')] } });
    await wrapper.findAll('button.x')[1]?.trigger('click');
    expect(wrapper.emitted('remove')).toEqual([['b']]);
  });

  it('emits move when a photo is dropped on another', async () => {
    const wrapper = mount(PhotoGrid, { props: { items: [item('a'), item('b'), item('c')] } });
    const tiles = wrapper.findAll('li');
    await tiles[2]?.trigger('dragstart');
    await tiles[0]?.trigger('dragover');
    await tiles[0]?.trigger('drop');
    expect(wrapper.emitted('move')).toEqual([[2, 0]]);
  });
});
