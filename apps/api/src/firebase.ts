import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { Config } from './config.ts';

export type Firebase = { db: Firestore; auth: Auth };

/**
 * Initialises firebase-admin once per process. Emulators are picked up from
 * the emulator host variables, so no credentials are needed locally.
 */
export function initFirebase(config: Config): Firebase {
  if (getApps().length > 0) {
    const app = getApp();
    return { db: getFirestore(app), auth: getAuth(app) };
  }
  const app = initializeApp({ projectId: config.projectId });
  const db = getFirestore(app);
  db.settings({ ignoreUndefinedProperties: true });
  return { db, auth: getAuth(app) };
}
