import { inject, type App, type InjectionKey, type Ref } from 'vue';
import type { AdminApi } from './adminApi.ts';

/** What every admin page needs; provided once by `startAdmin` (tests provide a mock api). */
export type AdminContext = {
  api: AdminApi;
  imageBaseUrl: string;
  /** True while the open post form has changes that are not saved; sign-out asks first. */
  unsaved: Ref<boolean>;
};

const ADMIN_KEY: InjectionKey<AdminContext> = Symbol('admin');

export function provideAdmin(app: App, context: AdminContext): void {
  app.provide(ADMIN_KEY, context);
}

export function useAdmin(): AdminContext {
  const context = inject(ADMIN_KEY);
  if (!context) throw new Error('admin context is not provided');
  return context;
}
