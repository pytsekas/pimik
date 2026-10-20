import { z } from 'zod';

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(3001),
  GCLOUD_PROJECT: z.string().min(1),
  BUCKET: z.string().min(1),
  IMAGE_BASE_URL: z.url(),
  ADMIN_EMAILS: z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((email) => email.trim())
        .filter((email) => email.length > 0),
    )
    .refine((emails) => emails.length > 0, 'at least one admin email required'),
  STORAGE_EMULATOR_HOST: z.string().min(1).optional(),
});

/** With any of these set, firebase-admin and the bucket client talk to local emulators. */
const EMULATOR_HOSTS = [
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIRESTORE_EMULATOR_HOST',
  'STORAGE_EMULATOR_HOST',
] as const;

export type Config = {
  port: number;
  projectId: string;
  bucket: string;
  imageBaseUrl: string;
  adminEmails: string[];
  storageEmulatorHost?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (env.NODE_ENV === 'production') {
    const emulators = EMULATOR_HOSTS.filter((name) => env[name]);
    if (emulators.length > 0) {
      throw new Error(`Emulator hosts must not be set in production: ${emulators.join(', ')}`);
    }
  }
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid configuration, check: ${missing}`);
  }
  const values = parsed.data;
  const config: Config = {
    port: values.API_PORT,
    projectId: values.GCLOUD_PROJECT,
    bucket: values.BUCKET,
    imageBaseUrl: values.IMAGE_BASE_URL.replace(/\/+$/, ''),
    adminEmails: values.ADMIN_EMAILS,
  };
  if (values.STORAGE_EMULATOR_HOST) {
    config.storageEmulatorHost = values.STORAGE_EMULATOR_HOST;
  }
  return config;
}
