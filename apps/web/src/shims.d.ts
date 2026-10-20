declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent;
  export default component;
}

interface Window {
  /** Set by the server-rendered page; see `AppState` in createApp.ts. */
  __STATE__?: unknown;
}
