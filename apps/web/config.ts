import { z } from 'zod';

const schema = z.object({
  API_URL: z.url(),
  API_AUDIENCE: z.url().optional(),
  IMAGE_BASE_URL: z.url(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  SITE_URL: z.url().optional(),
  NODE_ENV: z.string().optional(),
});

const DEV_SITE_URL = 'http://localhost:3000';

export type WebConfig = {
  apiUrl: string;
  /** When set, api calls carry a Google ID token for this audience (IAM-protected Cloud Run api). */
  apiAudience?: string;
  imageBaseUrl: string;
  port: number;
  siteUrl: string;
};

const trimSlash = (url: string) => url.replace(/\/+$/, '');

export function loadConfig(source: NodeJS.ProcessEnv = process.env): WebConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const invalid = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
    throw new Error(`Invalid configuration, check: ${invalid}`);
  }
  const values = parsed.data;
  if (values.SITE_URL === undefined && values.NODE_ENV === 'production') {
    throw new Error('Invalid configuration, check: SITE_URL (required in production)');
  }
  const config: WebConfig = {
    apiUrl: trimSlash(values.API_URL),
    imageBaseUrl: trimSlash(values.IMAGE_BASE_URL),
    port: values.WEB_PORT,
    siteUrl: trimSlash(values.SITE_URL ?? DEV_SITE_URL),
  };
  if (values.API_AUDIENCE) config.apiAudience = values.API_AUDIENCE;
  return config;
}
