import { verifyPlayIntegrity } from './play-integrity.mjs';

const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MODEL_DEFAULT = 'gpt-6-astra';

const nutritionSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'items', 'warnings'],
  properties: {
    schemaVersion: { type: 'number', const: 1 },
    warnings: { type: 'array', items: { type: 'string' } },
    items: {
      type: 'array', minItems: 1, maxItems: 20,
      items: {
        type: 'object', additionalProperties: false,
        required: ['name', 'brand', 'servingLabel', 'servingWeightGrams', 'nutrients', 'statedCalories', 'confidence', 'assumptions'],
        properties: {
          name: { type: 'string' },
          brand: { type: ['string', 'null'] },
          servingLabel: { type: 'string' },
          servingWeightGrams: { type: ['number', 'null'], exclusiveMinimum: 0 },
          nutrients: {
            type: 'object', additionalProperties: false,
            required: ['carbsGrams', 'proteinGrams', 'fatGrams', 'fiberGrams', 'additionalNutrients'],
            properties: {
              carbsGrams: { type: 'number', minimum: 0 },
              proteinGrams: { type: 'number', minimum: 0 },
              fatGrams: { type: 'number', minimum: 0 },
              fiberGrams: { type: 'number', minimum: 0 },
              additionalNutrients: { type: 'array', maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['id', 'amount'], properties: {
                id: { type: 'string', enum: ['saturated_fat', 'cholesterol', 'sodium'] },
                amount: { type: 'number', minimum: 0 },
              } } },
            },
          },
          statedCalories: { type: ['number', 'null'], minimum: 0 },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          assumptions: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const supplementLabelSchema = {
  type: 'object', additionalProperties: false,
  required: ['name', 'servingLabel', 'servingUnits', 'unitName', 'nutrients', 'warnings'],
  properties: {
    name: { type: ['string', 'null'] },
    servingLabel: { type: ['string', 'null'] },
    servingUnits: { type: ['number', 'null'] },
    unitName: { type: ['string', 'null'] },
    warnings: { type: 'array', maxItems: 12, items: { type: 'string' } },
    nutrients: { type: 'array', maxItems: 30, items: { type: 'object', additionalProperties: false,
      required: ['id', 'amount', 'unit'], properties: {
        id: { type: 'string', enum: ['fiber', 'sodium', 'potassium', 'calcium', 'magnesium', 'iron', 'zinc', 'selenium', 'iodine', 'vitamin_a', 'vitamin_c', 'vitamin_d', 'vitamin_e', 'vitamin_k', 'thiamin', 'riboflavin', 'niacin', 'vitamin_b6', 'folate', 'vitamin_b12', 'choline', 'caffeine', 'omega_3', 'epa', 'dha'] },
        amount: { type: 'number', exclusiveMinimum: 0 }, unit: { type: 'string', enum: ['g', 'mg', 'mcg', 'IU'] },
      } } },
  },
};

const supplementLabelInstructions = `Transcribe a user-selected Supplement Facts label for personal tracking. Return only legible facts explicitly printed on this image. Do not suggest supplements or dosages, infer missing values, or treat percent Daily Value as an amount. Amounts are per printed serving, not per pill. servingUnits is the explicit count in a serving size such as "2 capsules"; return null if unreadable or a scoop mass without a count. unitName is capsule, tablet, scoop, or another printed unit when clear. Map only a clearly named vitamin, mineral, or listed nutrient to its stable ID. For minerals use the printed elemental amount, not compound mass. Keep omega-3, EPA and DHA separate. If a blend cannot be mapped precisely, omit it and add a warning. name is the product name only if visible. Never invent a zero amount.`;

const labHistorySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'rows'],
  properties: {
    schemaVersion: { type: 'number', const: 1 },
    rows: {
      type: 'array', maxItems: 100,
      items: {
        type: 'object', additionalProperties: false,
        required: ['resultDate', 'resultTime', 'sourceTimezone', 'value', 'unit', 'referenceRange', 'flag'],
        properties: {
          resultDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          resultTime: { type: ['string', 'null'] },
          sourceTimezone: { type: ['string', 'null'] },
          value: { type: 'number' },
          unit: { type: 'string' },
          referenceRange: { type: ['string', 'null'] },
          flag: { type: ['string', 'null'] },
        },
      },
    },
  },
};

const produceSchema = {
  type: 'object', additionalProperties: false, required: ['suggestions'], properties: {
    suggestions: { type: 'array', maxItems: 20, items: { type: 'object', additionalProperties: false,
      required: ['nutritionEntryId', 'servings', 'category', 'explanation'], properties: {
        nutritionEntryId: { type: 'string' }, servings: { type: 'number', exclusiveMinimum: 0, maximum: 20 }, category: { type: 'string', enum: ['fruit', 'vegetable'] }, explanation: { type: 'string' },
      } } },
  },
};

const workoutPlanSchema = {
  type: 'object', additionalProperties: false, required: ['days'], properties: {
    days: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false,
      required: ['weekday', 'name', 'exercises'], properties: {
        weekday: { type: 'integer', minimum: 0, maximum: 6 },
        name: { type: 'string' },
        exercises: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false,
          required: ['exerciseId'], properties: { exerciseId: { type: 'string' } } } },
      } } },
  },
};

