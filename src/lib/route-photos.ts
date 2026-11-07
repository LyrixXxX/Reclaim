import { Directory, File, Paths } from 'expo-file-system';

import { isRoutePhotoName, routePhotoName } from '@/lib/route-photo-names';

const folder = () => new Directory(Paths.document, 'route-photos');

/** The photo's address on this phone, or null if it isn't here, such as after restoring a backup on a new phone. */
export function routePhotoUri(name: string): string | null {
  if (!isRoutePhotoName(name)) return null;
  try {
    const file = new File(folder(), name);
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Copies picked photos into the app, so they survive being deleted from the gallery. Returns the names that saved. */
export function saveRoutePhotos(routeId: string, sources: readonly { uri: string; fileName?: string | null }[]): string[] {
  const directory = folder();
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
  const saved: string[] = [];
  sources.forEach((source, index) => {
    try {
      const name = routePhotoName(routeId, index, source.fileName ?? source.uri);
      new File(source.uri).copy(new File(directory, name));
      saved.push(name);
    } catch {
      // One unreadable photo shouldn't lose the others.
    }
  });
  return saved;
}

export function deleteRoutePhotos(names: readonly string[] | undefined) {
  for (const name of names ?? []) {
    if (!isRoutePhotoName(name)) continue;
    try {
      const file = new File(folder(), name);
      if (file.exists) file.delete();
    } catch {
      // A leftover file is harmless; deleting the route must still work.
    }
  }
}
