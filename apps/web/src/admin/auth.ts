import { initializeApp } from 'firebase/app';
import {
  browserPopupRedirectResolver,
  browserSessionPersistence,
  connectAuthEmulator,
  GoogleAuthProvider,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { ref, shallowRef } from 'vue';

/** The signed-in Firebase user, or null. */
export const user = shallowRef<User | null>(null);
/** False until Firebase has restored (or ruled out) a session. */
export const authReady = ref(false);
/** Set when the api answered 403: signed in, but not on the admin allowlist. */
export const forbidden = ref(false);

let auth: Auth | undefined;

/** Starts Firebase Auth from the `VITE_FIREBASE_*` build variables; safe to call twice. */
export function initAuth(): void {
  if (auth) return;
  const vars = import.meta.env;
  const emulatorUrl = vars.VITE_FIREBASE_AUTH_EMULATOR_URL;
  const apiKey = vars.VITE_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY is not set');
  const projectId = vars.VITE_FIREBASE_PROJECT_ID || 'vinyl-rehab-local';
  const app = initializeApp({
    apiKey,
    projectId,
    authDomain: vars.VITE_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
  });
  // Session persistence: the sign-in ends with the browser tab.
  auth = initializeAuth(app, {
    persistence: browserSessionPersistence,
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  if (emulatorUrl) connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  onAuthStateChanged(auth, (current) => {
    user.value = current;
    forbidden.value = false;
    authReady.value = true;
  });
}

function requireAuth(): Auth {
  if (!auth) throw new Error('initAuth() has not been called');
  return auth;
}

export async function signIn(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(requireAuth(), provider);
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(requireAuth());
}

/** A current ID token; Firebase refreshes it when it is about to expire. */
export async function getIdToken(): Promise<string> {
  const current = requireAuth().currentUser;
  if (!current) throw new Error('not signed in');
  return current.getIdToken();
}
