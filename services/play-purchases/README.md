# Reclaim purchase verification

This Cloudflare Worker verifies the non-consumable `remove_ads` product against Google Play's ProductPurchaseV2 API. It stores no purchase tokens. Set `GOOGLE_SERVICE_ACCOUNT_JSON` as a Worker secret (never in the app or repository), grant that service account the least Play Console permission required to verify purchases, and deploy behind HTTPS with Cloudflare rate limiting. Set `EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL` to the deployed Worker URL only after testing it through Play internal testing.

The app keeps ads disabled if this service is unreachable or its response is not valid. Do not enable live monetization until the public privacy policy, AdMob IDs, and Play product are configured and the end-to-end purchase/restore/refund tests pass.
