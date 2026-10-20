// @vitest-environment happy-dom
import { flushPromises, mount } from '@vue/test-utils';
import type { User } from 'firebase/auth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { createMemoryHistory } from 'vue-router';
import AdminApp from './AdminApp.vue';
import { uploadFile } from './adminApi.ts';
import { authReady, forbidden, signOut, user } from './auth.ts';
import { provideAdmin } from './context.ts';
import { createAdminRouter } from './router.ts';
import { adminContext, mockApi } from './testHelpers.ts';

vi.mock('./auth.ts', async () => {
  const { ref, shallowRef } = await import('vue');
  return {
    user: shallowRef(null),
    authReady: ref(false),
    forbidden: ref(false),
    signIn: vi.fn(),
    signOut: vi.fn(async () => {}),
  };
});

let context: ReturnType<typeof adminContext>;

beforeEach(() => {
  context = adminContext(mockApi(uploadFile));
  authReady.value = true;
  user.value = { email: 'owner@example.com' } as User;
  forbidden.value = false;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(signOut).mockClear();
});

async function mountApp() {
  const router = createAdminRouter(createMemoryHistory());
  await router.push('/admin/');
  const wrapper = mount(AdminApp, {
    global: { plugins: [router, (app) => provideAdmin(app, context)] },
  });
  await flushPromises();
  return wrapper;
}

const buttonNamed = (wrapper: Awaited<ReturnType<typeof mountApp>>, label: string) =>
  wrapper.findAll('button').find((button) => button.text() === label);

describe('AdminApp', () => {
  it('offers Google sign-in when signed out', async () => {
    user.value = null;
    const wrapper = await mountApp();
    expect(buttonNamed(wrapper, 'Sign in with Google')).toBeDefined();
    expect(wrapper.find('.posts-list').exists()).toBe(false);
  });

  it('shows the not-allowed message with a sign-out button on 403', async () => {
    forbidden.value = true;
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain('This Google account is not allowed.');
    expect(wrapper.find('.posts-list').exists()).toBe(false);
    expect(wrapper.find('.who').exists()).toBe(false);
    await buttonNamed(wrapper, 'Sign out')?.trigger('click');
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows the posts list to an allowed user', async () => {
    const wrapper = await mountApp();
    expect(wrapper.text()).toContain('signed in as owner@example.com');
    expect(wrapper.find('.posts-list').exists()).toBe(true);
  });

  it('asks before signing out with unsaved changes', async () => {
    const confirm = vi.fn(() => false);
    vi.stubGlobal('confirm', confirm);
    const wrapper = await mountApp();
    context.unsaved.value = true;

    await buttonNamed(wrapper, 'sign out')?.trigger('click');
    expect(confirm).toHaveBeenCalledWith('You have unsaved changes. Sign out anyway?');
    expect(signOut).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await buttonNamed(wrapper, 'sign out')?.trigger('click');
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
