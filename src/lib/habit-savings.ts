import { FrequencyPeriod, SavingsExpense, SavingsRate } from '@/models/tracker';
import { localDateKey } from '@/lib/progress';

const DAY_MS = 86_400_000;
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export type SavingsExpenseDraft = { id: string; label: string; amount: string; everyCount: string; everyUnit: FrequencyPeriod; effectiveDate: string };

export function formatSavings(cents: number) { return USD.format(Math.max(0, Math.round(cents)) / 100); }

export function expenseDraft(expense: SavingsExpense): SavingsExpenseDraft {
  const latest = expense.rates.at(-1)!;
  return { id: expense.id, label: expense.label, amount: (latest.amountCents / 100).toFixed(2), everyCount: String(latest.everyCount), everyUnit: latest.everyUnit, effectiveDate: localDateKey() };
}

export function validateSavingsDrafts(drafts: readonly SavingsExpenseDraft[]): string | undefined {
  for (const draft of drafts) {
    if (!draft.label.trim()) return 'Name each recurring expense.';
    if (!/^\d+(?:\.\d{1,2})?$/.test(draft.amount.trim()) || Number(draft.amount) <= 0 || Number(draft.amount) > 100000) return 'Enter an amount greater than $0, with up to two decimal places.';
    if (!Number.isInteger(Number(draft.everyCount)) || Number(draft.everyCount) < 1 || Number(draft.everyCount) > 10000) return 'Enter a recurrence from 1 to 10,000 days, weeks, or months.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveDate) || Number.isNaN(Date.parse(`${draft.effectiveDate}T00:00:00`))) return 'Use YYYY-MM-DD for the effective date.';
  }
  return undefined;
}

export function reconcileSavingsExpenses(existing: readonly SavingsExpense[], drafts: readonly SavingsExpenseDraft[], today: string): SavingsExpense[] {
  const draftById = new Map(drafts.map((draft) => [draft.id, draft]));
  const retained = existing.map((expense) => {
    if (expense.endedOn) return expense;
    const draft = draftById.get(expense.id);
    if (!draft) return { ...expense, endedOn: today };
    const latest = expense.rates.at(-1)!;
    const rate = rateFromDraft(draft);
    const changed = latest.amountCents !== rate.amountCents || latest.everyCount !== rate.everyCount || latest.everyUnit !== rate.everyUnit;
    if (!changed) return { ...expense, label: draft.label.trim() };
    if (rate.effectiveDate < latest.effectiveDate) throw new Error('A new price cannot start before the previous price.');
    const rates = rate.effectiveDate === latest.effectiveDate ? [...expense.rates.slice(0, -1), rate] : [...expense.rates, rate];
    return { ...expense, label: draft.label.trim(), rates };
  });
  return [...retained, ...drafts.filter((draft) => !existing.some((expense) => expense.id === draft.id)).map((draft) => ({ id: draft.id, label: draft.label.trim(), rates: [rateFromDraft(draft)] }))];
}

function rateFromDraft(draft: SavingsExpenseDraft): SavingsRate {
  return { effectiveDate: draft.effectiveDate, amountCents: Math.round(Number(draft.amount) * 100), everyCount: Number(draft.everyCount), everyUnit: draft.everyUnit };
}

function intervalDays(rate: SavingsRate) {
  return rate.everyCount * (rate.everyUnit === 'day' ? 1 : rate.everyUnit === 'week' ? 7 : 365.2425 / 12);
}

export function estimateExpenseSavings(expense: SavingsExpense, quitAt: string, now = Date.now()): number {
  const quit = Date.parse(quitAt);
  if (!Number.isFinite(quit) || now <= quit) return 0;
  const rates = [...expense.rates].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  let total = 0;
  rates.forEach((rate, index) => {
    const start = Math.max(quit, Date.parse(`${rate.effectiveDate}T00:00:00`));
    const next = rates[index + 1]?.effectiveDate;
    const end = Math.min(now, next ? Date.parse(`${next}T00:00:00`) : Infinity, expense.endedOn ? Date.parse(`${expense.endedOn}T00:00:00`) : Infinity);
    if (end > start && intervalDays(rate) > 0) total += rate.amountCents * (end - start) / DAY_MS / intervalDays(rate);
  });
  return Math.max(0, total);
}

export function estimateTrackerSavings(expenses: readonly SavingsExpense[] | undefined, quitAt: string | undefined, now = Date.now()): number {
  if (!quitAt) return 0;
  return (expenses ?? []).reduce((sum, expense) => sum + estimateExpenseSavings(expense, quitAt, now), 0);
}
