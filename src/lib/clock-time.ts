/** Convert a stored local HH:mm clock value to a user-facing 12-hour time. */
export function formatClockTime(value: string): string {
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return value;
  const hour = Number(match[1]);
  return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

/** Require an explicit AM/PM choice so an entered time cannot be ambiguous. */
export function parseClockTime(value: string): string | undefined {
  const match = value.trim().match(/^(1[0-2]|0?[1-9]):([0-5]\d)\s*([AP]M)$/i);
  if (!match) return undefined;
  const hour = Number(match[1]) % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

export function localClockTime(date = new Date()): string {
  return formatClockTime(`${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`);
}
