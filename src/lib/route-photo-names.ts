export const MAX_ROUTE_PHOTOS = 20;

/** Routes keep only a file name. Backups can be edited, so anything that could reach another folder is refused. */
export function isRoutePhotoName(name: unknown): name is string {
  return typeof name === 'string' && /^[a-zA-Z0-9_-]{1,120}\.(jpg|jpeg|png|webp|heic|heif)$/i.test(name);
}

export function routePhotoName(routeId: string, index: number, sourceName = '', now = Date.now()) {
  const extension = /\.(jpe?g|png|webp|heic|heif)$/i.exec(sourceName)?.[1]?.toLowerCase() ?? 'jpg';
  return `${routeId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)}-${now}-${index}.${extension}`;
}
