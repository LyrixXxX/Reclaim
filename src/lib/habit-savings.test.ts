import { createReclaimBackup, parseReclaimBackup } from './backup';
import { createFreshState } from './onboarding';
import { createTracker, editTracker, TrackerDraft } from './tracker-management';
import { estimateExpenseSavings, estimateTrackerSavings, reconcileSavingsExpenses, validateSavingsDrafts } from './habit-savings';
import { SavingsExpense } from '@/models/tracker';

const at = (date: string) => Date.parse(`${date}T00:00:00`);
const first: SavingsExpense = { id: 'kratom', label: 'Kratom', rates: [{ effectiveDate: '2026-09-01', amountCents: 4500, everyCount: 3, everyUnit: 'week' }] };

test('three-week and two separate nicotine costs accrue smoothly in cents', () => {
  const juice: SavingsExpense = { id: 'juice', label: 'Juice', rates: [{ effectiveDate: '2026-09-01', amountCents: 2197, everyCount: 1, everyUnit: 'week' }] };
  const coils: SavingsExpense = { id: 'coils', label: 'Coils', rates: [{ effectiveDate: '2026-09-01', amountCents: 2197, everyCount: 2, everyUnit: 'week' }] };
  expect(estimateExpenseSavings(first, '2026-09-01T00:00:00', at('2026-09-22'))).toBeCloseTo(4500);
  expect(estimateTrackerSavings([first], undefined, at('2026-09-22'))).toBe(0);
  expect(estimateTrackerSavings([first, juice, coils], '2026-09-01T00:00:00', at('2026-09-15'))).toBeCloseTo(9591);
  expect(estimateExpenseSavings(juice, '2026-09-01T00:00:00', at('2026-09-01') + 12 * 3600_000)).toBeCloseTo(156.92857, 4);
});

test('new expense backfills, later start delays accrual, and a price change preserves earlier rates', () => {
  const original = reconcileSavingsExpenses([], [{ id: 'a', label: 'Juice', amount: '7', everyCount: '1', everyUnit: 'week', effectiveDate: '2026-09-01' }], '2026-09-10');
  const changed = reconcileSavingsExpenses(original, [{ id: 'a', label: 'Juice', amount: '14', everyCount: '1', everyUnit: 'week', effectiveDate: '2026-09-08' }], '2026-09-10');
  expect(estimateTrackerSavings(changed, '2026-09-01T00:00:00', at('2026-09-15'))).toBeCloseTo(2100);
  const stopped = reconcileSavingsExpenses(changed, [], '2026-09-15');
  expect(estimateTrackerSavings(stopped, '2026-09-01T00:00:00', at('2026-09-22'))).toBeCloseTo(2100);
  expect(estimateTrackerSavings([{ ...first, rates: [{ ...first.rates[0], effectiveDate: '2026-09-08' }] }], '2026-09-01T00:00:00', at('2026-09-08'))).toBe(0);
});

test('validates inputs and preserves savings in old-compatible backups', () => {
  expect(validateSavingsDrafts([{ id: 'x', label: 'Juice', amount: '21.971', everyCount: '1', everyUnit: 'week', effectiveDate: '2026-09-01' }])).toBeTruthy();
  const tracker = { id: 'quit', name: 'Quit', icon: '◇', color: '#fff', mode: 'abstinence' as const, startedAt: '2026-09-01T00:00:00', savingsExpenses: [first] };
  const restored = parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...createFreshState(), trackers: [tracker] })));
  expect(restored.state.trackers[0].savingsExpenses).toEqual([first]);
  expect(parseReclaimBackup(JSON.stringify(createReclaimBackup({ ...createFreshState(), trackers: [{ ...tracker, savingsExpenses: undefined }] }))).state.trackers[0].savingsExpenses).toBeUndefined();
});

test('changing the quit date moves an expense that originally began at that date', () => {
  const draft: TrackerDraft = { name: 'Quit', mode: 'abstinence', startDate: '2026-09-01', icon: '◇', color: '#fff', savingsExpenses: [{ id: 'a', label: 'Juice', amount: '7', everyCount: '1', everyUnit: 'week', effectiveDate: '2026-09-01' }] };
  const created = createTracker(createFreshState(), draft, 'quit').state;
  const edited = editTracker(created, 'quit', { ...draft, startDate: '2026-08-25', savingsExpenses: [{ ...draft.savingsExpenses![0], effectiveDate: '2026-09-29' }] }).state;
  expect(edited.trackers[0].savingsExpenses?.[0].rates[0].effectiveDate).toBe('2026-08-25');
});
