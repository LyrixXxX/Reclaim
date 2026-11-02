import { allDayPartDosesCompleted, dayPartCollapsed, dayPartCompletedByRecording, dayPartDoseId } from './supplement-daypart';

test('a scheduled group collapses only when every dose is taken or skipped', () => {
  expect(dayPartCollapsed([])).toBe(false);
  expect(dayPartCollapsed([{ status: 'taken' }, { status: null }])).toBe(false);
  expect(dayPartCollapsed([{ status: 'skipped' }, { status: null }])).toBe(false);
  expect(dayPartCollapsed([{ status: 'taken' }, { status: 'skipped' }])).toBe(true);
  expect(allDayPartDosesCompleted([{ status: 'taken' }, { status: 'taken' }])).toBe(true);
  expect(dayPartCollapsed([{ status: 'taken' }, { status: 'taken' }])).toBe(true);
});

test('a completed group can be reopened manually', () => {
  const taken = [{ status: 'taken' as const }];
  expect(dayPartCollapsed(taken, false)).toBe(false);
  expect(dayPartCollapsed(taken, true)).toBe(true);
});

test('recording one of several supplements at the same time does not finish the group', () => {
  const key = '2026-10-31T09:00';
  const doses = [
    { medication: { id: 'creatine' }, key, status: null },
    { medication: { id: 'vitamin-d' }, key, status: null },
  ];
  expect(dayPartCompletedByRecording(doses, new Set([dayPartDoseId('creatine', key)]))).toBe(false);
  expect(dayPartCompletedByRecording(doses, new Set([dayPartDoseId('creatine', key), dayPartDoseId('vitamin-d', key)]))).toBe(true);
});

test('taking or skipping the last pending dose finishes a group, including a stack', () => {
  const doses = [
    { medication: { id: 'one' }, key: '09:00', status: 'taken' as const },
    { medication: { id: 'two' }, key: '09:05', status: 'skipped' as const },
    { medication: { id: 'three' }, key: '09:10', status: null },
  ];
  expect(dayPartCompletedByRecording(doses, new Set())).toBe(false);
  expect(dayPartCompletedByRecording(doses, new Set([dayPartDoseId('three', '09:10')]))).toBe(true);
});