const macroPlanSchema = {
  type: 'object', additionalProperties: false, required: ['carbsGrams', 'proteinGrams', 'fatGrams', 'fiberGrams', 'rationale'], properties: {
    carbsGrams: { type: 'number', minimum: 0, maximum: 1000 },
    proteinGrams: { type: 'number', minimum: 0, maximum: 1000 },
    fatGrams: { type: 'number', minimum: 0, maximum: 1000 },
    fiberGrams: { type: 'number', minimum: 0, maximum: 100 },
    rationale: { type: 'string' },
  },
};
const macroPlanInstructions = `Allocate an adult general-wellness macro starting point within the supplied guardrails. Use the supplied protein target (within 5 g), choose fat between 25% and 35% of target calories, and assign the remaining calories to carbohydrates. Return daily carbohydrate, protein, fat, and optional fiber grams plus a concise rationale that names these assumptions. Calories from carbohydrate × 4 + protein × 4 + fat × 9 must be within 50 kcal of the supplied target, with at least 100 g carbohydrate. The calorie target may be a user-entered number; never claim it is a verified deficit or maintenance. For an estimated target, describe it as an uncertain starting point, not a precise measurement. Do not promise muscle retention or weight loss, recommend extreme restriction, supplements, diagnoses, disease treatment, or a target date. Do not repeat age, height, weight, or the estimation basis in the rationale. The user will review and edit before saving.`;

// Product guardrails; these screen out obvious mismatches but cannot certify safety.
export const MACRO_SAFETY = { minCalories: 1500, maxCalories: 5000, maxDeficitFraction: 0.25, maxWeeklyWeightFraction: 0.01, minCarbsGrams: 100, fatFraction: 0.25 };
export const LOSS_PACE = { gentle: { weeklyLb: 0.5, deficit: 250 }, moderate: { weeklyLb: 1, deficit: 500 }, faster: { weeklyLb: 1.5, deficit: 750 } };

