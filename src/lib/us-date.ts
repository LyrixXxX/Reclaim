/** Dates are stored as YYYY-MM-DD; people in the US type and read them as MM/DD/YYYY. */

export function isoToUs(value: string | undefined) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  return match ? `${match[2]}/${match[3]}/${match[1]}` : value ?? '';
}

/** A complete, real MM/DD/YYYY date as YYYY-MM-DD, or undefined. */
export function usToIso(value: string) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  const [month, day, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Inserts slashes as digits are typed: "1103" → "11/03", "11032026" → "11/03/2026". */
export function maskUsDate(input: string, previous = '') {
  // Deleting a slash should delete it, not put it straight back.
  if (input.length < previous.length) return input;
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits.length === 2 ? `${digits}/` : digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}${digits.length === 4 ? '/' : ''}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}
