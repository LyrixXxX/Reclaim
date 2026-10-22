import { offlineSamplePlan, PLAN_EQUIPMENT, planCatalog, planDayToRoutine, validateWorkoutPlan, validateWorkoutPlanAnswers, WorkoutPlanAnswers } from './workout-plan';

const answers: WorkoutPlanAnswers = { weekdays: [1, 3, 5], minutes: 45, experience: 'beginner', equipment: ['dumbbell', 'bodyweight'], priorityMuscles: ['biceps', 'triceps'] };

describe('weekly strength plan', () => {
  test('requires distinct weekdays and usable equipment', () => {
    expect(validateWorkoutPlanAnswers(answers)).toBeUndefined();
    expect(validateWorkoutPlanAnswers({ ...answers, weekdays: [1, 1] })).toMatch(/different/);
    expect(validateWorkoutPlanAnswers({ ...answers, equipment: [] })).toMatch(/equipment/);
    expect(planCatalog({ ...answers, equipment: PLAN_EQUIPMENT }).length).toBeLessThanOrEqual(250);
  });

  test('offline sample uses only selected weekdays and built-in exercises', () => {
    const catalog = planCatalog(answers);
    const plan = validateWorkoutPlan(offlineSamplePlan(answers), answers, catalog);
    expect(plan.days.map((day) => day.weekday)).toEqual([1, 3, 5]);
    expect(plan.days.every((day) => day.exercises.every((exercise) => catalog.some((item) => item.id === exercise.exerciseId)))).toBe(true);
    const routine = planDayToRoutine(plan.days[0], catalog);
    expect(routine.weekdays).toEqual([1]);
    expect(routine.exercises[0].sets).toEqual([]);
    expect(routine.exercises[0].plannedSets).toBeUndefined();
    expect(routine.exercises[0].targetReps).toBeUndefined();
  });

  test('rejects invented exercises and missing days; strips legacy targets', () => {
    const catalog = planCatalog(answers);
    const plan = offlineSamplePlan(answers);
    expect(() => validateWorkoutPlan({ days: plan.days.slice(1) }, answers, catalog)).toThrow();
    expect(() => validateWorkoutPlan({ days: [{ ...plan.days[0], exercises: [{ exerciseId: 'invented' }] }, ...plan.days.slice(1)] }, answers, catalog)).toThrow();
    const legacy = { days: [{ ...plan.days[0], exercises: [{ ...plan.days[0].exercises[0], sets: 3, reps: 10, weightKg: 100 }] }, ...plan.days.slice(1)] };
    expect(validateWorkoutPlan(legacy, answers, catalog).days[0].exercises[0]).toEqual({ exerciseId: plan.days[0].exercises[0].exerciseId });
  });
});
