import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { StyleSheet, Text, View } from 'react-native';

import { useAds } from '@/state/ads-context';
import { TEST_ADS_ENABLED } from '@/lib/monetization';
import { colors, font } from '@/theme';

export function HomeAdBanner() {
  const { bannerReady } = useAds();

  const unitId = TEST_ADS_ENABLED ? TestIds.ADAPTIVE_BANNER : process.env.EXPO_PUBLIC_ADMOB_BANNER_ID;
  if (!bannerReady || !unitId) return null;
  return <View style={styles.container} accessibilityLabel="Advertisement">
    {!TEST_ADS_ENABLED && <Text style={styles.label}>ADVERTISEMENT</Text>}
    <BannerAd unitId={unitId} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} requestOptions={{ requestNonPersonalizedAdsOnly: true }} />
  </View>;
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', backgroundColor: colors.background, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 3 },
  label: { color: colors.textDim, fontSize: 11, fontFamily: font.bold, letterSpacing: 1, marginBottom: 2 },
});
