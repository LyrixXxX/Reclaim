import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { routeDisplayName } from '@/components/activity-route-details';
import { RouteMapPreview } from '@/components/route-map-preview';
import { RoutePreview } from '@/components/route-preview';
import { readPendingRoute } from '@/lib/activity-recording';
import { rasterMapStyle } from '@/lib/activity-map-style';
import { getMapKey } from '@/lib/activity-maps';
import { routeShareStats } from '@/lib/route-share';
import type { ActivityRoute } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, font, layout, radius, type } from '@/theme';

const MAP_CREDIT = '© Stadia Maps © OpenMapTiles © OpenStreetMap';

export default function ShareRouteScreen() {
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const { activityRoutes = [] } = useTrackers();
  const card = useRef<ComponentRef<typeof View>>(null);
  const saved = activityRoutes.find((item) => item.id === routeId);
  // A route on its "completed" page isn't in the saved list yet.
  const [pending, setPending] = useState<ActivityRoute | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [drawingHeight, setDrawingHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void readPendingRoute().catch(() => null).then((route) => { if (!cancelled) { setPending(route); setLoaded(true); } });
    void getMapKey().then((key) => { if (!cancelled && key) setMapStyle(rasterMapStyle(key)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);
  const route = saved ?? (pending?.id === routeId ? pending : null);
  if (!route) return <View style={styles.screen}>{loaded && <Text style={[styles.lead, { padding: 20 }]}>This route isn’t available to share.</Text>}</View>;

  const name = routeDisplayName(route);
  const hasPath = route.points.length > 1;
  const mapShown = showMap && hasPath && !!mapStyle;
  const share = async () => {
    setBusy(true);
    try {
      const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' });
      if (!(await Sharing.isAvailableAsync())) { Alert.alert('Sharing isn’t available on this device.'); return; }
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `Share ${name}` });
    } catch {
      Alert.alert('Couldn’t create the image', 'Please try again.');
    } finally { setBusy(false); }
  };

  return <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
    <Text style={styles.lead}>The image only shows what you see here; nothing else from Reclaim is shared.</Text>

    <View ref={card} collapsable={false} style={styles.card}>
      <View style={styles.brand}><Image source={require('../../assets/images/reclaim-icon.png')} style={styles.logo} resizeMode="contain" /><Text style={styles.brandText}>Reclaim</Text></View>
      <View style={styles.drawing} onLayout={(event) => setDrawingHeight(event.nativeEvent.layout.height)}>
        {hasPath && drawingHeight > 0 && (mapShown ? <RouteMapPreview points={route.points} mapStyle={mapStyle} height={drawingHeight} /> : <RoutePreview points={route.points} height={drawingHeight} />)}
      </View>
      {mapShown && <Text style={styles.credit}>{MAP_CREDIT}</Text>}
      <View style={styles.heading}>
        <Text style={styles.name} numberOfLines={2}>{name}</Text>
        <Text style={styles.date}>{new Date(route.startedAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
      </View>
      <View style={styles.stats}>
        {routeShareStats(route).map((stat) => <View key={stat.label} style={styles.stat}><Text style={styles.statValue}>{stat.value}</Text><Text style={styles.statLabel}>{stat.label}</Text></View>)}
      </View>
    </View>

    {hasPath && !!mapStyle && <View style={styles.option}>
      <View style={styles.optionWords}>
        <Text style={styles.optionText}>Show map</Text>
        <Text style={styles.optionNote}>A map shows exactly where you went, including where you started. Without it, only the route’s shape is shown.</Text>
      </View>
      <Switch accessibilityLabel="Show map" value={showMap} onValueChange={setShowMap} trackColor={{ true: colors.activityNav, false: colors.borderStrong }} />
    </View>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => void share()} style={[styles.primary, busy && { opacity: 0.6 }]}><Text style={styles.primaryText}>{busy ? 'Preparing…' : 'Share image'}</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: 20, paddingBottom: 48, gap: 18 },
  lead: { ...type.body, color: colors.textMuted, fontFamily: font.regular },
  card: { aspectRatio: 4 / 5, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, padding: 20, gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 28, height: 28 },
  brandText: { color: colors.text, fontSize: 17, fontFamily: font.bold },
  drawing: { flex: 1, minHeight: 0 },
  credit: { color: colors.textMuted, fontSize: 9, fontFamily: font.regular, marginTop: -8 },
  heading: { gap: 2 },
  name: { color: colors.text, fontSize: 24, lineHeight: 29, fontFamily: font.extrabold },
  date: { color: colors.textMuted, fontSize: 13, fontFamily: font.medium },
  stats: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  stat: { width: '50%', gap: 1 },
  statValue: { color: colors.text, fontSize: 18, fontFamily: font.bold },
  statLabel: { color: colors.textMuted, fontSize: 12, fontFamily: font.medium },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  optionWords: { flex: 1, gap: 3 },
  optionText: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  optionNote: { color: colors.textMuted, fontSize: 12, lineHeight: 17, fontFamily: font.regular },
  primary: { minHeight: 52, borderRadius: radius.pill, backgroundColor: colors.activityNav, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: colors.background, fontSize: 16, fontFamily: font.bold },
});
