/** Everything the e2e run needs; deliberately different from the dev stack so both can coexist. */
export const PROJECT_ID = 'vinyl-rehab-e2e';
export const BUCKET = 'vinyl-rehab-e2e-photos';
export const WEB_PORT = 3190;
export const API_PORT = 3191;
export const FIRESTORE_HOST = 'localhost:8180';
export const AUTH_HOST = 'localhost:9199';
export const STORAGE_HOST = 'http://localhost:4443';
export const ADMIN_EMAIL = 'e2e.admin@example.com';
export const WEB_URL = `http://localhost:${WEB_PORT}`;
export const IMAGE_BASE_URL = `${STORAGE_HOST}/${BUCKET}`;
