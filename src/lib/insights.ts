import { ActivityRoute, CravingEvent, StepDay } from '@/models/tracker';
import { localDateKey } from './progress';

export type Insight = { id: string; title: string; detail: string };

const PERIODS = [
  { name: 'morning', from: 5, to: 12 },
  { name: 'afternoon', from: 12, to: 17 },
  { name: 'evening', from: 17, to: 22 },
  { name: 'late night', from: 22, to: 29 },
] as const;

function periodOf(hour: number) {
  const h = hour < 5 ? hour + 24 : hour;
  return PERIODS.find((item) => h >= item.from && h < item.to)!.name;
}

/**
 * Patterns that connect habits with the rest of the app. Each needs enough data
 * to mean something; with too little, it is left out rather than guessed.
 */
export function crossAreaInsights({ cravings = [], routes = [], stepDays = [], now = Date.now() }: { cravings?: CravingEvent[]; routes?: ActivityRoute[]; stepDays?: StepDay[]; now?: number }): Insight[] {
  const insights: Insight[] = [];
  const recent = cravings.filter((item) => now - Date.parse(item.at) <= 60 * 86_400_000);

  if (recent.length >= 5) {
    const counts = new Map<string, number>();
    recent.forEach((item) => { const period = periodOf(new Date(item.at).getHours()); counts.set(period, (counts.get(period) ?? 0) + 1); });
    const [period, count] = [...counts].sort((a, b) => b[1] - a[1])[0];
    if (count / recent.length >= 0.4) insights.push({ id: 'craving-time', title: `Cravings hit hardest in the ${period}`, detail: `${count} of your last ${recent.length} cravings came in the ${period}. Plan something for that time: a walk, a call, a snack.` });
  }

  if (cravings.length >= 5) {
    const beaten = cravings.filter((item) => item.outcome === 'beaten');
    const rate = Math.round((beaten.length / cravings.length) * 100);
    const helpers = new Map<string, number>();
    beaten.forEach((item) => { if (item.helped) helpers.set(item.helped, (helpers.get(item.helped) ?? 0) + 1); });
    const best = [...helpers].sort((a, b) => b[1] - a[1])[0];
    const helperName: Record<string, string> = { breathing: 'breathing', walk: 'walking', water: 'a glass of water', distraction: 'distraction', waited: 'waiting it out' };
    insights.push({ id: 'craving-rate', title: `You beat ${rate}% of your cravings`, detail: best && best[1] >= 2 ? `What works best for you: ${helperName[best[0]] ?? best[0]} (${best[1]} cravings beaten).` : `${beaten.length} of ${cravings.length} logged cravings beaten.` });
  }

  // Cravings on days you moved vs days you didn't.
  const activeDays = new Set<string>();
  routes.forEach((route) => activeDays.add(localDateKey(new Date(route.startedAt))));
  const stepValues = stepDays.filter((day) => !day.incomplete && day.count > 0).map((day) => day.count).sort((a, b) => a - b);
  const median = stepValues.length ? stepValues[Math.floor(stepValues.length / 2)] : undefined;
  if (median) stepDays.forEach((day) => { if (!day.incomplete && day.count >= median * 1.25) activeDays.add(day.date); });
  const windowDays = Array.from({ length: 30 }, (_, index) => localDateKey(new Date(now - index * 86_400_000)));
  const active = windowDays.filter((day) => activeDays.has(day));
  const quiet = windowDays.filter((day) => !activeDays.has(day));
  const cravingDays = new Map<string, number>();
  cravings.forEach((item) => { const day = localDateKey(new Date(item.at)); cravingDays.set(day, (cravingDays.get(day) ?? 0) + 1); });
  const perDay = (days: string[]) => days.reduce((sum, day) => sum + (cravingDays.get(day) ?? 0), 0) / Math.max(1, days.length);
  const totalInWindow = windowDays.reduce((sum, day) => sum + (cravingDays.get(day) ?? 0), 0);
  if (active.length >= 4 && quiet.length >= 4 && totalInWindow >= 5) {
    const onActive = perDay(active);
    const onQuiet = perDay(quiet);
    if (onQuiet > 0 && onActive < onQuiet * 0.75) {
      const fewer = Math.round((1 - onActive / onQuiet) * 100);
      insights.push({ id: 'move-less-craving', title: `${fewer}% fewer cravings on days you move`, detail: `Over the last 30 days, days with a walk or extra steps had fewer cravings than quiet days.` });
    }
  }

  return insights;
}
