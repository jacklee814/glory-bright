/** Prefix site-local links and public assets with Astro's configured base. */
export function siteUrl(path: string): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
}
