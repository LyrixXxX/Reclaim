import { ComponentRef, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Href, router } from 'expo-router';
import Svg, { Path } from 'react-native-svg';

import { Chevron } from '@/components/icon';
import type { HomeNotification } from '@/lib/home-notifications';
import { colors, font, radius } from '@/theme';

const EDGE = 12;

/** A bell on Home with a count; opens a sheet listing what needs doing and what's worth celebrating. */
export function NotificationBell({ notes, onDismiss }: { notes: HomeNotification[]; onDismiss: (id: string) => void }) {
  const [anchor, setAnchor] = useState<{ top: number; caretRight: number }>();
  const open = !!anchor;
  const bellRef = useRef<ComponentRef<typeof Pressable>>(null);
  const { width } = useWindowDimensions();
  const setOpen = (next: boolean) => {
    if (!next) { setAnchor(undefined); return; }
    // Drop the tray down from the bell itself.
    // The panel keeps a 12pt margin from the screen edge; the pointer sits under the bell.
    bellRef.current?.measureInWindow((x: number, y: number, w: number, h: number) => setAnchor({ top: y + h + 8, caretRight: Math.max(16, width - (x + w / 2)) - EDGE - 8 }));
  };
  const count = notes.length;
  const urgent = notes.some((note) => note.kind === 'action');
  const go = (href: string) => { setOpen(false); setTimeout(() => router.push(href as Href), 150); };
  const actions = notes.filter((note) => note.kind === 'action');
  const celebrations = notes.filter((note) => note.kind === 'celebration');

  return <>
    <Pressable ref={bellRef} accessibilityRole="button" accessibilityLabel={count ? `Notifications, ${count} new` : 'Notifications, none'} onPress={() => setOpen(true)} style={styles.bell}>
      <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <Path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </Svg>
      {count > 0 && <View style={[styles.badge, { backgroundColor: urgent ? colors.danger : colors.accent }]}><Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text></View>}
    </Pressable>
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close notifications" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} />
        <View style={[styles.sheet, anchor && { top: anchor.top, right: EDGE, width: Math.min(360, width - EDGE * 2) }]}>
          <View style={[styles.caret, { right: anchor?.caretRight ?? 14 }]} />
          <Text style={styles.title}>Notifications</Text>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {!count && <Text style={styles.empty}>You’re all caught up.</Text>}
            {actions.length > 0 && <Text style={styles.group}>To do</Text>}
            {actions.map((note) => <Row key={note.id} note={note} onPress={() => go(note.href)} />)}
            {celebrations.length > 0 && <Text style={styles.group}>Milestones</Text>}
            {celebrations.map((note) => <Row key={note.id} note={note} onPress={() => go(note.href)} onDismiss={() => onDismiss(note.id)} />)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

function Row({ note, onPress, onDismiss }: { note: HomeNotification; onPress: () => void; onDismiss?: () => void }) {
  return <View style={styles.row}>
    <View style={[styles.dot, { backgroundColor: note.kind === 'action' ? colors.danger : colors.accent }]} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${note.title}. ${note.detail}`} onPress={onPress} style={styles.rowMain}>
      <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{note.title}</Text><Text style={styles.rowDetail}>{note.detail}</Text></View>
      <Chevron size={18} color={colors.textMuted} />
    </Pressable>
    {onDismiss && <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${note.title}`} hitSlop={8} onPress={onDismiss} style={styles.clear}><Text style={styles.clearText}>×</Text></Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  bell: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.background },
  badgeText: { color: colors.background, fontSize: 10, fontFamily: font.extrabold },
  overlay: { flex: 1, backgroundColor: '#0007' },
  sheet: { position: 'absolute', backgroundColor: colors.surfaceRaised, borderRadius: 20, borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 18, elevation: 12 },
  caret: { position: 'absolute', top: -7, width: 14, height: 14, backgroundColor: colors.surfaceRaised, borderLeftWidth: 1, borderTopWidth: 1, borderColor: colors.borderStrong, transform: [{ rotate: '45deg' }] },
  title: { color: colors.text, fontSize: 20, fontFamily: font.bold, marginBottom: 6 },
  group: { color: colors.textMuted, fontSize: 12, fontFamily: font.bold, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 2 },
  empty: { color: colors.textMuted, fontSize: 15, fontFamily: font.medium, paddingVertical: 24, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  dot: { width: 8, height: 8, borderRadius: 4 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 13 },
  rowTitle: { color: colors.text, fontSize: 15, fontFamily: font.bold },
  rowDetail: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 2 },
  clear: { width: 32, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: colors.textMuted, fontSize: 22, fontFamily: font.regular, marginTop: -2 },
});
