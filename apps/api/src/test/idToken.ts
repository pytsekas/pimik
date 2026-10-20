import type { Auth } from 'firebase-admin/auth';

function emulatorHost(): string {
  return process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
}

/** Removes every user from the Auth emulator. */
export async function resetAuthEmulator(projectId: string): Promise<void> {
  const res = await fetch(`http://${emulatorHost()}/emulator/v1/projects/${projectId}/accounts`, {
    method: 'DELETE',
  });
  if (!res.ok) {
    throw new Error(`Auth emulator reset failed with status ${res.status}`);
  }
}

/** Creates a user in the Auth emulator and returns a real ID token for it. */
export async function getIdToken(auth: Auth, email: string, emailVerified = true): Promise<string> {
  const user = await auth.createUser({ email, emailVerified });
  const customToken = await auth.createCustomToken(user.uid);
  const res = await fetch(
    `http://${emulatorHost()}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  if (!res.ok) {
    throw new Error(`Custom token exchange failed with status ${res.status}`);
  }
  const body = (await res.json()) as { idToken: string };
  return body.idToken;
}