export function macroPlanContext(body) {
  const { age, heightCm, weightKg, activity, goal, estimationBasis } = body ?? {};
  if (!Number.isInteger(age) || age < 18 || age > 100 || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 230 || !Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300 || !['low', 'moderate', 'high'].includes(activity) || !['maintain', 'lose', 'gain'].includes(goal) || !['female', 'male'].includes(estimationBasis)) return null;
  const trainingFocus = body.trainingFocus ?? 'general'; // Existing internal builds omit this field.
  const calorieSource = body.calorieSource ?? 'estimated';
  const currentFormat = body.lossPace !== undefined;
  const lossPace = body.lossPace ?? 'gentle'; // Preserve the previous 250-kcal behavior for installed builds.
  const lossPriority = body.lossPriority ?? 'balanced';
  if (!Object.hasOwn(LOSS_PACE, lossPace) || !['fat-loss', 'balanced', 'performance'].includes(lossPriority)) return null;
  if (!['general', 'strength'].includes(trainingFocus) || !['estimated', 'user'].includes(calorieSource)) return null;
  if (calorieSource === 'user' && (!Number.isInteger(body.ownCalories) || body.ownCalories < 1200 || body.ownCalories > 5000)) return null;
  // Mifflin–St Jeor estimates resting expenditure, not measured total daily expenditure.
  const resting = 10 * weightKg + 6.25 * heightCm - 5 * age + (estimationBasis === 'male' ? 5 : -161);
  const activityFactor = { low: 1.2, moderate: 1.375, high: 1.55 }[activity];
  const maintenanceCalories = Math.round(resting * activityFactor / 10) * 10;
  const goalAdjustment = goal === 'lose' ? -LOSS_PACE[lossPace].deficit : goal === 'gain' ? 250 : 0;
  const targetCalories = calorieSource === 'user' ? body.ownCalories : maintenanceCalories + goalAdjustment;
  // App planning heuristic: cap the weight used for protein math at BMI 30 to
  // avoid scaling a sports-nutrition body-weight formula indefinitely with fat mass.
  // This is not a clinical estimate of lean mass or an individual requirement.
  const proteinReferenceKg = Math.min(weightKg, 30 * (heightCm / 100) ** 2);
  const proteinFactor = goal === 'lose' && trainingFocus === 'strength' && currentFormat ? (lossPriority === 'fat-loss' ? 1.8 : 2) : trainingFocus === 'strength' ? (goal === 'lose' ? 2 : 1.6) : (goal === 'lose' ? 1.6 : 1.2);
  const proteinTargetGrams = Math.round(proteinReferenceKg * proteinFactor);
  if (currentFormat && goal === 'lose' && calorieSource === 'estimated' && (LOSS_PACE[lossPace].deficit > maintenanceCalories * MACRO_SAFETY.maxDeficitFraction || LOSS_PACE[lossPace].weeklyLb > weightKg / 0.45359237 * MACRO_SAFETY.maxWeeklyWeightFraction)) return null;
  if (currentFormat && calorieSource === 'user' && maintenanceCalories - targetCalories > maintenanceCalories * MACRO_SAFETY.maxDeficitFraction) return null;
  const minCalories = currentFormat ? MACRO_SAFETY.minCalories : 1200;
  if (targetCalories < minCalories || targetCalories > MACRO_SAFETY.maxCalories || targetCalories < proteinTargetGrams * 4 + targetCalories * MACRO_SAFETY.fatFraction + MACRO_SAFETY.minCarbsGrams * 4) return null;
  return { version: currentFormat ? 3 : 2, restingCalories: Math.round(resting / 10) * 10, maintenanceCalories, targetCalories, calorieSource, activityFactor, goalAdjustment, proteinFactor, proteinTargetGrams, proteinReferenceKg: Math.round(proteinReferenceKg), trainingFocus, ...(currentFormat ? { lossPace, lossPriority } : {}) };
}

export function macroCalorieEstimate(body) { return macroPlanContext(body)?.targetCalories ?? null; }

// Internal builds published before the exercise-only planner still validate set/rep targets.
const legacyWorkoutPlanSchema = {
  type: 'object', additionalProperties: false, required: ['days'], properties: {
    days: { type: 'array', minItems: 1, maxItems: 6, items: { type: 'object', additionalProperties: false,
      required: ['weekday', 'name', 'exercises'], properties: {
        weekday: { type: 'integer', minimum: 0, maximum: 6 }, name: { type: 'string' },
        exercises: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'object', additionalProperties: false,
          required: ['exerciseId', 'sets', 'reps'], properties: {
            exerciseId: { type: 'string' }, sets: { type: 'integer', minimum: 1, maximum: 6 }, reps: { type: 'integer', minimum: 1, maximum: 30 },
          } } },
      } } },
  },
};

