/** `paths` in a Photo are bucket-relative; the base comes from the server config. */
export function photoUrl(imageBaseUrl: string, path: string): string {
  return `${imageBaseUrl}/${path}`;
}
