import type { Photo } from './types.ts';

export type VariantName = 'original' | 'w1000' | 'w300';

export function variantPaths(photoId: string): Photo['paths'] {
  return {
    original: `photos/${photoId}/original.jpg`,
    w1000: `photos/${photoId}/w1000.jpg`,
    w300: `photos/${photoId}/w300.jpg`,
  };
}

export function parseWpImagePath(path: string): { basePath: string; requestedWidth?: number } {
  const match = /^(.*)-(\d+)x\d+(\.[^./]+)$/.exec(path);
  if (!match) return { basePath: path };
  return { basePath: `${match[1]}${match[3]}`, requestedWidth: Number(match[2]) };
}

export function pickVariant(requestedWidth?: number): VariantName {
  if (requestedWidth === undefined) return 'original';
  if (requestedWidth <= 300) return 'w300';
  if (requestedWidth <= 1000) return 'w1000';
  return 'original';
}
