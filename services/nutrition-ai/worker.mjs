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
            required: ['carbsGrams', 'proteinGrams', 'fatGrams', 'fiberGrams'],
            properties: {
              carbsGrams: { type: 'number', minimum: 0 },
              proteinGrams: { type: 'number', minimum: 0 },
              fatGrams: { type: 'number', minimum: 0 },
              fiberGrams: { type: 'number', minimum: 0 },
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

const instructions = `You extract nutrition facts for a personal food log. Return only the requested structured output.
- When the user supplies one complete total nutrition summary with calories, protein, carbohydrates, fat, and fiber, return exactly one item for the whole named meal.
- For a complete supplied summary, use the user's meal label as the item name and transcribe every supplied number exactly. A ~ or approximately marker means the value is estimated, but it does not authorize changing the number.
- Treat supplied totals as totals for the named meal, including quantities such as "x2". Do not multiply them again, split ingredients into separate foods, or replace statedCalories with calories calculated from macros.
- Only separate a described meal into individual editable foods when a complete total nutrition summary was not supplied.
- For nutrition-label images, transcribe the values per labeled serving and do not invent unreadable values.
- Nutrients are grams of total carbohydrate, protein, total fat, and dietary fiber per serving.
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

export async function handleRequest(request, env) {
  const requestId = crypto.randomUUID();
  const headers = { 'Content-Type': 'application/json', 'X-Request-Id': requestId, 'Cache-Control': 'no-store' };
  try {
    if (request.method === 'OPTIONS') return json({ error: 'Browser access is not enabled.' }, 405, headers);
    const token = bearerToken(request.headers.get('Authorization'));
    if (!token || !env.RECLAIM_ACCESS_TOKEN || !(await safeEqual(token, env.RECLAIM_ACCESS_TOKEN))) return json({ error: 'Not authorized.' }, 401, headers);
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/v1/health') return json({ ok: true, model: env.OPENAI_MODEL || MODEL_DEFAULT }, 200, headers);
    if (request.method !== 'POST') return json({ error: 'Not found.' }, 404, headers);
    const contentLength = Number(request.headers.get('Content-Length') || 0);
    if (contentLength > MAX_BODY_BYTES) return json({ error: 'The request is too large. Crop the label more closely.' }, 413, headers);
    if (url.pathname !== '/v1/parse-food-text' && url.pathname !== '/v1/parse-nutrition-label' && url.pathname !== '/v1/parse-lab-history') return json({ error: 'Not found.' }, 404, headers);

    const safetyIdentifier = `reclaim-${(await sha256(token)).slice(0, 32)}`;
    if (env.RATE_LIMITER) {
      const outcome = await env.RATE_LIMITER.limit({ key: safetyIdentifier });
      if (!outcome.success) return json({ error: 'The private parser is temporarily rate-limited. Try again shortly.' }, 429, headers);
    }

    const body = await request.json();
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
    const upstream = await fetch('https://api.openai.com/v1/responses', {
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
    return json(responseName === 'lab_history_parse' ? parsed : normalizeResult(parsed), 200, headers);
  } catch (error) {
    return json({ error: error instanceof SyntaxError ? 'The private parser returned invalid structured data.' : 'The private parser encountered an unexpected error.' }, 500, headers);
  }
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