const workoutPlanInstructions = `Draft a practical weekly strength-training schedule, not medical advice. Use only the supplied built-in exercise IDs. Return exactly one day for every selected weekday and no other days. Choose a manageable number of distinct exercises for each session length, cover major muscle groups across the week, and give emphasis to the selected focus groups. Vary muscle emphasis across adjacent training days where possible. Do not choose sets, reps, weights, or other performance targets; users will enter these themselves when training. Never invent injury accommodations, diagnoses, treatment claims, or exercise IDs. The user will review and edit every suggestion before saving.`;
const legacyWorkoutPlanInstructions = `Draft a practical weekly strength-training schedule, not medical advice. Use only supplied built-in exercise IDs. Return one day for each selected weekday. Choose manageable exercises and conservative set and rep targets for the user's experience. Never invent weights, diagnoses, treatment claims, or exercise IDs. The user reviews and edits the draft before saving.`;

const produceInstructions = `Estimate cup-equivalent fruit and vegetable servings only for clearly identifiable produce in user-selected food entries. Classify each as fruit or vegetable in ordinary food-use terms. Return suggestions, not advice. Do not invent ingredients in mixed or ambiguous dishes. USDA MyPlate examples include 1 cup fruit, 1 cup raw or cooked vegetables, or 2 cups raw leafy greens as one cup-equivalent; whole fruit equivalents vary by fruit and size. Use the supplied quantity; omit entries whose amount cannot be reasonably estimated. Never diagnose or recommend a dietary target.`;

const instructions = `You extract nutrition facts for a personal food log. Return only the requested structured output.
- When the user supplies one complete total nutrition summary with calories, protein, carbohydrates, fat, and fiber, return exactly one item for the whole named meal.
- For a complete supplied summary, use the user's meal label as the item name and transcribe every supplied number exactly. A ~ or approximately marker means the value is estimated, but it does not authorize changing the number.
- Treat supplied totals as totals for the named meal, including quantities such as "x2". Do not multiply them again, split ingredients into separate foods, or replace statedCalories with calories calculated from macros.
- Only separate a described meal into individual editable foods when a complete total nutrition summary was not supplied.
- For nutrition-label images, transcribe the values per labeled serving and do not invent unreadable values.
- Nutrients are grams of total carbohydrate, protein, total fat, and dietary fiber per serving. For additionalNutrients, include only saturated fat (g), cholesterol (mg), and sodium (mg), and only when an amount is explicitly supplied in text or legibly printed on the cropped Nutrition Facts label. Otherwise use an empty array. Omit uncertain or unreadable amounts rather than reporting zero.
- statedCalories is the printed or estimated calorie value per serving. The app independently calculates tracked calories using 4/4/9.
- Use a concise servingLabel such as "1 cup (227 g)" or "2 large eggs".
- servingWeightGrams is the printed gram weight for one serving. Transcribe the gram value in parentheses when present; convert a printed ounce-only weight to grams; otherwise return null.
- Put material uncertainty in assumptions and lower confidence rather than pretending estimates are exact.
- Do not provide dietary advice, diagnoses, or recommendations.`;

const labInstructions = `You transcribe historical numeric results for one user-selected laboratory test. Return only the requested structured output.
- The user supplies the lab name. Do not identify, rename, categorize, or interpret the test.
- Extract every visible historical result row belonging to that selected lab.
- Keep each row's printed calendar date. Convert it to YYYY-MM-DD without shifting it across time zones.
- If a printed time exists, convert it to 24-hour HH:mm. Otherwise return null. Never invent a time.
- Preserve the printed time-zone abbreviation when present, otherwise return null.
- Transcribe the numeric value, unit, reference range, and flag. Use null for optional fields that are not printed or readable.
- Ignore patient names, navigation text, links, and unrelated measurements.
- Do not provide medical interpretation, diagnoses, recommendations, or reference-range judgments.`;

