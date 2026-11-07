import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync } from 'node:crypto';

import { handleRequest, macroCalorieEstimate, macroPlanContext } from './worker.mjs';

test('macro calorie estimates are bounded and goal-sensitive', () => {
  const answers = { age: 35, heightCm: 178, weightKg: 82, activity: 'moderate', estimationBasis: 'male' };
  const maintain = macroCalorieEstimate({ ...answers, goal: 'maintain' });
  assert.ok(maintain > 1200);
  assert.equal(macroCalorieEstimate({ ...answers, goal: 'lose' }), maintain - 250);
  assert.equal(macroCalorieEstimate({ ...answers, goal: 'gain' }), maintain + 250);
  assert.equal(macroCalorieEstimate({ ...answers, age: 17, goal: 'maintain' }), null);
});

test('new weight-loss paces are distinct, guarded, and leave older clients unchanged', () => {
  const base = { age: 35, heightCm: 177.8, weightKg: 294 * 0.45359237, activity: 'moderate', goal: 'lose', estimationBasis: 'male', trainingFocus: 'strength', lossPriority: 'balanced' };
  const gentle = macroPlanContext({ ...base, lossPace: 'gentle' });
  const moderate = macroPlanContext({ ...base, lossPace: 'moderate' });
  const faster = macroPlanContext({ ...base, lossPace: 'faster' });
  assert.equal(gentle.version, 3);
  assert.equal(gentle.targetCalories - moderate.targetCalories, 250);
  assert.equal(moderate.targetCalories - faster.targetCalories, 250);
  assert.equal(moderate.goalAdjustment, -500);
  assert.equal(macroPlanContext({ ...base }).version, 2);
  assert.equal(macroPlanContext({ ...base }).goalAdjustment, -250);
  assert.equal(macroPlanContext({ ...base, goal: 'maintain', lossPace: 'faster' }).goalAdjustment, 0);
  assert.equal(macroPlanContext({ ...base, goal: 'gain', lossPace: 'faster' }).goalAdjustment, 250);
});

test('pace safety rejects low intake and excessive percentage of body weight', () => {
  const small = { age: 35, heightCm: 177.8, weightKg: 155 * 0.45359237, activity: 'low', goal: 'lose', estimationBasis: 'female', trainingFocus: 'strength', lossPriority: 'balanced' };
  assert.equal(macroPlanContext({ ...small, lossPace: 'faster' }), null);
  assert.ok(macroPlanContext({ ...small, lossPace: 'gentle' }));
  const large = { age: 20, heightCm: 228.6, weightKg: 600 * 0.45359237, activity: 'low', goal: 'lose', estimationBasis: 'male', trainingFocus: 'strength', lossPriority: 'balanced', lossPace: 'gentle', calorieSource: 'user', ownCalories: 1500 };
  assert.equal(macroPlanContext(large), null);
});

test('strength loss can use a known calorie target without treating it as verified maintenance', () => {
  const calculation = macroPlanContext({ age: 35, heightCm: 177.8, weightKg: 294 * 0.45359237, activity: 'moderate', goal: 'lose', estimationBasis: 'male', trainingFocus: 'strength', calorieSource: 'user', ownCalories: 2400 });
  assert.equal(calculation.targetCalories, 2400);
  assert.equal(calculation.calorieSource, 'user');
  assert.ok(calculation.proteinTargetGrams >= 185);
  assert.ok(calculation.proteinTargetGrams <= 210);
  assert.ok(calculation.maintenanceCalories > calculation.targetCalories);
  assert.equal(macroPlanContext({ age: 35, heightCm: 177.8, weightKg: 133, activity: 'moderate', goal: 'lose', estimationBasis: 'male', trainingFocus: 'strength', calorieSource: 'user', ownCalories: 1100 }), null);
});

