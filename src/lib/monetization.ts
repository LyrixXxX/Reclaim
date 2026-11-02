export const REMOVE_ADS_PRODUCT_ID = 'remove_ads';
export const REMOVE_ADS_PURCHASE_OPTION_ID = 'buy-remove-ads';

type OneTimePurchaseOption = {
  purchaseOptionIdAndroid?: string | null;
  offerTokenAndroid?: string | null;
  displayPrice: string;
};

export function removeAdsPurchaseOption(product: { id: string; discountOffers?: OneTimePurchaseOption[] | null } | undefined) {
  if (product?.id !== REMOVE_ADS_PRODUCT_ID) return undefined;
  return product.discountOffers?.find((offer) => offer.purchaseOptionIdAndroid === REMOVE_ADS_PURCHASE_OPTION_ID && !!offer.offerTokenAndroid);
}

export function showRemoveAdsButton(purchasesEnabled: boolean, entitlementChecked: boolean, adFree: boolean) {
  return purchasesEnabled && entitlementChecked && !adFree;
}
export function adMode(testFlag?: string, liveFlag?: string): 'off' | 'test' | 'live' {
  return testFlag === '1' ? 'test' : liveFlag === '1' ? 'live' : 'off';
}

const mode = adMode(process.env.EXPO_PUBLIC_RECLAIM_TEST_ADS_ENABLED, process.env.EXPO_PUBLIC_RECLAIM_MONETIZATION_ENABLED);
export const TEST_ADS_ENABLED = mode === 'test';

// Keep ads and billing dormant until the public policy and store accounts exist.
export const MONETIZATION_ENABLED = mode === 'live'
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_PRIVACY_URL?.startsWith('https://'))
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL)
  && Boolean(process.env.EXPO_PUBLIC_ADMOB_BANNER_ID)
  && !process.env.EXPO_PUBLIC_ADMOB_BANNER_ID?.startsWith('ca-app-pub-3940256099942544')
  && Boolean(process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID)
  && !process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID?.startsWith('ca-app-pub-3940256099942544')
  && Boolean(process.env.EXPO_PUBLIC_ADMOB_APP_ID)
  && !process.env.EXPO_PUBLIC_ADMOB_APP_ID?.startsWith('ca-app-pub-3940256099942544')
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL?.startsWith('https://'));

// Billing can be tested on a Play track with Google test ads and no live AdMob IDs.
export const PURCHASES_ENABLED = (MONETIZATION_ENABLED || (mode === 'test' && process.env.EXPO_PUBLIC_RECLAIM_PURCHASE_TESTING_ENABLED === '1'))
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_PRIVACY_URL?.startsWith('https://'))
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL)
  && Boolean(process.env.EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL?.startsWith('https://'));

export function hasAdFreePurchase(purchases: readonly { productId: string; purchaseState: string }[]) {
  return purchases.some((purchase) => purchase.productId === REMOVE_ADS_PRODUCT_ID && purchase.purchaseState === 'purchased');
}

type PurchaseVerification = { valid: boolean; acknowledged: boolean };

export async function verifyAdFreePurchaseStatus(purchase: { productId: string; purchaseState: string; purchaseToken?: string | null }): Promise<PurchaseVerification> {
  if (!hasAdFreePurchase([purchase]) || !purchase.purchaseToken) return { valid: false, acknowledged: false };
  const endpoint = process.env.EXPO_PUBLIC_RECLAIM_PURCHASE_VERIFIER_URL;
  if (!endpoint?.startsWith('https://')) throw new Error('Purchase verification is not configured.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ packageName: 'com.greekkid60.reclaim', productId: REMOVE_ADS_PRODUCT_ID, purchaseToken: purchase.purchaseToken }),
  });
  if (!response.ok) throw new Error('Google Play purchase verification is unavailable.');
  const result = await response.json() as { valid?: boolean; acknowledged?: boolean };
  return { valid: result.valid === true, acknowledged: result.valid === true && result.acknowledged === true };
}

export async function verifyAdFreePurchase(purchase: { productId: string; purchaseState: string; purchaseToken?: string | null }): Promise<boolean> {
  return (await verifyAdFreePurchaseStatus(purchase)).valid;
}

export async function confirmAdFreePurchase<T extends { productId: string; purchaseState: string; purchaseToken?: string | null; isAcknowledgedAndroid?: boolean | null }>(
  purchase: T,
  acknowledge: (purchase: T) => Promise<void>,
  verify: (purchase: T) => Promise<boolean | PurchaseVerification> = verifyAdFreePurchaseStatus,
): Promise<{ valid: boolean; acknowledgmentPending: boolean }> {
  if (!hasAdFreePurchase([purchase]) || !purchase.purchaseToken) return { valid: false, acknowledgmentPending: false };
  const verification = await verify(purchase);
  const valid = typeof verification === 'boolean' ? verification : verification.valid;
  if (!valid) return { valid: false, acknowledgmentPending: false };
  if ((typeof verification !== 'boolean' && verification.acknowledged) || purchase.isAcknowledgedAndroid === true) return { valid: true, acknowledgmentPending: false };
  try {
    await acknowledge(purchase);
    return { valid: true, acknowledgmentPending: false };
  } catch {
    // The verified purchase remains entitled; startup, foreground, and Restore retry.
    return { valid: true, acknowledgmentPending: true };
  }
}

export type AdFreeReconciliation =
  | { status: 'verified'; acknowledgmentPending: boolean }
  | { status: 'not-returned' | 'pending' | 'missing-token' | 'rejected' };

/** Inspect only the Remove Ads product. A local Play result never grants entitlement without server verification. */
export async function reconcileAdFreePurchases<T extends { productId: string; purchaseState: string; purchaseToken?: string | null; isAcknowledgedAndroid?: boolean | null }>(
  purchases: readonly T[],
  acknowledge: (purchase: T) => Promise<void>,
  verify: (purchase: T) => Promise<boolean | PurchaseVerification> = verifyAdFreePurchaseStatus,
): Promise<AdFreeReconciliation> {
  const matching = purchases.filter((purchase) => purchase.productId === REMOVE_ADS_PRODUCT_ID);
  if (!matching.length) return { status: 'not-returned' };
  const completed = matching.filter((purchase) => purchase.purchaseState === 'purchased');
  if (!completed.length) return { status: 'pending' };
  const withToken = completed.filter((purchase) => !!purchase.purchaseToken);
  if (!withToken.length) return { status: 'missing-token' };
  for (const purchase of withToken) {
    const result = await confirmAdFreePurchase(purchase, acknowledge, verify);
    if (result.valid) return { status: 'verified', acknowledgmentPending: result.acknowledgmentPending };
  }
  return { status: 'rejected' };
}
