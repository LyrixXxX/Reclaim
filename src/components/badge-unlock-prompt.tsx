import { Href, router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { BADGE_ACCENTS, badgeImages } from '@/components/badge-art';
import { useTrophyCase } from '@/hooks/use-trophy-case';
import { DEFAULT_PREFERENCES } from '@/lib/preferences';
import { badgeKey, badgeUnlocks, EarnedBadge, trophyCaseHref } from '@/lib/trophy-case';
import { useTrackers } from '@/state/tracker-context';
import { colors, font, layout } from '@/theme';

/** Celebrates a newly earned badge once, wherever you are in the app. Waits behind the app lock. */
export function BadgeUnlockPrompt({ active }: { active: boolean }) {
  const { hydrated, preferences = DEFAULT_PREFERENCES, markBadgesSeen } = useTrackers();
  const { list, earned, ready } = useTrophyCase();
  const seen = preferences.seenBadges;
  const unlocks = useMemo(() => badgeUnlocks(list, seen), [list, seen]);
  const quietKeys = unlocks.markSeen.join();
  const usable = hydrated && ready;
  useEffect(() => {
    if (usable && (seen === undefined || quietKeys)) markBadgesSeen(quietKeys ? quietKeys.split(',') : []);
  }, [usable, seen, quietKeys, markBadgesSeen]);

  const badge = usable && active && preferences.visibleSections.goals ? unlocks.show[0] : undefined;
  if (!badge) return null;
  // Everything this habit earned up to now is covered by the biggest one, so none of it comes up again.
  const close = () => markBadgesSeen(earned.filter((item) => item.tracker.id === badge.tracker.id && item.days <= badge.days).map((item) => badgeKey(item.tracker.id, item.days)));
  return <UnlockCard key={badgeKey(badge.tracker.id, badge.days)} badge={badge} onClose={close} />;
}

function UnlockCard({ badge, onClose }: { badge: EarnedBadge; onClose: () => void }) {
  const card = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const [scale] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 70, useNativeDriver: true }).start();
  }, [scale]);
  const accent = BADGE_ACCENTS[badge.index];
  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing isn’t available on this device.'); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Share ${badge.name} badge` });
    } catch {
      Alert.alert('Couldn’t create the image', 'Please try again.');
    } finally { setBusy(false); }
  };
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View ref={card} collapsable={false} style={[styles.card, { borderColor: accent }]}>
        <View style={styles.brand}><Image source={require('../../assets/images/reclaim-icon.png')} style={styles.logo} resizeMode="contain" accessible={false} /><Text style={styles.brandText}>Reclaim</Text></View>
        <Text style={[styles.eyebrow, { color: accent }]}>BADGE UNLOCKED</Text>
        <Animated.Image source={badgeImages(badge.tracker)[badge.index]} resizeMode="contain" style={[styles.image, { transform: [{ scale }] }]} accessibilityLabel={`${badge.label} badge`} />
        <Text accessibilityRole="header" style={styles.title}>{badge.label}</Text>
        <Text style={styles.subtitle}>{badge.subtitle}</Text>
        <Text style={styles.name}>{badge.name}</Text>
      </View>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onClose} style={[styles.primary, { backgroundColor: accent }]}><Text style={styles.primaryText}>Nice</Text></Pressable>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" onPress={() => { onClose(); router.push(trophyCaseHref(badge.tracker) as Href); }} style={styles.secondary}><Text style={styles.secondaryText}>Trophy case</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => void share()} style={[styles.secondary, busy && { opacity: 0.6 }]}><Text style={styles.secondaryText}>Share</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000D', justifyContent: 'center', padding: 24, gap: 14 },
  card: { backgroundColor: colors.surface, borderWidth: 1, borderRadius: layout.radius, alignItems: 'center', padding: 22 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  logo: { width: 22, height: 22 },
  brandText: { color: colors.textMuted, fontSize: 13, fontFamily: font.bold },
  eyebrow: { fontSize: 12, fontFamily: font.extrabold, letterSpacing: 1.5 },
  image: { width: 220, height: 240, marginVertical: 8 },
  title: { color: colors.text, fontSize: 30, fontFamily: font.extrabold },
  subtitle: { color: colors.textMuted, fontSize: 15, fontFamily: font.medium, marginTop: 2 },
  name: { color: colors.text, fontSize: 16, fontFamily: font.bold, marginTop: 10, textAlign: 'center' },
  actions: { gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  primary: { borderRadius: 14, padding: 15, alignItems: 'center' },
  primaryText: { color: colors.background, fontSize: 16, fontFamily: font.extrabold },
  secondary: { flex: 1, backgroundColor: colors.surfaceRaised, borderRadius: 14, padding: 14, alignItems: 'center' },
  secondaryText: { color: colors.text, fontSize: 14, fontFamily: font.semibold },
});
