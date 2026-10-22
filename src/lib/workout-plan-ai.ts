import { requestPrivateAiRelay } from './nutrition-ai';
import { planCatalog, validateWorkoutPlan, validateWorkoutPlanAnswers, WorkoutPlan, WorkoutPlanAnswers } from './workout-plan';

export async function generateWorkoutPlan(answers: WorkoutPlanAnswers): Promise<WorkoutPlan> {
  const error = validateWorkoutPlanAnswers(answers);
  if (error) throw new Error(error);
  const catalog = planCatalog(answers);
  if (!catalog.length) throw new Error('No exercises match the selected equipment.');
  const response = await requestPrivateAiRelay('/v1/plan-workouts', {
    method: 'POST',
    headers: { 'X-Reclaim-Plan-Format': 'exercise-ids-v2' },
    body: JSON.stringify({
      ...answers,
      catalog: catalog.map(({ id, name, primaryMuscle, equipment }) => ({ id, name, primaryMuscle, equipment })),
    }),
  });
  return validateWorkoutPlan(await response.json(), answers, catalog);
}
