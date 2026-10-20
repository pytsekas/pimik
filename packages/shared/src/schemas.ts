import { z } from 'zod';

const Photo = z.object({
  id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  paths: z.object({
    original: z.string().min(1),
    w1000: z.string().min(1),
    w300: z.string().min(1),
  }),
  wpPath: z.string().optional(),
});

const discogsUrl = z.union([
  z.literal(''),
  z.string().regex(/^https:\/\/(www\.)?discogs\.com\/\S*$/, 'Must be a discogs.com URL'),
]);

export const PostInput = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[^/?#\s]+$/, 'Slug must not contain /, ?, # or whitespace'),
  title: z.string().min(1).max(200),
  categorySlug: z.string().min(1),
  categoryName: z.string().min(1).optional(),
  tagSlugs: z.array(z.string().min(1)),
  tagNames: z.array(z.string().min(1)).optional(),
  discogsUrl: discogsUrl.optional(),
  text: z.string().optional(),
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['draft', 'published']),
  photos: z.array(Photo).min(1),
});

export type PostInputData = z.infer<typeof PostInput>;