test('macro planner only forwards the calorie estimate and validates AI output', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const answers = { age: 35, heightCm: 178, weightKg: 82, activity: 'moderate', goal: 'maintain', estimationBasis: 'male' };
  const estimatedCalories = macroCalorieEstimate(answers);
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.store, false);
    assert.equal(request.text.format.name, 'macro_plan');
    const forwarded = JSON.parse(request.input[0].content[0].text);
    assert.deepEqual(forwarded, { targetCalories: estimatedCalories, calorieSource: 'estimated', proteinTargetGrams: macroPlanContext(answers).proteinTargetGrams, fatCaloriesRangePercent: [25, 35], goal: 'maintain', activity: 'moderate', trainingFocus: 'general' });
    assert.ok(!request.input[0].content[0].text.includes('heightCm'));
    const proteinGrams = forwarded.proteinTargetGrams;
    const fatGrams = Math.round(estimatedCalories * 0.3 / 9);
    const carbsGrams = Math.round((estimatedCalories - 4 * proteinGrams - 9 * fatGrams) / 4);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ carbsGrams, proteinGrams, fatGrams, fiberGrams: 25, rationale: 'An editable starting point.' }) }] }] });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/plan-macros', { method: 'POST', headers: auth, body: JSON.stringify(answers) }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).estimatedCalories, estimatedCalories);
});

test('macro planner rejects an AI split below the protein guardrail', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const answers = { age: 35, heightCm: 177.8, weightKg: 294 * 0.45359237, activity: 'moderate', goal: 'lose', estimationBasis: 'male', trainingFocus: 'strength', calorieSource: 'user', ownCalories: 2400 };
  globalThis.fetch = async () => Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ carbsGrams: 345, proteinGrams: 160, fatGrams: 42, fiberGrams: 35, rationale: 'A split.' }) }] }] });
  const response = await handleRequest(new Request('https://relay.test/v1/plan-macros', { method: 'POST', headers: auth, body: JSON.stringify(answers) }), env);
  assert.equal(response.status, 502);
});

test('macro planner accepts a strength-focused 2400 kcal draft and exposes its assumptions', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const answers = { age: 35, heightCm: 177.8, weightKg: 294 * 0.45359237, activity: 'moderate', goal: 'lose', estimationBasis: 'male', trainingFocus: 'strength', calorieSource: 'user', ownCalories: 2400 };
  const proteinGrams = macroPlanContext(answers).proteinTargetGrams;
  globalThis.fetch = async (_url, init) => {
    const forwarded = JSON.parse(JSON.parse(init.body).input[0].content[0].text);
    assert.equal(forwarded.targetCalories, 2400);
    assert.equal(forwarded.proteinTargetGrams, proteinGrams);
    assert.ok(!('weightKg' in forwarded));
    const fatGrams = 80;
    const carbsGrams = (2400 - proteinGrams * 4 - fatGrams * 9) / 4;
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ carbsGrams, proteinGrams, fatGrams, fiberGrams: 30, rationale: 'An editable strength-focused starting point; the calorie target is user-entered.' }) }] }] });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/plan-macros', { method: 'POST', headers: auth, body: JSON.stringify(answers) }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.calculation.calorieSource, 'user');
  assert.equal(result.calculation.proteinTargetGrams, proteinGrams);
  assert.equal(result.estimatedCalories, 2400);
});

