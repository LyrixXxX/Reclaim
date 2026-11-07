import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { PURCHASES_ENABLED, showRemoveAdsButton } from '@/lib/monetization';
import { useMonetization } from '@/state/monetization-context';
import { colors, font } from '@/theme';

export function RemoveAdsButton() {
  const monetization = useMonetization();
  if (!showRemoveAdsButton(PURCHASES_ENABLED, monetization.entitlementChecked, monetization.adFree)) return null;

  const unavailable = !monetization.connected || !monetization.price || monetization.busy;
  return <Pressable
    accessibilityRole="button"
    accessibilityLabel={`Remove ads permanently${monetization.price ? ` for ${monetization.price}` : ''}`}
    disabled={unavailable}
    onPress={() => { void monetization.buy().catch(() => Alert.alert('Purchase unavailable', 'Please try again through Google Play.')); }}
    style={[styles.button, unavailable && styles.disabled]}
  >
    <Image source={require('../../assets/images/remove-ads.png')} style={styles.icon} resizeMode="contain" />
    <View style={styles.copy}>
      <Text style={styles.title}>Remove ads permanently</Text>
      <Text style={styles.price}>{monetization.price ? `One-time purchase · ${monetization.price}` : 'Connecting to Google Play…'}</Text>
    </View>
  </Pressable>;
}

const styles = StyleSheet.create({
  button: { width: '100%', minHeight: 94, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceRaised, borderColor: colors.settingsNav, borderWidth: 1, borderRadius: 16, paddingRight: 14, marginTop: 12 },
  icon: { width: 132, height: 88 },
  copy: { flex: 1, paddingVertical: 12 },
  title: { color: colors.text, fontSize: 14, fontFamily: font.bold },
  price: { color: colors.textMuted, fontSize: 11, fontFamily: font.bold, marginTop: 5 },
  disabled: { opacity: 0.55 },
});
