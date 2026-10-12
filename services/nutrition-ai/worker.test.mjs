import assert from 'node:assert/strict';
import test from 'node:test';

import { handleRequest } from './worker.mjs';

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

test('produce suggestions require selected entries and return structured estimates', async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  const empty = await handleRequest(new Request('https://relay.test/v1/suggest-produce', { method: 'POST', headers: auth, body: JSON.stringify({ entries: [] }) }), env);
  assert.equal(empty.status, 400);
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(init.body);
    assert.equal(payload.store, false);
    assert.equal(payload.text.format.name, 'produce_suggestions');
    assert.match(payload.input[0].content[0].text, /Apple/);
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ suggestions: [{ nutritionEntryId: 'apple', servings: 1, explanation: 'One whole apple.' }] }) }] }] }), { status: 200 });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/suggest-produce', { method: 'POST', headers: auth, body: JSON.stringify({ entries: [{ id: 'apple', name: 'Apple', servingLabel: '1 medium apple', servings: 1 }] }) }), env);
  assert.deepEqual((await response.json()).suggestions[0], { nutritionEntryId: 'apple', servings: 1, explanation: 'One whole apple.' });
});

test('validates empty food text before calling OpenAI', async () => {
  const response = await handleRequest(new Request('https://relay.test/v1/parse-food-text', { method: 'POST', headers: auth, body: JSON.stringify({ text: '' }) }), env);
  assert.equal(response.status, 400);
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
    assert.match(request.instructions, /return exactly one item for the whole named meal/i);
    assert.match(request.instructions, /does not authorize changing the number/i);
    assert.match(request.instructions, /Do not multiply them again/i);
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ schemaVersion: 1, warnings: [], items: [{ name: 'Eggs', brand: null, servingLabel: '2 large (100 g)', servingWeightGrams: 100, nutrients: { carbsGrams: 1, proteinGrams: 12, fatGrams: 10, fiberGrams: 0 }, statedCalories: 140, confidence: 'high', assumptions: [] }] }) }] }] }), { status: 200 });
  };
  const response = await handleRequest(new Request('https://relay.test/v1/parse-food-text', { method: 'POST', headers: auth, body: JSON.stringify({ text: 'two eggs' }) }), env);
  assert.equal(response.status, 200);
  const item = (await response.json()).items[0];
  assert.equal(item.name, 'Eggs');
  assert.equal(item.servingWeightGrams, 100);
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