test('new pace request returns a validated v3 plan without forwarding body measurements', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const answers = { age: 35, heightCm: 177.8, weightKg: 294 * 0.45359237, activity: 'moderate', goal: 'lose', estimationBasis: 'male', trainingFocus: 'strength', lossPace: 'faster', lossPriority: 'performance', calorieSource: 'estimated' };
  const expected = macroPlanContext(answers);
  globalThis.fetch = async (_url, init) => {
    const forwardedText = JSON.parse(init.body).input[0].content[0].text;
    assert.ok(!forwardedText.includes('weightKg'));
    assert.ok(!forwardedText.includes('heightCm'));
    const forwarded = JSON.parse(forwardedText);
    assert.equal(forwarded.lossPace, 'faster');
    assert.equal(forwarded.lossPriority, 'performance');
    const fatGrams = Math.round(forwarded.targetCalories * 0.3 / 9);
    const carbsGrams = Math.round((forwarded.targetCalories - 4 * forwarded.proteinTargetGrams - 9 * fatGrams) / 4);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ carbsGrams, proteinGrams: forwarded.proteinTargetGrams, fatGrams, fiberGrams: 30, rationale: 'An editable estimate, not a guaranteed rate of loss.' }) }] }] });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/plan-macros', { method: 'POST', headers: auth, body: JSON.stringify(answers) }), env);
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.calculation.version, 3);
  assert.equal(result.calculation.targetCalories, expected.targetCalories);
  assert.equal(result.calculation.goalAdjustment, -750);
  assert.ok(Math.abs(4 * result.carbsGrams + 4 * result.proteinGrams + 9 * result.fatGrams - expected.targetCalories) <= 50);
});
import { requestHash, validVerdict } from './play-integrity.mjs';

const env = { RECLAIM_ACCESS_TOKEN: 'a-very-long-personal-access-token', OPENAI_API_KEY: 'test-key', OPENAI_MODEL: 'gpt-6-astra' };
const auth = { Authorization: `Bearer ${env.RECLAIM_ACCESS_TOKEN}`, 'Content-Type': 'application/json' };

test('rejects unauthenticated requests', async () => {
  const response = await handleRequest(new Request('https://relay.test/v1/health'), env);
  assert.equal(response.status, 401);
});

test('health check exposes model but no secrets', async () => {
  const response = await handleRequest(new Request('https://relay.test/v1/health', { headers: auth }), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, model: 'gpt-6-astra' });
});

test('workout planning validates choices and returns exercise IDs for selected weekdays', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const body = { weekdays: [1, 3], minutes: 45, experience: 'beginner', equipment: ['dumbbell'], priorityMuscles: ['biceps'], catalog: [{ id: 'builtin-22', name: 'Dumbbell Curl', primaryMuscle: 'biceps', equipment: 'dumbbell' }] };
  const invalid = await handleRequest(new Request('https://relay.test/v1/plan-workouts', { method: 'POST', headers: auth, body: JSON.stringify({ ...body, weekdays: [1, 1] }) }), env);
  assert.equal(invalid.status, 400);
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.store, false);
    assert.equal(request.text.format.name, 'workout_plan');
    assert.match(request.instructions, /not medical advice/i);
    assert.match(request.instructions, /Do not choose sets, reps, weights/i);
    assert.deepEqual(request.text.format.schema.properties.days.items.properties.exercises.items.required, ['exerciseId']);
    assert.match(request.input[0].content[0].text, /Dumbbell Curl/);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ days: [1, 3].map((weekday) => ({ weekday, name: 'Strength', exercises: [{ exerciseId: 'builtin-22' }] })) }) }] }] });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/plan-workouts', { method: 'POST', headers: { ...auth, 'X-Reclaim-Plan-Format': 'exercise-ids-v2' }, body: JSON.stringify(body) }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).days.map((day) => day.weekday), [1, 3]);
});

test('older Play installs continue receiving set and rep targets', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const body = { weekdays: [1], minutes: 45, experience: 'beginner', equipment: ['dumbbell'], priorityMuscles: [], catalog: [{ id: 'builtin-22', name: 'Dumbbell Curl', primaryMuscle: 'biceps', equipment: 'dumbbell' }] };
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.deepEqual(request.text.format.schema.properties.days.items.properties.exercises.items.required, ['exerciseId', 'sets', 'reps']);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ days: [{ weekday: 1, name: 'Monday strength', exercises: [{ exerciseId: 'builtin-22', sets: 2, reps: 10 }] }] }) }] }] });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/plan-workouts', { method: 'POST', headers: auth, body: JSON.stringify(body) }), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).days[0].exercises[0].sets, 2);
});

