import { Href, router } from 'expo-router';
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ActivityRouteDetails, routeDisplayName } from '@/components/activity-route-details';
import { HistoryPages } from '@/components/history-pages';
import { RouteMapPreview } from '@/components/route-map-preview';
import { activityDurationMs, averagePaceMinPerMile, routeMovingDurationMs } from '@/lib/activity';
import { rasterMapStyle } from '@/lib/activity-map-style';
import { getMapKey } from '@/lib/activity-maps';
import { formatMiles } from '@/lib/activity-units';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

export default function SavedRoutesScreen() {
  const { activityRoutes = [], saveActivityRoute, deleteActivityRoute } = useTrackers();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getMapKey().then((key) => { if (!cancelled && key) setMapStyle(rasterMapStyle(key)); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const editingRoute = activityRoutes.find((route) => route.id === editingId) ?? null;
  const routes = [...activityRoutes].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content}>
    {!routes.length && <Text style={styles.empty}>No routes saved yet. Finished routes will appear here.</Text>}
    <HistoryPages items={routes} pageSize={5}>{(page) => page.map((route) => {
      const duration = activityDurationMs(route);
      const movingMs = routeMovingDurationMs(route);
      const pace = averagePaceMinPerMile(route.distanceMeters, movingMs ?? duration);
      const paceSeconds = pace === null ? null : Math.round(pace * 60);
      const seconds = Math.floor(Math.max(0, duration) / 1000);
      const durationLabel = `${Math.floor(seconds / 3600)}h ${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
      const paceLabel = paceSeconds === null ? '—' : `${Math.floor(paceSeconds / 60)}:${String(paceSeconds % 60).padStart(2, '0')} /mi`;
      return <View key={route.id} style={styles.route}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Show ${routeDisplayName(route)} on the map`} onPress={() => router.push(`/activity-map?routeId=${encodeURIComponent(route.id)}` as Href)}>
          <RouteMapPreview points={route.points} mapStyle={mapStyle} />
          <Text style={styles.name}>{routeDisplayName(route)}</Text>
          <Text style={styles.date}>{new Date(route.startedAt).toLocaleString(undefined, { hour12: true })}</Text>
          <Text style={styles.stats}>{formatMiles(route.distanceMeters)} · {durationLabel} elapsed · {movingMs == null ? 'Moving time unavailable' : `${Math.round(movingMs / 60_000)} min moving`} · {paceLabel} {movingMs == null ? 'overall pace' : 'moving pace'}{route.estimatedCalories != null ? ` · Estimated ${route.estimatedCalories} kcal` : ''}</Text>
          {route.notes && <Text style={styles.notes} numberOfLines={2}>{route.notes}</Text>}
          <Text style={styles.open}>View on map ›</Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setEditingId(route.id)} style={styles.action}><Text style={styles.actionText}>Edit details</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => Alert.alert('Delete this route?', 'This removes the saved route and its GPS points from Reclaim.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteActivityRoute(route.id) }])} style={styles.action}><Text style={styles.deleteText}>Delete</Text></Pressable>
        </View>
      </View>;
    })}</HistoryPages>
  </ScrollView><ActivityRouteDetails route={editingRoute} onClose={() => setEditingId(null)} onSave={saveActivityRoute} /></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60 },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  route: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 18, padding: 14, marginBottom: 12 },
  name: { color: colors.text, fontSize: 18, fontWeight: '600', marginTop: 12 },
  date: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  stats: { color: colors.textMuted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  notes: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: 8 },
  open: { color: colors.activityNav, fontSize: 12, fontWeight: '600', marginTop: 9 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  action: { flex: 1, padding: 12, alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
  actionText: { color: colors.text, fontWeight: '700' },
  deleteText: { color: colors.danger, fontWeight: '700' },
});
