declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent;
  export default component;
}

interface Window {
  /** Set by the server-rendered page; see `AppState` in createApp.ts. */
  __STATE__?: unknown;
  /** Set by the server on `/admin/*` shells. */
  __ADMIN_CONFIG__?: { imageBaseUrl: string };
}

/** Build-time variables Vite exposes to the client (from the process environment). */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY?: string;
  /** Set (e.g. `http://localhost:9099`) to use the Auth emulator. */
  readonly VITE_FIREBASE_AUTH_EMULATOR_URL?: string;
  readonly VITE_FIREBASE_PROJECT_ID?: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