export default { fetch: (request, env) => handleRequest(request, env) };

export async function handleRequest(request, env, fetcher = fetch) {
  const requestId = crypto.randomUUID();
  const headers = { 'Content-Type': 'application/json', 'X-Request-Id': requestId, 'Cache-Control': 'no-store' };
  try {
    if (request.method === 'OPTIONS') return json({ error: 'Browser access is not enabled.' }, 405, headers);
    const url = new URL(request.url);
    const legacyToken = bearerToken(request.headers.get('Authorization'));
    // Do not allow the old shared-token route once Play verification is configured.
    const legacyAuthorized = !env.GOOGLE_SERVICE_ACCOUNT_JSON && !!legacyToken && !!env.RECLAIM_ACCESS_TOKEN && await safeEqual(legacyToken, env.RECLAIM_ACCESS_TOKEN);
    if (request.method === 'GET' && url.pathname === '/v1/health') return legacyAuthorized ? json({ ok: true, model: env.OPENAI_MODEL || MODEL_DEFAULT }, 200, headers) : json({ error: 'Not authorized.' }, 401, headers);
    if (request.method !== 'POST') return json({ error: 'Not found.' }, 404, headers);
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: 'The request is too large. Crop the label more closely.' }, 413, headers);
    if (url.pathname !== '/v1/parse-food-text' && url.pathname !== '/v1/parse-nutrition-label' && url.pathname !== '/v1/parse-supplement-label' && url.pathname !== '/v1/parse-lab-history' && url.pathname !== '/v1/suggest-produce' && url.pathname !== '/v1/plan-workouts' && url.pathname !== '/v1/plan-macros') return json({ error: 'Not found.' }, 404, headers);

    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const safetyIdentifier = `reclaim-${(await sha256(clientIp)).slice(0, 32)}`;
    if (env.RATE_LIMITER) {
      const outcome = await env.RATE_LIMITER.limit({ key: safetyIdentifier });
      if (!outcome.success) return json({ error: 'The private parser is temporarily rate-limited. Try again shortly.' }, 429, headers);
    }

    const rawBody = await readLimitedBody(request, MAX_BODY_BYTES);
    if (rawBody === undefined) return json({ error: 'The request is too large. Crop the label more closely.' }, 413, headers);
    if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      const integrityToken = request.headers.get('X-Play-Integrity');
      if (!integrityToken) return json({ error: 'A Google Play install is required for Private AI.' }, 401, headers);
      let valid = false;
      try { valid = await verifyPlayIntegrity(integrityToken, url.pathname, rawBody, env.GOOGLE_SERVICE_ACCOUNT_JSON, fetcher); }
      catch { return json({ error: 'Private AI verification is temporarily unavailable.' }, 503, headers); }
      if (!valid) return json({ error: 'Google Play could not verify this app install.' }, 403, headers);
    } else if (!legacyAuthorized) {
      return json({ error: 'Not authorized.' }, 401, headers);
    }
    if (env.GLOBAL_RATE_LIMITER) {
      const outcome = await env.GLOBAL_RATE_LIMITER.limit({ key: 'all-ai-requests' });
      if (!outcome.success) return json({ error: 'Private AI is at capacity. Try again later.' }, 429, headers);
    }
    let body;
    try { body = JSON.parse(rawBody); }
    catch { return json({ error: 'Invalid request JSON.' }, 400, headers); }
    let content;
    let responseInstructions = instructions;
    let responseSchema = nutritionSchema;
    let responseName = 'nutrition_parse';
    if (url.pathname === '/v1/parse-food-text') {
      const text = typeof body.text === 'string' ? body.text.trim() : '';
      if (!text || text.length > 4000) return json({ error: 'Enter a meal description under 4,000 characters.' }, 400, headers);
      content = [{ type: 'input_text', text: `Parse this food or meal description into separate items:\n${text}` }];
    } else if (url.pathname === '/v1/parse-nutrition-label') {
      const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl) || imageDataUrl.length > MAX_BODY_BYTES) return json({ error: 'Choose a cropped JPEG, PNG, or WebP nutrition-label image.' }, 400, headers);
      content = [
        { type: 'input_text', text: 'Read this nutrition label. Return the product as one item using values per labeled serving.' },
        { type: 'input_image', image_url: imageDataUrl, detail: 'high' },
      ];
    } else if (url.pathname === '/v1/parse-supplement-label') {
      const imageDataUrl = typeof body.imageDataUrl === 'string' ? body.imageDataUrl : '';
      if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(imageDataUrl) || imageDataUrl.length > MAX_BODY_BYTES) return json({ error: 'Choose a cropped JPEG, PNG, or WebP Supplement Facts image.' }, 400, headers);
      responseInstructions = supplementLabelInstructions;
      responseSchema = supplementLabelSchema;
      responseName = 'supplement_label';
      content = [{ type: 'input_text', text: 'Transcribe this Supplement Facts label. Leave unreadable or ambiguous values out.' }, { type: 'input_image', image_url: imageDataUrl, detail: 'high' }];
    } else if (url.pathname === '/v1/suggest-produce') {
      if (!Array.isArray(body.entries) || body.entries.length < 1 || body.entries.length > 20 || body.entries.some((entry) => typeof entry?.id !== 'string' || typeof entry?.name !== 'string' || typeof entry?.servingLabel !== 'string' || typeof entry?.servings !== 'number')) return json({ error: 'Select up to 20 valid food entries.' }, 400, headers);
      responseInstructions = produceInstructions;
      responseSchema = produceSchema;
      responseName = 'produce_suggestions';
      content = [{ type: 'input_text', text: `Estimate produce servings for these selected entries. Return only confident suggestions with the matching entry ID:\n${JSON.stringify(body.entries)}` }];
    } else if (url.pathname === '/v1/plan-macros') {
      const calculation = macroPlanContext(body);
      if (!calculation) return json({ error: 'This pace or calorie target is outside the supported general-wellness range. Try a slower pace or enter targets manually with professional guidance.' }, 400, headers);
      responseInstructions = macroPlanInstructions;
      responseSchema = macroPlanSchema;
      responseName = 'macro_plan';
      content = [{ type: 'input_text', text: JSON.stringify({ targetCalories: calculation.targetCalories, calorieSource: calculation.calorieSource, proteinTargetGrams: calculation.proteinTargetGrams, fatCaloriesRangePercent: [25, 35], goal: body.goal, activity: body.activity, trainingFocus: calculation.trainingFocus, ...(calculation.version === 3 ? { lossPace: calculation.lossPace, lossPriority: calculation.lossPriority } : {}) }) }];
    } else if (url.pathname === '/v1/plan-workouts') {
      const days = body.weekdays;
      const catalog = body.catalog;
      if (!Array.isArray(days) || days.length < 1 || days.length > 6 || new Set(days).size !== days.length || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) return json({ error: 'Choose one to six training days.' }, 400, headers);
      if (!Number.isInteger(body.minutes) || body.minutes < 20 || body.minutes > 120 || !['beginner', 'intermediate', 'advanced'].includes(body.experience)) return json({ error: 'Choose a valid session length and experience level.' }, 400, headers);
      if (!Array.isArray(body.equipment) || body.equipment.length < 1 || body.equipment.length > 5 || body.equipment.some((item) => !['machine', 'barbell', 'dumbbell', 'cable', 'bodyweight'].includes(item))) return json({ error: 'Choose valid equipment.' }, 400, headers);
      if (!Array.isArray(body.priorityMuscles) || body.priorityMuscles.length > 3 || body.priorityMuscles.some((item) => !['chest', 'back', 'shoulders', 'biceps', 'triceps', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'core'].includes(item))) return json({ error: 'Choose up to three muscle groups.' }, 400, headers);
      if (!Array.isArray(catalog) || catalog.length < 1 || catalog.length > 250 || catalog.some((item) => typeof item?.id !== 'string' || !/^builtin-(?:v2-)?[a-z0-9-]+$/.test(item.id) || typeof item?.name !== 'string' || item.name.length > 100 || typeof item?.primaryMuscle !== 'string' || typeof item?.equipment !== 'string')) return json({ error: 'No valid exercise catalog was provided.' }, 400, headers);
      const exerciseOnly = request.headers.get('X-Reclaim-Plan-Format') === 'exercise-ids-v2';
      responseInstructions = exerciseOnly ? workoutPlanInstructions : legacyWorkoutPlanInstructions;
      responseSchema = exerciseOnly ? workoutPlanSchema : legacyWorkoutPlanSchema;
      responseName = 'workout_plan';
      content = [{ type: 'input_text', text: JSON.stringify({ weekdays: days, minutes: body.minutes, experience: body.experience, equipment: body.equipment, priorityMuscles: body.priorityMuscles, catalog: catalog.map(({ id, name, primaryMuscle, equipment }) => ({ id, name, primaryMuscle, equipment })) }) }];
    } else {
      const labName = typeof body.labName === 'string' ? body.labName.trim() : '';
      const ocrText = typeof body.ocrText === 'string' ? body.ocrText.trim() : '';
      if (!labName || labName.length > 200) return json({ error: 'Choose a valid lab tracker before scanning.' }, 400, headers);
      if (!ocrText || ocrText.length > 20_000) return json({ error: 'Submit readable OCR text under 20,000 characters.' }, 400, headers);
      responseInstructions = labInstructions;
      responseSchema = labHistorySchema;
      responseName = 'lab_history_parse';
      content = [{ type: 'input_text', text: `Selected lab tracker: ${labName}\n\nOCR text from the user-selected report image:\n${ocrText}` }];
    }

    if (!env.OPENAI_API_KEY) return json({ error: 'The private parser is not configured yet.' }, 503, headers);
    const upstream = await fetcher('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': requestId },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || MODEL_DEFAULT,
        store: false,
        reasoning: { effort: 'medium' },
        max_output_tokens: 5000,
        safety_identifier: safetyIdentifier,
        instructions: responseInstructions,
        input: [{ role: 'user', content }],
        text: { format: { type: 'json_schema', name: responseName, strict: true, schema: responseSchema } },
      }),
    });
    if (!upstream.ok) return json({ error: upstream.status === 429 ? 'OpenAI is temporarily rate-limited. Try again shortly.' : 'The private parser could not complete this request.' }, upstream.status === 429 ? 429 : 502, headers);
    const response = await upstream.json();
    const outputText = extractOutputText(response);
    if (!outputText) return json({ error: 'The private parser returned no usable data.' }, 502, headers);
    const parsed = JSON.parse(outputText);
    if (responseName === 'workout_plan') {
      const allowedIds = new Set(body.catalog.map((exercise) => exercise.id));
      const exerciseOnly = request.headers.get('X-Reclaim-Plan-Format') === 'exercise-ids-v2';
      if (!Array.isArray(parsed.days) || parsed.days.length !== body.weekdays.length || new Set(parsed.days.map((day) => day.weekday)).size !== parsed.days.length || parsed.days.some((day) => !body.weekdays.includes(day.weekday) || typeof day.name !== 'string' || !day.name.trim() || day.name.length > 60 || !Array.isArray(day.exercises) || day.exercises.length < 1 || day.exercises.length > 10 || day.exercises.some((exercise) => !allowedIds.has(exercise.exerciseId) || (!exerciseOnly && (!Number.isInteger(exercise.sets) || exercise.sets < 1 || exercise.sets > 6 || !Number.isInteger(exercise.reps) || exercise.reps < 1 || exercise.reps > 30))))) return json({ error: 'The suggested workout could not be validated. Try again.' }, 502, headers);
      return json(parsed, 200, headers);
    }
    if (responseName === 'supplement_label') {
      const valid = parsed && typeof parsed === 'object' && (parsed.name === null || typeof parsed.name === 'string' && parsed.name.length <= 100)
        && (parsed.servingLabel === null || typeof parsed.servingLabel === 'string' && parsed.servingLabel.length <= 100)
        && (parsed.servingUnits === null || Number.isInteger(parsed.servingUnits) && parsed.servingUnits > 0 && parsed.servingUnits <= 100)
        && (parsed.unitName === null || typeof parsed.unitName === 'string' && parsed.unitName.length <= 30)
        && Array.isArray(parsed.warnings) && parsed.warnings.length <= 12 && parsed.warnings.every((warning) => typeof warning === 'string' && warning.length <= 300)
        && Array.isArray(parsed.nutrients) && parsed.nutrients.length <= 30
        && new Set(parsed.nutrients.map((value) => value.id)).size === parsed.nutrients.length
        && parsed.nutrients.every((value) => supplementLabelSchema.properties.nutrients.items.properties.id.enum.includes(value.id) && Number.isFinite(value.amount) && value.amount > 0 && value.amount <= 1_000_000 && ['g', 'mg', 'mcg', 'IU'].includes(value.unit));
      if (!valid) return json({ error: 'The supplement label could not be validated. Review it manually.' }, 502, headers);
      return json(parsed, 200, headers);
    }
    if (responseName === 'macro_plan') {
      const values = ['carbsGrams', 'proteinGrams', 'fatGrams', 'fiberGrams'];
      const calories = 4 * parsed.carbsGrams + 4 * parsed.proteinGrams + 9 * parsed.fatGrams;
      const calculation = macroPlanContext(body);
      const fatShare = (9 * parsed.fatGrams) / calculation.targetCalories;
      if (values.some((key) => !Number.isFinite(parsed[key]) || parsed[key] < 0 || parsed[key] > (key === 'fiberGrams' ? 100 : 1000)) || typeof parsed.rationale !== 'string' || !parsed.rationale.trim() || parsed.rationale.length > 800 || !Number.isFinite(calories) || calories < 1200 || calories > 5000 || Math.abs(calories - calculation.targetCalories) > 50 || Math.abs(parsed.proteinGrams - calculation.proteinTargetGrams) > 5 || fatShare < 0.25 || fatShare > 0.35 || parsed.carbsGrams < 100) return json({ error: 'The suggested macro plan did not meet the calorie and protein guardrails. Try again or enter targets manually.' }, 502, headers);
      return json({ ...parsed, estimatedCalories: calculation.targetCalories, calculation }, 200, headers);
    }
    return json(responseName === 'lab_history_parse' || responseName === 'produce_suggestions' ? parsed : normalizeResult(parsed), 200, headers);
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? 'The private parser returned invalid structured data.' : 'The private parser encountered an unexpected error.' }, 500, headers);
  }
}

async function readLimitedBody(request, limit) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > limit) { await reader.cancel(); return undefined; }
    parts.push(value);
  }
  const joined = new Uint8Array(bytes);
  let position = 0;
  for (const part of parts) { joined.set(part, position); position += part.byteLength; }
  return new TextDecoder().decode(joined);
}

function extractOutputText(response) {
  if (typeof response.output_text === 'string') return response.output_text;
  for (const item of response.output || []) {
    for (const part of item.content || []) if (part.type === 'output_text' && typeof part.text === 'string') return part.text;
  }
  return '';
}

function normalizeResult(value) {
  return {
    schemaVersion: 1,
    warnings: Array.isArray(value.warnings) ? value.warnings : [],
    items: (value.items || []).map((item) => ({
      ...item,
      brand: item.brand || undefined,
      servingWeightGrams: item.servingWeightGrams ?? undefined,
      statedCalories: item.statedCalories ?? undefined,
    })),
  };
}

function bearerToken(value) {
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1];
}

async function safeEqual(left, right) {
  const [a, b] = await Promise.all([sha256(left), sha256(right)]);
  return a === b;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function json(value, status, headers) {
  return new Response(JSON.stringify(value), { status, headers });
}
