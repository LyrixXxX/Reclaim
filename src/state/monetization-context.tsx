import { getAvailablePurchases, isUserCancelledError, useIAP } from 'expo-iap';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { MONETIZATION_ENABLED, REMOVE_ADS_PRODUCT_ID, verifyAdFreePurchase } from '@/lib/monetization';

type MonetizationState = {
  adFree: boolean;
  adsAllowed: boolean;
  connected: boolean;
  price?: string;
  error?: string;
  busy: boolean;
  buy: () => Promise<void>;
  restore: () => Promise<'restored' | 'none' | 'unavailable'>;
};

const unavailable: MonetizationState = { adFree: false, adsAllowed: false, connected: false, busy: false, buy: async () => undefined, restore: async () => 'unavailable' };
const Context = createContext<MonetizationState>(unavailable);

export function MonetizationProvider({ children }: { children: ReactNode }) {
  if (!MONETIZATION_ENABLED || Platform.OS !== 'android') return <Context.Provider value={unavailable}>{children}</Context.Provider>;
  return <EnabledMonetizationProvider>{children}</EnabledMonetizationProvider>;
}

function EnabledMonetizationProvider({ children }: { children: ReactNode }) {
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adFree, setAdFree] = useState(false);
  const [error, setError] = useState<string>();
  const iap = useIAP({
    onPurchaseError: (purchaseError) => {
      if (!isUserCancelledError(purchaseError)) setError('The purchase could not be completed. Please try again.');
    },
    onPurchaseSuccess: (purchase) => {
      void verifyAdFreePurchase(purchase).then(async (valid) => {
        if (!valid) { setError('The purchase could not be confirmed yet. Use Restore purchase when connected.'); return; }
        setError(undefined);
        setAdFree(true);
        await iap.finishTransaction({ purchase, isConsumable: false });
      }).catch(() => { setChecked(false); setError('Purchase verification is unavailable. Use Restore purchase when connected.'); });
    },
  });
  const { connected, fetchProducts } = iap;

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    void Promise.all([
      fetchProducts({ skus: [REMOVE_ADS_PRODUCT_ID], type: 'in-app' }),
      verifiedEntitlement(),
    ]).then(([, purchased]) => { if (!cancelled) { setAdFree(purchased); setChecked(true); setError(undefined); } }).catch(() => { if (!cancelled) setChecked(false); });
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void verifiedEntitlement().then((purchased) => { setAdFree(purchased); setChecked(true); }).catch(() => setChecked(false));
    });
    return () => { cancelled = true; subscription.remove(); };
  }, [connected, fetchProducts]);

  const buy = async () => {
    if (!iap.connected || !iap.products.some((product) => product.id === REMOVE_ADS_PRODUCT_ID) || busy) return;
    setBusy(true);
    try { setError(undefined); await iap.requestPurchase({ type: 'in-app', request: { google: { skus: [REMOVE_ADS_PRODUCT_ID] } } }); }
    finally { setBusy(false); }
  };
  const restore = async () => {
    if (!iap.connected) return 'unavailable' as const;
    setBusy(true);
    try {
      const purchased = await verifiedEntitlement();
      setAdFree(purchased);
      setChecked(true);
      setError(undefined);
      return purchased ? 'restored' as const : 'none' as const;
    } catch { setChecked(false); setError('Google Play purchase verification is unavailable. Try again later.'); return 'unavailable' as const; }
    finally { setBusy(false); }
  };
  const price = iap.products.find((product) => product.id === REMOVE_ADS_PRODUCT_ID)?.displayPrice;
  return <Context.Provider value={{ adFree, adsAllowed: connected && checked && !!price && !adFree, connected, price, error, busy, buy, restore }}>{children}</Context.Provider>;
}

export function useMonetization() { return useContext(Context); }

async function verifiedEntitlement() {
  const purchases = await getAvailablePurchases();
  for (const purchase of purchases) if (await verifyAdFreePurchase(purchase)) return true;
  return false;
}
