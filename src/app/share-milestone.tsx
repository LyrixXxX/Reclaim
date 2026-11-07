import { ComponentRef, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useTrackers } from '@/state/tracker-context';
import { formatSavings } from '@/lib/habit-savings';
import { checkpointLabel, cravingsBeaten, featuredQuit, quitSummary, quittingStarts } from '@/lib/quit-progress';
import { trackerDisplayName } from '@/lib/tracker-management';
import { colors, font, layout, radius, type } from '@/theme';

export default function ShareMilestoneScreen() {
  const { tracker: trackerParam } = useLocalSearchParams<{ tracker?: string }>();
  const { trackers, taperSteps = [], cravings = [] } = useTrackers();
  const card = useRef<ComponentRef<typeof View>>(null);
  const [showMoney, setShowMoney] = useState(false);
  const [busy, setBusy] = useState(false);
  // Android sizes percentage-based SVGs wrongly inside captured views, so draw the background at the measured size.
  const [size, setSize] = useState({ width: 0, height: 0 });
  const quit = featuredQuit(quittingStarts(trackers, taperSteps), trackerParam);
  if (!quit?.startedAt) return <View style={styles.screen}><Text style={[styles.lead, { padding: 20 }]}>Start a quit timer to share your progress.</Text></View>;
  const { tracker } = quit;
  const summary = quitSummary(tracker, quit.startedAt, quit.precision);
  const beaten = cravingsBeaten(cravings, tracker.id);
  const name = trackerDisplayName(tracker);
  const reached = (tracker.checkpointDays?.length ? tracker.checkpointDays : [1, 3, 7, 14, 30, 60, 90, 180, 365]).filter((days) => days <= summary.days).pop();

  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing isn’t available on this device.'); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Share ${name} progress` });
    } catch {
      Alert.alert('Couldn’t create the image', 'Please try again.');
    } finally { setBusy(false); }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.lead}>Celebrate it. The image only shows what you see here; nothing else from Reclaim is shared.</Text>

    <View ref={card} collapsable={false} style={styles.card} onLayout={(event) => setSize({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}>
      {size.width > 0 && <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
        <Defs><RadialGradient id="glow" cx={size.width * 0.8} cy={size.height * 0.1} r={Math.max(size.width, size.height) * 0.9} gradientUnits="userSpaceOnUse"><Stop offset="0" stopColor={tracker.color} stopOpacity={0.35} /><Stop offset="1" stopColor={tracker.color} stopOpacity={0} /></RadialGradient></Defs>
        <Rect width={size.width} height={size.height} fill={colors.background} />
        <Rect width={size.width} height={size.height} fill="url(#glow)" />
      </Svg>}
      <View style={styles.brand}><Image source={require('../../assets/images/reclaim-icon.png')} style={styles.logo} resizeMode="contain" /><Text style={styles.brandText}>Reclaim</Text></View>
      <View style={styles.middle}>
        {reached !== undefined && <Text style={[styles.badge, { color: tracker.color, borderColor: `${tracker.color}88` }]}>{checkpointLabel(reached).toUpperCase()} MILESTONE</Text>}
        <Text style={styles.days}>{summary.days.toLocaleString()}</Text>
        <Text style={styles.daysLabel}>{summary.days === 1 ? 'day' : 'days'} free of {name.toLowerCase()}</Text>
      </View>
      <View style={styles.footer}>
        {showMoney && summary.savingsCents > 0 && <View style={styles.fact}><Text style={[styles.factValue, { color: colors.success }]}>{formatSavings(summary.savingsCents)}</Text><Text style={styles.factLabel}>saved</Text></View>}
        {beaten > 0 && <View style={styles.fact}><Text style={styles.factValue}>{beaten}</Text><Text style={styles.factLabel}>{beaten === 1 ? 'craving' : 'cravings'} beaten</Text></View>}
        <View style={styles.fact}><Text style={styles.factValue}>{checkpointLabel(summary.nextDays)}</Text><Text style={styles.factLabel}>next goal</Text></View>
      </View>
    </View>

    {summary.savingsCents > 0 && <View style={styles.option}><Text style={styles.optionText}>Show money saved</Text><Switch value={showMoney} onValueChange={setShowMoney} trackColor={{ true: colors.habitsNav, false: colors.borderStrong }} thumbColor={colors.text} accessibilityLabel="Show money saved" /></View>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void share()} style={[styles.primary, busy && { opacity: 0.6 }]}><Text style={styles.primaryText}>{busy ? 'Preparing…' : 'Share image'}</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 18 },
  lead: { ...type.body, color: colors.textMuted, fontFamily: font.regular },
  card: { aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, padding: 26, justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 30, height: 30 },
  brandText: { color: colors.text, fontSize: 18, fontFamily: font.bold },
  middle: { gap: 4 },
  badge: { alignSelf: 'flex-start', ...type.eyebrow, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 10 },
  days: { color: colors.text, fontSize: 96, lineHeight: 100, letterSpacing: -4, fontFamily: font.extrabold, fontVariant: ['tabular-nums'] },
  daysLabel: { color: colors.text, fontSize: 22, fontFamily: font.semibold },
  footer: { flexDirection: 'row', gap: 22, flexWrap: 'wrap' },
  fact: { gap: 2 },
  factValue: { color: colors.text, fontSize: 18, fontFamily: font.bold },
  factLabel: { color: colors.textMuted, fontSize: 12, fontFamily: font.medium },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionText: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.habitsNav, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
});
