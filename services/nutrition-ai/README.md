# Reclaim Nutrition AI relay

This stateless Cloudflare Worker keeps the OpenAI key outside the Android app. It stores no meal descriptions or label images.

Authenticate Wrangler, deploy the locked relay once, and then set its two
encrypted Worker secrets:

```powershell
npx wrangler@latest login
npx wrangler@latest deploy
npx wrangler@latest secret put OPENAI_API_KEY
npx wrangler@latest secret put RECLAIM_ACCESS_TOKEN
```

Use a randomly generated access token of at least 32 bytes. Enter the deployed Worker URL and the same access token in Reclaim under Settings → Nutrition AI.

The model can be changed through `OPENAI_MODEL` without rebuilding Reclaim. Requests use structured outputs and `store: false`; OpenAI platform data handling still follows the API account's applicable data-retention policy.

The configured rate limiter allows 20 authenticated parsing requests per
minute. Use the OpenAI project budget and usage notification settings as the
primary spending controls.
