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

export type Config = {
  port: number;
  projectId: string;
  bucket: string;
  imageBaseUrl: string;
  adminEmails: string[];
  storageEmulatorHost?: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
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
    imageBaseUrl: values.IMAGE_BASE_URL,
    adminEmails: values.ADMIN_EMAILS,
  };
  if (values.STORAGE_EMULATOR_HOST) {
    config.storageEmulatorHost = values.STORAGE_EMULATOR_HOST;
  }
  return config;
}
