import { ActivityRoute, NutritionEntry, StepDay, WeightTdeeProfile } from '@/models/tracker';
import { localDateKey } from './progress';
import { nutritionTotals } from './nutrition';

const LB_TO_KG = 0.45359237;
const WALKING_MET = 3.5;
const WALKING_METERS_PER_HOUR = 4800;

export function heightCmFromFeetInches(feet: number, inches: number): number | null {
  if (!Number.isInteger(feet) || feet < 0 || !Number.isFinite(inches) || inches < 0 || inches >= 12) return null;
  const centimeters = Math.round((feet * 12 + inches) * 2.54 * 10) / 10;
  return centimeters >= 80 && centimeters <= 250 ? centimeters : null;
}

export function feetInchesFromCm(centimeters: number) {
  const totalTenths = Math.round(centimeters / 2.54 * 10);
  const feet = Math.floor(totalTenths / 120);
  return { feet, inches: (totalTenths - feet * 120) / 10 };
}

export function previousLocalDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  const day = new Date(`${date}T12:00:00`);
  if (Number.isNaN(day.getTime()) || localDateKey(day) !== date) return '';
  day.setDate(day.getDate() - 1);
  return localDateKey(day);
}

export function previousDayCalories(entries: NutritionEntry[], weighInDate: string): number | null {
  const previous = previousLocalDate(weighInDate);
  if (!previous) return null;
  const totals = nutritionTotals(entries, previous);
  return totals.entryCount ? totals.calories : null;
}

export function validTdeeProfile(profile: WeightTdeeProfile, asOf = new Date()): boolean {
  const born = new Date(`${profile.birthDate}T12:00:00`);
  return Number.isFinite(profile.heightCm) && profile.heightCm >= 80 && profile.heightCm <= 250
    && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate)
    && !Number.isNaN(born.getTime()) && localDateKey(born) === profile.birthDate
    && born <= asOf && born.getFullYear() >= 1900
    && (profile.formulaSex === 'male' || profile.formulaSex === 'female');
}

export function estimateDailyTdee(input: {
  profile: WeightTdeeProfile;
  weighInDate: string;
  weight: number;
  unit: 'lb' | 'kg';
  steps: StepDay[];
  routes: ActivityRoute[];
}) {
  const { profile, weighInDate, weight, unit, steps, routes } = input;
  const activityDate = previousLocalDate(weighInDate);
  const asOf = new Date(`${activityDate}T23:59:59`);
  if (!activityDate || !validTdeeProfile(profile, asOf) || !Number.isFinite(weight) || weight <= 0) return null;
  const weightKg = unit === 'lb' ? weight * LB_TO_KG : weight;
  const born = new Date(`${profile.birthDate}T12:00:00`);
  let age = asOf.getFullYear() - born.getFullYear();
  if (asOf.getMonth() < born.getMonth() || (asOf.getMonth() === born.getMonth() && asOf.getDate() < born.getDate())) age -= 1;
  const bmr = Math.round(10 * weightKg + 6.25 * profile.heightCm - 5 * age + (profile.formulaSex === 'male' ? 5 : -161));
  // A small non-step allowance covers unmeasured daily movement. It is not a chosen activity multiplier.
  const ordinaryActivity = Math.round(bmr * 0.1);
  const matchingRoutes = routes.filter((route) => localDateKey(new Date(route.startedAt)) === activityDate
    && Number.isFinite(route.estimatedCalories) && route.estimatedCalories! >= 0);
  const routeCalories = Math.round(matchingRoutes.reduce((sum, route) => sum + route.estimatedCalories!, 0));
  const stepDay = steps.find((day) => day.date === activityDate);
  const strideMeters = profile.heightCm / 100 * 0.415;
  const routeEquivalentSteps = matchingRoutes.reduce((sum, route) => sum + route.distanceMeters / strideMeters, 0);
  const remainingSteps = stepDay ? Math.max(0, stepDay.count - Math.min(stepDay.count, Math.round(routeEquivalentSteps))) : 0;
  const remainingDistanceMeters = remainingSteps * strideMeters;
  const walkingHours = remainingDistanceMeters / WALKING_METERS_PER_HOUR;
  // Net activity calories: resting expenditure is already included in BMR.
  const stepCalories = Math.round((WALKING_MET - 1) * weightKg * walkingHours);
  const subtotal = bmr + ordinaryActivity + stepCalories + routeCalories;
  // Food digestion is approximated as 10% of the full-day total.
  const total = Math.round(subtotal / 0.9);
  return {
    activityDate, bmr, ordinaryActivity, stepCalories, routeCalories,
    foodDigestion: total - subtotal, total, remainingSteps,
    stepStatus: !stepDay ? 'missing' as const : stepDay.incomplete ? 'partial' as const : 'recorded' as const,
  };
}
