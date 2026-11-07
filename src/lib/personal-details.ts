import type { WeightTdeeProfile } from '@/models/tracker';

import { feetInchesFromCm, heightCmFromFeetInches } from './weight-tdee';

export type DetailsDraft = { feet: string; inches: string; birthYear: string; formulaSex: '' | 'male' | 'female' };

export const EMPTY_DETAILS: DetailsDraft = { feet: '', inches: '', birthYear: '', formulaSex: '' };

export function detailsDraftFrom(profile: WeightTdeeProfile | undefined): DetailsDraft {
  const height = profile?.heightCm ? feetInchesFromCm(profile.heightCm) : null;
  return { feet: height ? String(height.feet) : '', inches: height ? String(height.inches) : '', birthYear: profile?.birthYear ? String(profile.birthYear) : '', formulaSex: profile?.formulaSex ?? '' };
}

/** Every detail is optional, so anything left blank is simply not saved. Throws with a message if something entered is wrong. */
export function parseDetails(draft: DetailsDraft, now = new Date()): WeightTdeeProfile {
  const profile: WeightTdeeProfile = {};
  if (draft.feet.trim() || draft.inches.trim()) {
    const heightCm = heightCmFromFeetInches(Number(draft.feet.trim() || NaN), Number(draft.inches.trim() || 0));
    if (heightCm === null) throw new Error('Enter your height in feet and inches, with inches from 0 to 11.9.');
    profile.heightCm = heightCm;
  }
  if (draft.birthYear.trim()) {
    const year = Number(draft.birthYear.trim());
    const age = now.getFullYear() - year;
    if (!Number.isInteger(year) || age > 120 || age < 0) throw new Error('Enter your birth year as four digits, like 1990.');
    if (age < 18) throw new Error('BMR estimates are for adults 18 and over, so leave birth year blank.');
    profile.birthYear = year;
  }
  if (draft.formulaSex) profile.formulaSex = draft.formulaSex;
  return profile;
}
