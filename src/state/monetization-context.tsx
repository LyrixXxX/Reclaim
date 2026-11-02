import { ErrorCode, getAvailablePurchases, isUserCancelledError, useIAP } from 'expo-iap';
import { createContext, ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { confirmAdFreePurchase, PURCHASES_ENABLED, reconcileAdFreePurchases, REMOVE_ADS_PRODUCT_ID, removeAdsPurchaseOption, type AdFreeReconciliation } from '@/lib/monetization';

const ACKNOWLEDGMENT_WARNING = 'Purchase verified, but Google Play acknowledgment is pending. Reclaim will retry when you reopen the app or Restore purchase.';
type RestoreResult = AdFreeReconciliation['status'] | 'play-unavailable' | 'verification-unavailable';

function purchaseCheckMessage(status: RestoreResult): string | undefined {
  switch (status) {
    case 'verified': return undefined;
    case 'not-returned': return 'Google Play did not return a Remove Ads purchase to Reclaim. If Play says you own it, try Restore purchase again shortly.';
    case 'pending': return 'Google Play returned a pending Remove Ads purchase. It cannot be restored until Play completes it.';
    case 'missing-token': return 'Google Play returned Remove Ads without a verification token. Try again after reconnecting to Play.';
    case 'rejected': return 'Google Play returned Remove Ads, but the verification service did not confirm it. Please try again later.';
    case 'play-unavailable': return 'Reclaim could not query Google Play purchases. Check your Play connection and try again.';
    case 'verification-unavailable': return 'Google Play returned a purchase, but Reclaim could not reach the verification service. Try again later.';
  }
}

type MonetizationState = {
  adFree: boolean;
  adsAllowed: boolean;
  entitlementChecked: boolean;
  connected: boolean;
  price?: string;
  error?: string;
  busy: boolean;
  buy: () => Promise<void>;
  restore: () => Promise<RestoreResult>;
};

const unavailable: MonetizationState = { adFree: false, adsAllowed: false, entitlementChecked: true, connected: false, busy: false, buy: async () => undefined, restore: async () => 'play-unavailable' };
const Context = createContext<MonetizationState>(unavailable);

export function MonetizationProvider({ children }: { children: ReactNode }) {
  if (!PURCHASES_ENABLED || Platform.OS !== 'android') return <Context.Provider value={unavailable}>{children}</Context.Provider>;
  return <EnabledMonetizationProvider>{children}</EnabledMonetizationProvider>;
}

function EnabledMonetizationProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adFree, setAdFree] = useState(false);
  const [error, setError] = useState<string>();
  const checkGeneration = useRef(0);
  const iap = useIAP({
    onPurchaseError: (purchaseError) => {
      if (purchaseError.code === ErrorCode.AlreadyOwned) {
        setChecked(false);
        setError('Google Play says you already own Remove Ads. Use Restore purchase to verify it.');
        return;
      }
      if (!isUserCancelledError(purchaseError)) setError('The purchase could not be completed. Please try again.');
    },
    onPurchaseSuccess: (purchase) => {
      const generation = ++checkGeneration.current;
      void confirmAdFreePurchase(purchase, (verified) => iap.finishTransaction({ purchase: verified, isConsumable: false })).then(({ valid, acknowledgmentPending }) => {
        if (generation !== checkGeneration.current) return;
        if (!valid) {
          setChecked(false);
          setError('The purchase could not be confirmed yet. Use Restore purchase when connected.');
          return;
        }
        ++checkGeneration.current;
        setError(acknowledgmentPending ? ACKNOWLEDGMENT_WARNING : undefined);
        setAdFree(true);
        setChecked(true);
      }).catch(() => {
        if (generation !== checkGeneration.current) return;
        setChecked(false);
        setError('Purchase verification is unavailable. Use Restore purchase when connected.');
      });
    },
  });
  const { connected, fetchProducts, finishTransaction } = iap;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void fetchProducts({ skus: [REMOVE_ADS_PRODUCT_ID], type: 'in-app' }).catch(() => {
      if (!cancelled) setError('Google Play could not load the Remove Ads price. Please try again later.');
    });
    const refreshEntitlement = () => {
      const generation = ++checkGeneration.current;
      void verifiedEntitlement((purchase) => finishTransaction({ purchase, isConsumable: false })).then((result) => {
        if (cancelled || generation !== checkGeneration.current) return;
        if (result.status === 'verified') {
          setAdFree(true);
          setChecked(true);
          setError(result.acknowledgmentPending ? ACKNOWLEDGMENT_WARNING : undefined);
        } else {
          if (result.status !== 'not-returned') setAdFree(false);
          setChecked(result.status === 'not-returned');
          setError(result.status === 'not-returned' ? undefined : purchaseCheckMessage(result.status));
        }
      });
    };
    refreshEntitlement();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshEntitlement();
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [connected, fetchProducts, finishTransaction]);

  const buy = async () => {
    if (!iap.connected || busy) return;
    const product = iap.products.find((candidate) => candidate.id === REMOVE_ADS_PRODUCT_ID);
    const option = product?.platform === 'android' ? removeAdsPurchaseOption(product) : undefined;
    if (!option?.offerTokenAndroid) {
      setError('The Remove Ads purchase option is unavailable in Google Play. Please try again later.');
      return;
    }
    setBusy(true);
    try { setError(undefined); await iap.requestPurchase({ type: 'in-app', request: { google: { skus: [REMOVE_ADS_PRODUCT_ID], offerToken: option.offerTokenAndroid } } }); }
    catch (cause) {
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === ErrorCode.AlreadyOwned) {
        const result = await restore();
        if (result === 'not-returned') {
          setChecked(false);
          setError('Google Play says you own Remove Ads but did not return the purchase to Reclaim. Please retry Restore purchase shortly.');
        }
        return;
      }
      throw cause;
    }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (!iap.connected) return 'play-unavailable' as const;
    const generation = ++checkGeneration.current;
    setBusy(true);
    try {
      const result = await verifiedEntitlement((purchase) => iap.finishTransaction({ purchase, isConsumable: false }));
      if (generation !== checkGeneration.current) return result.status;
      if (result.status === 'verified') {
        ++checkGeneration.current;
        setAdFree(true);
        setChecked(true);
        setError(result.acknowledgmentPending ? ACKNOWLEDGMENT_WARNING : undefined);
      } else {
        if (result.status !== 'not-returned') setAdFree(false);
        setChecked(result.status === 'not-returned');
        setError(purchaseCheckMessage(result.status));
      }
      return result.status;
    }
    finally { setBusy(false); }
  };
  const product = iap.products.find((candidate) => candidate.id === REMOVE_ADS_PRODUCT_ID);
  const price = product?.platform === 'android' ? removeAdsPurchaseOption(product)?.displayPrice : undefined;
  return <Context.Provider value={{ adFree, adsAllowed: connected && checked && !!price && !adFree, entitlementChecked: connected && checked, connected, price, error, busy, buy, restore }}>{children}</Context.Provider>;
}

export function useMonetization() { return useContext(Context); }

async function verifiedEntitlement(acknowledge: (purchase: Awaited<ReturnType<typeof getAvailablePurchases>>[number]) => Promise<void>): Promise<AdFreeReconciliation | { status: 'play-unavailable' | 'verification-unavailable' }> {
  let purchases: Awaited<ReturnType<typeof getAvailablePurchases>>;
  try { purchases = await getAvailablePurchases(); }
  catch { return { status: 'play-unavailable' }; }
  try { return await reconcileAdFreePurchases(purchases, acknowledge); }
  catch { return { status: 'verification-unavailable' }; }
}
