import { z } from 'zod';

const schema = z.object({
  API_URL: z.url(),
  IMAGE_BASE_URL: z.url(),
  WEB_PORT: z.coerce.number().int().positive().default(3000),
  SITE_URL: z.url().default('http://localhost:3000'),
});

export type WebConfig = {
  apiUrl: string;
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
  return {
    apiUrl: trimSlash(values.API_URL),
    imageBaseUrl: trimSlash(values.IMAGE_BASE_URL),
    port: values.WEB_PORT,
    siteUrl: trimSlash(values.SITE_URL),
  };
}