test('validates empty food text before calling OpenAI', async () => {
  const response = await handleRequest(new Request('https://relay.test/v1/parse-food-text', { method: 'POST', headers: auth, body: JSON.stringify({ text: '' }) }), env);
  assert.equal(response.status, 400);
});

test('supplement label scan uses a separate schema and never invents dose values', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.text.format.name, 'supplement_label');
    assert.match(request.instructions, /Do not suggest supplements or dosages/i);
    assert.equal(request.input[0].content[1].type, 'input_image');
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ name: 'D3', servingLabel: '2 capsules', servingUnits: 2, unitName: 'capsule', nutrients: [{ id: 'vitamin_d', amount: 2000, unit: 'IU' }], warnings: [] }) }] }] });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/parse-supplement-label', { method: 'POST', headers: auth, body: JSON.stringify({ imageDataUrl: 'data:image/jpeg;base64,AAAA' }) }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).nutrients, [{ id: 'vitamin_d', amount: 2000, unit: 'IU' }]);
});

test('supplement label scan rejects duplicate nutrient IDs', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ name: null, servingLabel: null, servingUnits: null, unitName: null, nutrients: [{ id: 'vitamin_d', amount: 10, unit: 'mcg' }, { id: 'vitamin_d', amount: 20, unit: 'mcg' }], warnings: [] }) }] }] });
  const response = await handleRequest(new Request('https://relay.test/v1/parse-supplement-label', { method: 'POST', headers: auth, body: JSON.stringify({ imageDataUrl: 'data:image/jpeg;base64,AAAA' }) }), env);
  assert.equal(response.status, 502);
});

test('returns structured OpenAI food output', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.model, 'gpt-6-astra');
    assert.equal(request.store, false);
    assert.equal(request.text.format.type, 'json_schema');
    assert.ok(request.text.format.schema.properties.items.items.required.includes('servingWeightGrams'));
    assert.ok(request.text.format.schema.properties.items.items.properties.nutrients.required.includes('additionalNutrients'));
    assert.deepEqual(request.text.format.schema.properties.items.items.properties.nutrients.properties.additionalNutrients.items.properties.id.enum, ['saturated_fat', 'cholesterol', 'sodium']);
    assert.match(request.instructions, /Omit uncertain or unreadable amounts rather than reporting zero/i);
    assert.match(request.instructions, /return exactly one item for the whole named meal/i);
    assert.match(request.instructions, /does not authorize changing the number/i);
    assert.match(request.instructions, /Do not multiply them again/i);
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ schemaVersion: 1, warnings: [], items: [{ name: 'Eggs', brand: null, servingLabel: '2 large (100 g)', servingWeightGrams: 100, nutrients: { carbsGrams: 1, proteinGrams: 12, fatGrams: 10, fiberGrams: 0, additionalNutrients: [{ id: 'sodium', amount: 140 }] }, statedCalories: 140, confidence: 'high', assumptions: [] }] }) }] }] }), { status: 200 });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/parse-food-text', { method: 'POST', headers: auth, body: JSON.stringify({ text: 'two eggs' }) }), env);
  assert.equal(response.status, 200);
  const item = (await response.json()).items[0];
  assert.equal(item.name, 'Eggs');
  assert.equal(item.servingWeightGrams, 100);
  assert.deepEqual(item.nutrients.additionalNutrients, [{ id: 'sodium', amount: 140 }]);
});

test('returns structured historical lab rows without asking the model to identify the lab', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async (_url, init) => {
    const request = JSON.parse(init.body);
    assert.equal(request.store, false);
    assert.equal(request.text.format.name, 'lab_history_parse');
    assert.match(request.input[0].content[0].text, /Selected lab tracker: Glucose Lvl/);
    const parsed = { schemaVersion: 1, rows: [{ resultDate: '2026-08-27', resultTime: '10:32', sourceTimezone: 'EDT', value: 86, unit: 'mg/dL', referenceRange: '70 mg/dL - 99 mg/dL', flag: null }] };
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(parsed) }] }] }), { status: 200 });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/parse-lab-history', { method: 'POST', headers: auth, body: JSON.stringify({ labName: 'Glucose Lvl', ocrText: '86 mg/dL\nDate: Aug 27, 2026 10:32 a.m. EDT' }) }), env);
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).rows[0], { resultDate: '2026-08-27', resultTime: '10:32', sourceTimezone: 'EDT', value: 86, unit: 'mg/dL', referenceRange: '70 mg/dL - 99 mg/dL', flag: null });
});

