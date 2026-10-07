import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { PRIVACY_SECTIONS, PRIVACY_UPDATED } from '@/lib/privacy-policy';
import { colors, layout, spacing } from '@/theme';

export function PrivacyContent() {
  const publicUrl = process.env.EXPO_PUBLIC_RECLAIM_PRIVACY_URL;
  const supportEmail = process.env.EXPO_PUBLIC_RECLAIM_SUPPORT_EMAIL;
  return <View style={styles.content}>
    <Text style={styles.title}>Privacy & data</Text>
    <Text style={styles.intro}>A plain-language summary of how Reclaim handles your information.</Text>
    {PRIVACY_SECTIONS.map((section) => <View key={section.title} style={styles.card}>
      <Text style={styles.heading}>{section.title}</Text><Text style={styles.body}>{section.body}</Text>
    </View>)}
    {!!publicUrl?.startsWith('https://') && <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(publicUrl); }} style={styles.card}><Text style={styles.heading}>Open the full public privacy policy ↗</Text></Pressable>}
    <Text style={styles.footer}>Updated {PRIVACY_UPDATED}. {supportEmail ? `Privacy questions: ${supportEmail}` : 'A public policy link and contact address are required before release on Google Play.'}</Text>
  </View>;
}

const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 28, fontWeight: '900' },
  intro: { color: colors.textMuted, fontSize: 14, lineHeight: 21, marginTop: 8, marginBottom: 12 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 16, marginTop: 12 },
  heading: { color: colors.text, fontSize: 16, fontWeight: '800' },
  body: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  footer: { color: colors.textDim, fontSize: 11, lineHeight: 17, marginTop: 22 },
});
