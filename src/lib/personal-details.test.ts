import { completeOnboarding, createFreshState, needsPersonalDetails } from './onboarding';
import { detailsDraftFrom, EMPTY_DETAILS, parseDetails } from './personal-details';
import { migrateTdeeProfile, restingCaloriesPerDay, validTdeeProfile } from './weight-tdee';

const NOW = new Date(2026, 10, 6);

test('every detail is optional', () => {
  expect(parseDetails(EMPTY_DETAILS, NOW)).toEqual({});
  expect(parseDetails({ ...EMPTY_DETAILS, birthYear: '1990' }, NOW)).toEqual({ birthYear: 1990 });
  expect(parseDetails({ ...EMPTY_DETAILS, feet: '5', inches: '' }, NOW).heightCm).toBe(152.4);
});

test('anything entered wrong gets a clear message', () => {
  expect(() => parseDetails({ ...EMPTY_DETAILS, inches: '5' }, NOW)).toThrow(/height/);
  expect(() => parseDetails({ ...EMPTY_DETAILS, feet: '5', inches: '12' }, NOW)).toThrow(/height/);
  expect(() => parseDetails({ ...EMPTY_DETAILS, birthYear: '90' }, NOW)).toThrow(/four digits/);
  expect(() => parseDetails({ ...EMPTY_DETAILS, birthYear: '2015' }, NOW)).toThrow(/adults/);
});

test('saved details fill the form back in', () => {
  const profile = parseDetails({ feet: '5', inches: '10', birthYear: '1990', formulaSex: 'female' }, NOW);
  expect(detailsDraftFrom(profile)).toEqual({ feet: '5', inches: '10', birthYear: '1990', formulaSex: 'female' });
});

test('BMR needs all three details, and an adult', () => {
  expect(validTdeeProfile({ heightCm: 180, birthYear: 1990 }, NOW)).toBe(false);
  expect(validTdeeProfile({ heightCm: 180, birthYear: 2015, formulaSex: 'male' }, NOW)).toBe(false);
  expect(restingCaloriesPerDay({ heightCm: 180, formulaSex: 'male' }, 90, NOW)).toBeNull();
  expect(restingCaloriesPerDay({ heightCm: 180, birthYear: 1990, formulaSex: 'male' }, 90, NOW)).toBe(1850);
});

test('a saved birth date is reduced to its year', () => {
  expect(migrateTdeeProfile({ heightCm: 180, birthDate: '1990-06-15', formulaSex: 'male' } as never)).toEqual({ heightCm: 180, birthYear: 1990, formulaSex: 'male' });
  const current = { heightCm: 180, birthYear: 1990 };
  expect(migrateTdeeProfile(current)).toBe(current);
  expect(migrateTdeeProfile(undefined)).toBeUndefined();
});

test('setup only asks when a picked area uses the details', () => {
  expect(needsPersonalDetails(['habits', 'supplements'])).toBe(false);
  expect(needsPersonalDetails(['habits', 'routes'])).toBe(true);
});

const fresh = (draft: object, onboardingSelections: never[] | string[]) => ({ ...createFreshState(), onboardingSelections, onboardingSetupDraft: draft }) as never;

test('setup saves the details, including weight without the Weight tab', () => {
  const done = completeOnboarding(fresh({ details: { feet: '5', inches: '10', birthYear: '1990', formulaSex: 'male' }, weight: { value: '180', unit: 'lb' } }, ['routes']), NOW);
  expect(done.weightTdeeProfile).toMatchObject({ birthYear: 1990, formulaSex: 'male' });
  expect(done.weightEntries?.[0]?.weight).toBe(180);
  expect(done.preferences?.visibleSections.weight).toBe(false);
});

test('skipping setup details saves none of them', () => {
  const done = completeOnboarding(fresh({ details: { feet: '5', inches: '10', birthYear: '1990', formulaSex: 'male', skipped: true } }, ['routes']), NOW);
  expect(done.weightTdeeProfile).toBeUndefined();
});
