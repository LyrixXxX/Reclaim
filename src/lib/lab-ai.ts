import { LabScanDraftInput } from '@/lib/labs';
import { requestPrivateAiRelay } from '@/lib/nutrition-ai';

type LabHistoryResponse = { schemaVersion?: number; rows?: unknown[] };

export async function parseLabHistoryWithAi(labName: string, ocrText: string): Promise<LabScanDraftInput[]> {
  const name = labName.trim();
  const text = ocrText.trim();
  if (!name) throw new Error('Choose a lab tracker before scanning.');
  if (!text) throw new Error('No readable report text was found. Try a closer, clearer photo.');
  if (text.length > 20_000) throw new Error('The report contains too much text. Crop the photo to this lab’s history.');
  const response = await requestPrivateAiRelay('/v1/parse-lab-history', { method: 'POST', body: JSON.stringify({ labName: name, ocrText: text }) });
  return validateLabHistoryResponse(await response.json());
}

export function validateLabHistoryResponse(value: LabHistoryResponse): LabScanDraftInput[] {
  if (value.schemaVersion !== 1 || !Array.isArray(value.rows)) throw new Error('The lab parser returned an unsupported response.');
  return value.rows.map((raw, index) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Lab row ${index + 1} was incomplete.`);
    const row = raw as Record<string, unknown>;
    if (typeof row.resultDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.resultDate)) throw new Error(`Lab row ${index + 1} has an invalid date.`);
    if (typeof row.value !== 'number' || !Number.isFinite(row.value)) throw new Error(`Lab row ${index + 1} has an invalid value.`);
    if (typeof row.unit !== 'string') throw new Error(`Lab row ${index + 1} has no measurement unit.`);
    return {
      panelDate: row.resultDate,
      resultTime: optionalString(row.resultTime),
      sourceTimezone: optionalString(row.sourceTimezone),
      value: String(row.value),
      unit: row.unit,
      referenceRange: optionalString(row.referenceRange) ?? '',
      flag: optionalString(row.flag) ?? '',
    };
  });
}

function optionalString(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : undefined; }
