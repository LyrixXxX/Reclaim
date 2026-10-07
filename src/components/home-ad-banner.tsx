import mobileAds, { AdsConsent, BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { useAppLock } from '@/state/app-lock-context';
import { useMonetization } from '@/state/monetization-context';
import { TEST_ADS_ENABLED } from '@/lib/monetization';
import { colors } from '@/theme';

export function HomeAdBanner() {
  const { locked, ready } = useAppLock();
  const { adsAllowed: liveAdsAllowed } = useMonetization();
  const adsAllowed = Platform.OS === 'android' && (TEST_ADS_ENABLED || liveAdsAllowed);
  const [consentReady, setConsentReady] = useState(false);
  useEffect(() => {
    if (!adsAllowed || !ready || locked) return;
    let cancelled = false;
    void AdsConsent.gatherConsent().then(async () => {
      const consent = await AdsConsent.getConsentInfo();
      if (!consent.canRequestAds || cancelled) return;
      await mobileAds().initialize();
      if (!cancelled) setConsentReady(true);
    }).catch(() => { if (!cancelled) setConsentReady(false); });
    return () => { cancelled = true; };
  }, [adsAllowed, ready, locked]);

  const unitId = TEST_ADS_ENABLED ? TestIds.ADAPTIVE_BANNER : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID;
  if (!adsAllowed || !consentReady || !unitId || locked || !ready) return null;
  return <View style={styles.container} accessibilityLabel="Advertisement">
    <Text style={styles.label}>{TEST_ADS_ENABLED ? 'TEST AD · NO REVENUE' : 'ADVERTISEMENT'}</Text>
    <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 3 },
  label: { color: colors.textDim, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 2 },
});
