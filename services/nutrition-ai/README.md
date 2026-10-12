# Reclaim Nutrition AI relay

This stateless Cloudflare Worker keeps the OpenAI key outside the Android app. It stores no meal descriptions or label images.

The existing deployment has `OPENAI_API_KEY` and `RECLAIM_ACCESS_TOKEN`.
Do not publish the shared token in an APK. Before deploying this update:

1. In Play Console, link Reclaim to a Google Cloud project under **Protected with Play → Play Integrity API**.
2. In that Cloud project, create a service account allowed to call Play Integrity's decode API. Store its JSON credentials as the Worker secret `GOOGLE_SERVICE_ACCOUNT_JSON` (never in the app or repository).
3. Set `EXPO_PUBLIC_RECLAIM_PLAY_INTEGRITY_PROJECT_NUMBER` to that Cloud project's **numeric project number** when you build Reclaim. This number is public configuration, not a secret.
4. Deploy this Worker from this directory. Once `GOOGLE_SERVICE_ACCOUNT_JSON` is present, the Worker accepts only request-bound Play Integrity tokens and ignores `RECLAIM_ACCESS_TOKEN`. After the Play-installed app is verified, remove the old `RECLAIM_ACCESS_TOKEN` secret.
5. Use a separate OpenAI project for Reclaim and enforce a project hard spend limit. The visible `$100` usage allowance or a spend alert is not necessarily a hard cap.

Do not enable Play verification on the Worker before distributing the new app through Play internal testing: older app builds use the legacy shared token and will stop reaching AI. No user-entered relay URL, access token, or OpenAI account is required in the new app. Sideloaded builds can still use manual tracking, but cannot use Play-verified AI.

For initial Wrangler access and deployment:

```powershell
npx wrangler@latest login
npx wrangler@latest deploy
npx wrangler@latest secret put GOOGLE_SERVICE_ACCOUNT_JSON
```

The model can be changed through `OPENAI_MODEL` without rebuilding Reclaim. Requests use structured outputs and `store: false`; OpenAI platform data handling still follows the API account's applicable data-retention policy.

The Worker limits requests to 6 per IP per minute and 30 total per Cloudflare location per minute. Cloudflare rate limits are approximate and location-local, not a global quota or a dollar cap. Keep the OpenAI project hard spend limit and alerts in place; hard-limit enforcement can lag slightly. Never deploy a version that accepts unauthenticated parsing requests.
