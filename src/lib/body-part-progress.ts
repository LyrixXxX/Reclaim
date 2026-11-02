import { BodyPart, BODY_PARTS, bodyPartFor } from '@/lib/body-parts';
import { exerciseProgress } from '@/lib/workout-analytics';
import { ExerciseMeasurement, MuscleGroup, WorkoutSession } from '@/models/tracker';

export type ExerciseStrengthTrend = {
  exerciseId: string;
  name: string;
  muscle: MuscleGroup;
  /** Best estimated max (kg), or best reps for bodyweight movements. */
  baseline: number;
  latest: number;
  changePercent: number;
  firstDate: string;
  lastDate: string;
  sessions: number;
};

export type BodyPartTrend = {
  part: BodyPart;
  /** Weekly points: % stronger than when each exercise was first logged. */
  points: { id: string; date: string; value: number }[];
  changePercent: number | null;
  firstDate?: string;
  lastDate?: string;
  exercises: ExerciseStrengthTrend[];
};

// No comparable "stronger" number exists for these; they are still logged and counted as sets.
const UNTRENDED: ExerciseMeasurement[] = ['timed_hold', 'distance_carry', 'assisted_reps'];

function weekStart(iso: string) {
  const date = new Date(iso);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate() - ((date.getDay() + 6) % 7), 12);
  return start.toISOString();
}

/** Per-exercise strength values over time: estimated max for loaded lifts, best reps for bodyweight. */
function exerciseTrends(sessions: WorkoutSession[], muscle?: MuscleGroup) {
  const completed = sessions.filter((session) => !!session.endedAt);
  const catalog = new Map<string, { name: string; muscle: MuscleGroup; measurement?: ExerciseMeasurement }>();
  for (const session of [...completed].sort((a, b) => a.endedAt!.localeCompare(b.endedAt!))) {
    for (const entry of session.exercises) catalog.set(entry.exerciseId, { name: entry.name, muscle: entry.primaryMuscle, measurement: entry.measurementType });
  }
  const trends: (ExerciseStrengthTrend & { series: { date: string; value: number }[] })[] = [];
  for (const [exerciseId, detail] of catalog) {
    if (detail.measurement && UNTRENDED.includes(detail.measurement)) continue;
    if (muscle && detail.muscle !== muscle) continue;
    const bodyweight = detail.measurement === 'bodyweight_reps';
    const series = exerciseProgress(completed, exerciseId)
      .map((point) => ({ date: point.date, value: (bodyweight ? point.bestReps : point.bestEstimatedOneRepMaxKg) ?? 0 }))
      .filter((point) => point.value > 0);
    if (!series.length) continue;
    const baseline = series[0].value;
    const latest = series.at(-1)!.value;
    trends.push({ exerciseId, name: detail.name, muscle: detail.muscle, baseline, latest, changePercent: (latest / baseline - 1) * 100,
      firstDate: series[0].date, lastDate: series.at(-1)!.date, sessions: series.length, series });
  }
  return trends;
}

/**
 * Strength trend for one body part. Each exercise is indexed against its own first logged value;
 * each week averages the latest index of every exercise trained so far, carrying exercises forward
 * so a week of different movements does not make the line jump.
 */
export function bodyPartTrend(sessions: WorkoutSession[], part: BodyPart, muscle?: MuscleGroup): BodyPartTrend {
  const trends = exerciseTrends(sessions, muscle).filter((trend) => bodyPartFor(trend.muscle) === part);
  const weeks = [...new Set(trends.flatMap((trend) => trend.series.map((point) => weekStart(point.date))))].sort();
  const points = weeks.map((week) => {
    const weekEnd = Date.parse(week) + 7 * 86_400_000;
    const indexes = trends.flatMap((trend) => {
      const seen = trend.series.filter((point) => Date.parse(point.date) < weekEnd);
      return seen.length ? [seen.at(-1)!.value / trend.baseline] : [];
    });
    const average = indexes.reduce((sum, value) => sum + value, 0) / indexes.length;
    return { id: `${part}-${week}`, date: week, value: (average - 1) * 100 };
  });
  return {
    part,
    points,
    changePercent: points.length ? points.at(-1)!.value : null,
    firstDate: trends.length ? trends.map((trend) => trend.firstDate).sort()[0] : undefined,
    lastDate: trends.length ? trends.map((trend) => trend.lastDate).sort().at(-1) : undefined,
    exercises: trends.map(({ series: _series, ...trend }) => trend).sort((a, b) => b.lastDate.localeCompare(a.lastDate)),
  };
}

export function bodyPartTrends(sessions: WorkoutSession[]): BodyPartTrend[] {
  return BODY_PARTS.map((part) => bodyPartTrend(sessions, part));
}
