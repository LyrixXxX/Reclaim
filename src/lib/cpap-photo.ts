import { File, Paths } from 'expo-file-system';

import { CpapReadingInput, parseCpapRecognition } from '@/lib/cpap';

export async function recoverPhoto(uri: string): Promise<{ savedUri: string; parsed: Partial<CpapReadingInput>; text: string; status: string }> {
  let savedUri = uri;
  try {
    const source = new File(uri);
    const destination = new File(Paths.document, `cpap-recovered-${Date.now()}.jpg`);
    await source.copy(destination);
    savedUri = destination.uri;
  } catch {
    // The pending picker URI is still usable for review even if the durable copy fails.
  }
  const { recognizeText } = await import('@infinitered/react-native-mlkit-text-recognition');
  const recognized = await recognizeText(savedUri);
  const parsed = parseCpapRecognition(recognized);
  const coreKeys: (keyof CpapReadingInput)[] = ['usedMinutes', 'averagePressure', 'p95Pressure', 'ahi', 'cai', 'averageLeak', 'p95Leak'];
  const count = coreKeys.filter((key) => parsed[key] !== undefined).length;
  return { savedUri, parsed, text: recognized.text, status: `Recovered the camera result and found ${count} of 7 core values${parsed.score !== undefined ? ' plus the score' : ''}. Please compare every field with the photo before saving.` };
}