test('Play verdict must match package, request body, age, app and device', async () => {
  const hash = await requestHash('/v1/parse-food-text', '{"text":"eggs"}');
  const verdict = {
    requestDetails: { requestPackageName: 'com.greekkid60.reclaim', requestHash: hash, timestampMillis: String(Date.now()) },
    appIntegrity: { packageName: 'com.greekkid60.reclaim', appRecognitionVerdict: 'PLAY_RECOGNIZED' },
    accountDetails: { appLicensingVerdict: 'LICENSED' },
    deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
  };
  assert.equal(validVerdict(verdict, hash), true);
  assert.equal(validVerdict(verdict, await requestHash('/v1/parse-food-text', '{"text":"other"}')), false);
  assert.equal(validVerdict({ ...verdict, appIntegrity: { ...verdict.appIntegrity, appRecognitionVerdict: 'UNRECOGNIZED_VERSION' } }, hash), false);
  assert.equal(validVerdict({ ...verdict, accountDetails: { appLicensingVerdict: 'UNLICENSED' } }, hash), false);
  assert.equal(validVerdict({ ...verdict, deviceIntegrity: {} }, hash), false);
  assert.equal(validVerdict({ ...verdict, requestDetails: { ...verdict.requestDetails, timestampMillis: String(Date.now() - 180_000) } }, hash), false);
});

test('Play mode rejects shared bearer and requires verified request-bound token', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const playEnv = { ...env, GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_email: 'tester@example.test', private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }) }) };
  const path = '/v1/parse-food-text';
  const body = JSON.stringify({ text: 'two eggs' });
  const url = `https://relay.test${path}`;
  const oldClient = await handleRequest(new Request(url, { method: 'POST', headers: auth, body }), playEnv, () => { throw new Error('Google should not be called'); });
  assert.equal(oldClient.status, 401);
  const missingToken = await handleRequest(new Request(url, { method: 'POST', body }), playEnv, () => { throw new Error('Google should not be called'); });
  assert.equal(missingToken.status, 401);

  const fetcher = async (target, init) => {
    if (target.includes('oauth2.googleapis.com')) return Response.json({ access_token: 'google-test-token' });
    if (target.includes('playintegrity.googleapis.com')) {
      assert.equal(init.headers.Authorization, 'Bearer google-test-token');
      return Response.json({ tokenPayloadExternal: {
        requestDetails: { requestPackageName: 'com.greekkid60.reclaim', requestHash: await requestHash(path, body), timestampMillis: String(Date.now()) },
        appIntegrity: { packageName: 'com.greekkid60.reclaim', appRecognitionVerdict: 'PLAY_RECOGNIZED' },
        accountDetails: { appLicensingVerdict: 'LICENSED' },
        deviceIntegrity: { deviceRecognitionVerdict: ['MEETS_DEVICE_INTEGRITY'] },
      } });
    }
    assert.match(target, /api.openai.com/);
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ schemaVersion: 1, warnings: [], items: [] }) }] }] });
  };
  const verified = await handleRequest(new Request(url, { method: 'POST', headers: { 'X-Play-Integrity': 'a-valid-looking-test-integrity-token' }, body }), playEnv, fetcher);
  assert.equal(verified.status, 200);
});

test('the removed fruit and vegetable route is gone', async () => {
  const response = await handleRequest(new Request('https://relay.test/v1/suggest-produce', { method: 'POST', body: '{}' }), {});
  assert.notEqual(response.status, 200);
});
