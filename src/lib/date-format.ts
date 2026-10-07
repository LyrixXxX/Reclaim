export function formatLocalStartDate(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(timestamp));
}

export function formatLocalStartDateTime(timestamp: string) {
  const date = new Date(timestamp);
  const datePart = formatLocalStartDate(timestamp);
  const timePart = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
  return `${datePart} at ${timePart}`;
}
