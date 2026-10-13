import AsyncStorage from '@react-native-async-storage/async-storage';
import mobileAds, { AdEventType, AdsConsent, InterstitialAd, TestIds } from 'react-native-google-mobile-ads';
import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { canShowCompletionAd, recordCompletionAd, type AdFrequency } from '@/lib/ad-frequency';
import { TEST_ADS_ENABLED } from '@/lib/monetization';
import { useAppLock } from '@/state/app-lock-context';
import { useMonetization } from '@/state/monetization-context';

const KEY = 'reclaim-completion-ad-frequency-v1';
const EMPTY: AdFrequency = { day: '', shownAt: [] };
type AdsState = { bannerReady: boolean; completionAdReady: boolean; showCompletionAd: () => Promise<void> };
const Context = createContext<AdsState>({ bannerReady: false, completionAdReady: false, showCompletionAd: async () => undefined });

export function AdsProvider({ children }: { children: ReactNode }) {
  const { locked, ready } = useAppLock();
  const { adsAllowed, adFree } = useMonetization();
  const allowed = Platform.OS === 'android' && !adFree && (TEST_ADS_ENABLED || adsAllowed) && ready && !locked;
  const [initialized, setInitialized] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [historyReady, setHistoryReady] = useState(false);
  const [history, setHistory] = useState<AdFrequency>(EMPTY);
  const historyRef = useRef<AdFrequency>(EMPTY);
  const adRef = useRef<InterstitialAd | null>(null);
  const showingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(KEY).then((raw) => {
      const value = raw ? JSON.parse(raw) as AdFrequency : EMPTY;
      if (!active) return;
      if (typeof value.day !== 'string' || !Array.isArray(value.shownAt) || !value.shownAt.every((item) => typeof item === 'number')) return;
      historyRef.current = value; setHistory(value); setHistoryReady(true);
    }).catch(() => undefined); // Fail closed if frequency history cannot be read.
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!allowed) return;
    let active = true;
    void AdsConsent.gatherConsent().then(async () => {
      const consent = await AdsConsent.getConsentInfo();
      if (!active || !consent.canRequestAds) return;
      await mobileAds().initialize();
      if (active) setInitialized(true);
    }).catch(() => { if (active) setInitialized(false); });
    return () => { active = false; };
  }, [allowed]);

  useEffect(() => {
    const unitId = TEST_ADS_ENABLED ? TestIds.INTERSTITIAL : process.env.EXPO_PUBLIC_ADMOB_INTERSTITIAL_ID;
    if (!allowed || !initialized || !historyReady || !unitId) { adRef.current = null; return; }
    const ad = InterstitialAd.createForAdRequest(unitId, { requestNonPersonalizedAdsOnly: true });
    adRef.current = ad;
    const unsubs = [
      ad.addAdEventListener(AdEventType.LOADED, () => setLoaded(true)),
      ad.addAdEventListener(AdEventType.ERROR, () => setLoaded(false)),
    ];
    ad.load();
    return () => { unsubs.forEach((unsubscribe) => unsubscribe()); if (adRef.current === ad) adRef.current = null; setLoaded(false); };
  }, [allowed, initialized, historyReady]);

  const completionAdReady = allowed && initialized && historyReady && loaded && !!adRef.current && canShowCompletionAd(history);
  const showCompletionAd = useCallback(async () => {
    const ad = adRef.current;
    if (!allowed || !initialized || !historyReady || !loaded || !ad || showingRef.current || !canShowCompletionAd(historyRef.current)) return;
    showingRef.current = true;
    setLoaded(false);
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => { if (finished) return; finished = true; unsubOpened(); unsubClosed(); unsubError(); showingRef.current = false; if (adRef.current === ad && allowed) ad.load(); resolve(); };
      const unsubOpened = ad.addAdEventListener(AdEventType.OPENED, () => {
        const next = recordCompletionAd(historyRef.current);
        historyRef.current = next; setHistory(next);
        void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => { setHistoryReady(false); });
      });
      const unsubClosed = ad.addAdEventListener(AdEventType.CLOSED, finish);
      const unsubError = ad.addAdEventListener(AdEventType.ERROR, finish);
      void ad.show().catch(finish);
    });
  }, [allowed, initialized, historyReady, loaded]);

  return <Context.Provider value={{ bannerReady: allowed && initialized, completionAdReady, showCompletionAd }}>{children}</Context.Provider>;
}

export function useAds() { return useContext(Context); }
