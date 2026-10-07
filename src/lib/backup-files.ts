import { EncodingType, File, Paths } from 'expo-file-system';

import { BackupAttachment, createReclaimBackup, ReclaimBackup } from '@/lib/backup';
import { TrackerState } from '@/models/tracker';
import { readStepHistory } from '@/lib/activity-step-history';

export async function createPortableBackup(state: TrackerState) {
  const attachments: BackupAttachment[] = [];
  for (const reading of state.cpapReadings ?? []) {
    const attachment = await readAttachment('cpap', reading.id, reading.photoUri);
    if (attachment) attachments.push(attachment);
  }
  for (const result of state.labResults ?? []) {
    const attachment = await readAttachment('lab', result.id, result.photoUri);
    if (attachment) attachments.push(attachment);
  }
  for (const food of state.savedFoods ?? []) {
    const attachment = await readAttachment('nutrition', food.id, food.labelPhotoUri);
    if (attachment) attachments.push(attachment);
  }
  return createReclaimBackup({ ...state, stepHistory: await readStepHistory() }, attachments);
}

export async function restorePortableBackup(backup: ReclaimBackup) {
  const restoredUris = new Map<string, string>();
  for (const attachment of backup.attachments) {
    try {
      const extension = safeExtension(attachment.extension);
      const ownerId = attachment.ownerId.replace(/[^a-zA-Z0-9_-]/g, '-');
      const destination = new File(Paths.document, `restored-${attachment.ownerType}-${ownerId}.${extension}`);
      destination.write(attachment.base64, { encoding: EncodingType.Base64 });
      restoredUris.set(`${attachment.ownerType}:${attachment.ownerId}`, destination.uri);
    } catch {
      // A damaged individual photo never prevents the user's recorded data from restoring.
    }
  }
  return {
    ...backup.state,
    cpapReadings: (backup.state.cpapReadings ?? []).map((reading) => ({
      ...reading,
      photoUri: restoredUris.get(`cpap:${reading.id}`),
    })),
    labResults: (backup.state.labResults ?? []).map((result) => ({
      ...result,
      photoUri: restoredUris.get(`lab:${result.id}`),
    })),
    savedFoods: (backup.state.savedFoods ?? []).map((food) => ({
      ...food,
      labelPhotoUri: restoredUris.get(`nutrition:${food.id}`),
    })),
  } satisfies TrackerState;
}

async function readAttachment(ownerType: BackupAttachment['ownerType'], ownerId: string, uri?: string) {
  if (!uri) return undefined;
  try {
    const file = new File(uri);
    if (!file.exists) return undefined;
    return {
      ownerType,
      ownerId,
      extension: safeExtension(file.extension.replace(/^\./, '')),
      mimeType: file.type || undefined,
      base64: await file.base64(),
    } satisfies BackupAttachment;
  } catch {
    return undefined;
  }
}

function safeExtension(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  return normalized && normalized.length <= 5 ? normalized : 'jpg';
}
