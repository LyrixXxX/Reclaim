import { Camera, GeoJSONSource, Layer, Map, type StyleSpecification } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '@/components/header';
import { RoutePreview } from '@/components/route-preview';
import { activeRouteDurationMs, activityDurationMs, averagePaceMinPerMile, estimatedRouteCalories, latestRouteWeightKg, routeDistanceMeters } from '@/lib/activity';
import { formatMiles } from '@/lib/activity-units';
import { getMapKey, loadMapStyle } from '@/lib/activity-maps';
import { localDateKey } from '@/lib/progress';
import { clearFinishedRoute, finishRoute, isRouteRecording, pauseRoute, readActiveRoute, readPendingRoute, resumeRoute, startRoute, ActiveRoute } from '@/lib/activity-recording';
import { ActivityPoint, ActivityRoute } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

type MapCamera = React.ComponentRef<typeof Camera>;
export default function ActivityMapScreen() {
  const { activityRoutes = [], weightEntries = [], saveActivityRoute } = useTrackers();
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const [kind, setKind] = useState<'walk' | 'hike' | 'run'>('walk');
  const [pending, setPending] = useState<ActivityRoute | null>(null);
  const [routeName, setRouteName] = useState('');
  const [routeNotes, setRouteNotes] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const [active, setActive] = useState<ActiveRoute | null>(null);
  const [recording, setRecording] = useState(false);
  const [mapPermissionRefresh, setMapPermissionRefresh] = useState(0);
  const [key, setKey] = useState('');
  const [style, setStyle] = useState<StyleSpecification | null>(null);
  const [mapError, setMapError] = useState('');
  const [mapLoading, setMapLoading] = useState(true);
  const [center, setCenter] = useState<[number, number] | null>(null);
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [locationMessage, setLocationMessage] = useState('Finding your location…');
  const cameraRef = useRef<MapCamera>(null);
  const followingRef = useRef(true);
  const handledRouteId = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [weightPrompt, setWeightPrompt] = useState(false);
  const [locationDisclosure, setLocationDisclosure] = useState(false);
  const [routeWeightKg, setRouteWeightKg] = useState<number | undefined>();
  const [weightDraft, setWeightDraft] = useState('');
  const [weightUnit, setWeightUnit] = useState<'lb' | 'kg'>('lb');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const stored = await readActiveRoute().catch(() => null);
    setActive(stored?.endedAt ? null : stored);
    const savedPending = stored?.endedAt ? await readPendingRoute().catch(() => null) : null;
    setPending((current) => current?.id === savedPending?.id ? current : savedPending);
    setRecording(await isRouteRecording().catch(() => false));
  }, []);
  useFocusEffect(useCallback(() => {
    if (mapPermissionRefresh > 0) setLocationMessage('Finding your location…');
    void getMapKey().then((value) => { if (!cancelled) { setKey(value); if (!value) setMapLoading(false); } }).catch(() => { if (!cancelled) { setMapError('Map configuration could not be read.'); setMapLoading(false); } });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    let locationSubscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    void (async () => {
      const permission = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (!permission.granted) { setLocationMessage('Start a route or tap Re-Center to allow location.'); return; }
      const initial = await Location.getLastKnownPositionAsync().catch(() => null);
      if (initial && !cancelled) {
        const coordinate: [number, number] = [initial.coords.longitude, initial.coords.latitude];
        setPosition(coordinate);
        setCenter((previous) => previous ?? coordinate);
      }
      locationSubscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 }, (location) => {
        if (cancelled) return;
        const coordinate: [number, number] = [location.coords.longitude, location.coords.latitude];
        setPosition(coordinate);
        setCenter((previous) => previous ?? coordinate);
        setLocationMessage('');
        if (followingRef.current) cameraRef.current?.easeTo({ center: coordinate, duration: 400 });
      });
      if (cancelled) locationSubscription.remove();
    })().catch(() => { if (!cancelled) setLocationMessage('Could not get your location. Tap Re-Center to try again.'); });
    const subscription = AppState.addEventListener('change', (status) => { if (status === 'active') void refresh(); });
    return () => { cancelled = true; clearInterval(timer); clearInterval(clockTimer); subscription.remove(); locationSubscription?.remove(); };
  }, [refresh, mapPermissionRefresh]));
  const withBusy = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); await refresh(); }
    catch (error) { Alert.alert('Activity', error instanceof Error ? error.message : 'This action could not be completed.'); }
    finally { setBusy(false); }
  };
  const begin = () => {
    const localDate = localDateKey(new Date());
    const savedWeight = latestRouteWeightKg(weightEntries, localDate);
    if (savedWeight) {
      setRouteWeightKg(savedWeight);
      setLocationDisclosure(true);
    } else setWeightPrompt(true);
  };
  const beginWithEnteredWeight = () => {
    const value = Number(weightDraft);
    if (!Number.isFinite(value) || value <= 0 || value > (weightUnit === 'lb' ? 1400 : 635)) { Alert.alert('Enter a valid weight', 'Weight is used only for this route’s calorie estimate.'); return; }
    setWeightPrompt(false);
    setRouteWeightKg(weightUnit === 'lb' ? value * 0.45359237 : value);
    setLocationDisclosure(true);
  };
  const beginAfterDisclosure = () => {
    setLocationDisclosure(false);
    void withBusy(async () => { setSelected(null); await startRoute(kind, routeWeightKg); setMapPermissionRefresh((value) => value + 1); });
  };
  const finish = () => Alert.alert('Finish route?', 'This stops GPS recording and opens the route summary.', [
    { text: 'Keep recording', style: 'cancel' },
    { text: 'Finish', onPress: () => void withBusy(async () => { const route = await finishRoute(); setPending(route); setRouteName(''); setRouteNotes(''); }) },
  ]);
  const savePending = () => void withBusy(async () => {
    if (!pending) return;
    await saveActivityRoute({ ...pending, name: routeName.trim().slice(0, 120) || undefined, notes: routeNotes.trim().slice(0, 2000) || undefined });
    await clearFinishedRoute();
    setPending(null);
  });
  const discardPending = () => Alert.alert('Discard this route?', 'This permanently removes its GPS path and stats.', [
    { text: 'Keep route', style: 'cancel' },
    { text: 'Discard', style: 'destructive', onPress: () => void withBusy(async () => { await clearFinishedRoute(); setPending(null); }) },
  ]);
  const findPosition = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('Allow location to center the map.');
    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const coordinate: [number, number] = [location.coords.longitude, location.coords.latitude];
    setCenter(coordinate);
    setPosition(coordinate);
    setLocationMessage('');
    return location.coords;
  };
  const recenter = () => void withBusy(async () => {
    const location: [number, number] = position || await findPosition().then((coords): [number, number] => [coords.longitude, coords.latitude]);
    followingRef.current = true;
    setSelected(null);
    cameraRef.current?.easeTo({ center: location, zoom: 15, duration: 500 });
  });
  const retryMap = () => void (async () => {
    if (!key || !mapCenter) return;
    setMapError(''); setMapLoading(true);
    try { setStyle(await loadMapStyle(key, mapCenter[0], mapCenter[1])); }
    catch (error) { setMapError(error instanceof Error ? error.message : 'Map imagery could not load.'); }
    finally { setMapLoading(false); }
  })();
  const selectedRoute = activityRoutes.find((route) => route.id === selected);
  const selectedDuration = selectedRoute ? activityDurationMs(selectedRoute) : 0;
  const selectedPace = selectedRoute ? averagePaceMinPerMile(selectedRoute.distanceMeters, selectedDuration) : null;
  useEffect(() => {
    if (!routeId || routeId === handledRouteId.current || !activityRoutes.some((route) => route.id === routeId)) return;
    handledRouteId.current = routeId;
    setSelected(routeId);
    followingRef.current = false;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [routeId, activityRoutes]);
  useEffect(() => {
    if (!selectedRoute?.points.length || !style) return;
    const timer = setTimeout(() => {
      const { west, south, east, north } = selectedRoute.points.reduce((bounds, point) => ({
        west: Math.min(bounds.west, point.longitude), south: Math.min(bounds.south, point.latitude),
        east: Math.max(bounds.east, point.longitude), north: Math.max(bounds.north, point.latitude),
      }), { west: 180, south: 90, east: -180, north: -90 });
      cameraRef.current?.fitBounds([west, south, east, north], { padding: { top: 32, right: 32, bottom: 32, left: 32 }, duration: 400 });
    }, 350);
    return () => clearTimeout(timer);
  }, [selectedRoute, style]);
  const points = selectedRoute?.points ?? pending?.points ?? active?.points ?? [];
  const mapCenter = selectedRoute?.points.length ? [selectedRoute.points[0].longitude, selectedRoute.points[0].latitude] as [number, number] : (center ?? position ?? (points.length ? [points.at(-1)!.longitude, points.at(-1)!.latitude] as [number, number] : null));
  const mapLongitude = mapCenter?.[0];
  const mapLatitude = mapCenter?.[1];
  useEffect(() => {
    if (!key || mapLongitude === undefined || mapLatitude === undefined) return;
    let cancelled = false;
    void loadMapStyle(key, mapLongitude, mapLatitude).then((loaded) => { if (!cancelled) { setStyle(loaded); setMapError(''); } }).catch((error: unknown) => { if (!cancelled) setMapError(error instanceof Error ? error.message : 'Map imagery could not load.'); }).finally(() => { if (!cancelled) setMapLoading(false); });
    return () => { cancelled = true; };
  }, [key, mapLongitude, mapLatitude]);
  const line = routeGeoJSON(points);
  const currentPoint = position && { type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: position } };
  const activeDistance = active ? routeDistanceMeters(active.points) : 0;
  const activeDuration = active && now ? activeRouteDurationMs(active, now) : 0;
  const activePace = averagePaceMinPerMile(activeDistance, activeDuration);
  const activeCalories = active ? estimatedRouteCalories(activeDistance, activeDuration, active.estimateWeightKg, active.kind) : null;
  const routeStatus = active?.pausedAt ? 'Paused' : recording ? 'Recording…' : 'Interrupted';
  const gpsStatus = !position ? 'Finding signal' : active?.pausedAt ? 'Paused' : recording ? 'Tracking' : 'Needs attention';
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView ref={scrollRef} nestedScrollEnabled contentContainerStyle={styles.content}>
    <Header />
    {pending ? <View style={styles.card}><Text style={styles.cardTitle}>Route completed 🎉</Text><Text style={styles.body}>{new Date(pending.endedAt).toLocaleString(undefined, { hour12: true })}</Text><RoutePreview points={pending.points} /><View style={styles.metrics}><Metric label="Distance" value={formatMiles(pending.distanceMeters)} /><Metric label="Active time" value={formatDuration(Math.max(0, Date.parse(pending.endedAt) - Date.parse(pending.startedAt) - pending.pausedMs))} /><Metric label="Est. calories" value={pending.estimatedCalories == null ? '—' : `${pending.estimatedCalories} kcal`} /></View><Text style={styles.body}>Route name</Text><TextInput accessibilityLabel="Route name" value={routeName} onChangeText={setRouteName} maxLength={120} placeholder={pending.kind === 'route' ? 'Route' : pending.kind} placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.body}>Activity type</Text><View style={styles.row}>{(['walk', 'hike', 'run'] as const).map((choice) => <Pressable key={choice} onPress={() => setPending({ ...pending, kind: choice, estimatedCalories: estimatedRouteCalories(pending.distanceMeters, Math.max(0, Date.parse(pending.endedAt) - Date.parse(pending.startedAt) - pending.pausedMs), pending.estimateWeightKg, choice) ?? undefined })} style={[styles.smallButton, pending.kind === choice && styles.selected]}><Text style={styles.buttonText}>{choice.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.body}>Notes (optional)</Text><TextInput accessibilityLabel="Route notes" value={routeNotes} onChangeText={setRouteNotes} maxLength={2000} multiline placeholder="Anything you want to remember" placeholderTextColor={colors.textDim} style={[styles.input, { minHeight: 80 }]} /><View style={styles.row}><View style={{ flex: 1 }}><Button label="Save route" onPress={savePending} /></View><View style={{ flex: 1 }}><Button label="Discard" onPress={discardPending} secondary /></View></View></View> : null}
    {!pending && <View style={active ? styles.recordingShell : styles.idleShell}>
    {active ? <View style={styles.recordingCard}><View style={styles.recordingHeader}><Text style={styles.cardTitle}>{active.pausedAt ? 'Route paused' : 'Recording route'}</Text><Text style={[styles.recordingStatus, (active.pausedAt || !recording) && styles.statusWarning]}>● {routeStatus}</Text></View><Text accessibilityLabel={`Active time ${formatDuration(activeDuration)}`} style={styles.timer}>{formatClock(activeDuration)}</Text><Text style={styles.timerCaption}>Active time · {active.kind.toUpperCase()}</Text><View style={styles.recordingMetrics}><Metric compact label="Distance" value={formatMiles(activeDistance)} /><Metric compact label="Pace" value={formatPace(activePace)} /><Metric compact label="Est. calories" value={activeCalories === null ? '—' : `${activeCalories} kcal`} /></View></View> : !pending && !selectedRoute ? <View style={styles.card}><Text style={styles.cardTitle}>Track an activity</Text><Text style={styles.body}>Choose an activity, then start your route.</Text><View style={styles.row}>{(['walk', 'hike', 'run'] as const).map((choice) => <Pressable key={choice} accessibilityRole="button" onPress={() => setKind(choice)} style={[styles.smallButton, kind === choice && styles.selected]}><Text style={styles.buttonText}>{choice.toUpperCase()}</Text></Pressable>)}</View></View> : null}
    {!pending && <View style={[styles.fullMap, active && styles.recordingMap]}>
      {style && mapCenter && !mapError ? <Map style={styles.map} mapStyle={style} dragPan touchZoom doubleTapZoom onDidFailLoadingMap={() => setMapError('Map imagery could not load. Check your connection or Stadia Maps access, then retry.')} onRegionWillChange={(event) => { if (event.nativeEvent.userInteraction) followingRef.current = false; }}><Camera ref={cameraRef} initialViewState={{ center: mapCenter, zoom: 15 }} />{line && <GeoJSONSource id="activity-route" data={line}><Layer id="activity-line" type="line" paint={{ 'line-color': colors.activityNav, 'line-width': 4 }} /></GeoJSONSource>}{currentPoint && <GeoJSONSource id="activity-position" data={currentPoint}><Layer id="activity-position-dot" type="circle" paint={{ 'circle-color': colors.activityNav, 'circle-radius': 7, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} /></GeoJSONSource>}</Map> : <View style={styles.mapEmpty}><Text style={styles.body}>{mapError || (mapLoading ? 'Loading map…' : !key ? 'Map service is not configured in this build. GPS routes can still be recorded.' : locationMessage || 'Finding your location…')}</Text>{mapError && <Pressable accessibilityRole="button" onPress={retryMap} style={styles.retry}><Text style={styles.buttonText}>Retry map</Text></Pressable>}</View>}
      <Pressable accessibilityRole="button" accessibilityLabel="Re-Center map on my location" onPress={recenter} style={styles.recenter}><Text style={styles.buttonText}>⌖ Re-Center</Text></Pressable>
    </View>}
    {selectedRoute && (mapError || !style) && <RoutePreview points={selectedRoute.points} />}
    {active ? <><Text style={styles.note}>{active.pausedAt ? 'Recording paused' : recording ? 'Recording continues with the screen locked' : 'Recording interrupted · tap Resume'}</Text><View style={styles.row}><View style={{ flex: 1 }}><Button label={active.pausedAt || !recording ? 'Resume' : 'Pause'} onPress={() => void withBusy(async () => { if (active.pausedAt || !recording) await resumeRoute(); else await pauseRoute(); })} secondary /></View><View style={{ flex: 1 }}><Button label="Finish" onPress={finish} danger /></View></View></> : !pending && !selectedRoute ? <Button label="Start Route" onPress={begin} /> : null}
    </View>}
    {active && <View style={styles.card}><Text style={styles.cardTitle}>Current activity</Text><StatusRow label="Activity type" value={active.kind.charAt(0).toUpperCase() + active.kind.slice(1)} /><StatusRow label="GPS" value={gpsStatus} /><StatusRow label="Distance" value={formatMiles(activeDistance)} /><StatusRow label="Active time" value={formatClock(activeDuration)} /><StatusRow label="Est. calories" value={activeCalories === null ? '—' : `${activeCalories} kcal`} /></View>}
    <Modal visible={weightPrompt} transparent animationType="fade" onRequestClose={() => setWeightPrompt(false)}><View style={styles.modalShade}><View style={styles.card}><Text style={styles.cardTitle}>Weight for this route</Text><Text style={styles.body}>No saved weight is available. Enter one for an approximate calorie estimate. This will not add a Weight entry.</Text><TextInput accessibilityLabel="Route weight" keyboardType="decimal-pad" value={weightDraft} onChangeText={setWeightDraft} placeholder="Weight" placeholderTextColor={colors.textDim} style={styles.input} /><View style={styles.row}>{(['lb', 'kg'] as const).map((unit) => <Pressable key={unit} onPress={() => setWeightUnit(unit)} style={[styles.smallButton, weightUnit === unit && styles.selected]}><Text style={styles.buttonText}>{unit}</Text></Pressable>)}</View><Button label="Start Route" onPress={beginWithEnteredWeight} /><Button label="Cancel" onPress={() => setWeightPrompt(false)} secondary /></View></View></Modal>
    <Modal visible={locationDisclosure} transparent animationType="fade" onRequestClose={() => setLocationDisclosure(false)}><View style={styles.modalShade}><View style={styles.card}><Text style={styles.cardTitle}>Location while recording a route</Text><Text style={styles.body}>Reclaim collects location data to record the walk, hike, or run you choose to start, even when the app is in the background or the screen is locked. This draws your route and calculates distance and pace. Recording stops when you pause or finish. Saved route points stay on your device unless you export them; they are not used for ads.</Text><Button label="Continue to location permissions" onPress={beginAfterDisclosure} /><Button label="Not now" onPress={() => setLocationDisclosure(false)} secondary /></View></View></Modal>
    {selectedRoute && <View style={styles.card}>
      <Text style={styles.cardTitle}>{selectedRoute.name || selectedRoute.kind}</Text>
      <Text style={styles.body}>{selectedRoute.kind === 'route' ? 'Route' : selectedRoute.kind.charAt(0).toUpperCase() + selectedRoute.kind.slice(1)} · {new Date(selectedRoute.startedAt).toLocaleDateString()}</Text>
      <View style={styles.metrics}>
        <Metric label="Distance" value={formatMiles(selectedRoute.distanceMeters)} />
        <Metric label="Active time" value={formatDuration(selectedDuration)} />
        <Metric label="Avg. pace" value={formatPace(selectedPace)} />
        <Metric label="Est. calories" value={selectedRoute.estimatedCalories == null ? '—' : `${selectedRoute.estimatedCalories} kcal`} />
      </View>
      <StatusRow label="Started" value={new Date(selectedRoute.startedAt).toLocaleString(undefined, { hour12: true })} />
      <StatusRow label="Finished" value={new Date(selectedRoute.endedAt).toLocaleString(undefined, { hour12: true })} />
      {selectedRoute.pausedMs > 0 && <StatusRow label="Time paused" value={formatDuration(selectedRoute.pausedMs)} />}
      {selectedRoute.notes && <View><Text style={styles.metricLabel}>Notes</Text><Text style={styles.body}>{selectedRoute.notes}</Text></View>}
      <Button label="Back to live map" onPress={() => { setSelected(null); followingRef.current = true; if (position) cameraRef.current?.easeTo({ center: position, zoom: 15, duration: 400 }); }} secondary />
    </View>}
  </ScrollView></SafeAreaView>;
}

function routeGeoJSON(points: ActivityPoint[]) {
  if (points.length < 2) return null;
  const segments = new globalThis.Map<number, number[][]>();
  for (const point of points) segments.set(point.segment ?? 0, [...(segments.get(point.segment ?? 0) ?? []), [point.longitude, point.latitude]]);
  return { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: [...segments.values()].filter((segment) => segment.length > 1) } };
}
function Button({ label, onPress, secondary = false, danger = false }: { label: string; onPress: () => void; secondary?: boolean; danger?: boolean }) { return <Pressable accessibilityRole="button" onPress={onPress} style={[styles.button, secondary && styles.secondary, danger && styles.dangerButton]}><Text style={styles.buttonText}>{label}</Text></Pressable>; }
function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) { return <View style={[styles.metric, compact && styles.compactMetric]}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, compact && styles.compactMetricValue]} numberOfLines={1} adjustsFontSizeToFit>{value}</Text></View>; }
function StatusRow({ label, value }: { label: string; value: string }) { return <View style={styles.statusRow}><Text style={styles.body}>{label}</Text><Text style={styles.statusValue}>{value}</Text></View>; }
function formatClock(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  return `${String(Math.floor(seconds / 3600)).padStart(2, '0')}:${String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}
function formatDuration(ms: number) {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds % 60).padStart(2, '0')}s`;
}
function formatPace(pace: number | null) { if (pace === null) return '—'; const seconds = Math.round(pace * 60); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} /mi`; }
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center', padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  eyebrow: { color: colors.activityNav, fontWeight: '800', letterSpacing: 2 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  card: { padding: 20, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, gap: 12 },
  recordingShell: { padding: 14, backgroundColor: colors.surface, borderColor: colors.activityNav, borderWidth: 1, borderRadius: 22, gap: 12, overflow: 'hidden' },
  idleShell: { gap: 12 },
  recordingCard: { gap: 12 },
  recordingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recordingStatus: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  statusWarning: { color: colors.textMuted },
  fullMap: { marginHorizontal: -spacing.lg, height: 380, position: 'relative', backgroundColor: colors.surfaceRaised },
  recordingMap: { marginHorizontal: 0, height: 340, borderRadius: 16, overflow: 'hidden', borderColor: colors.border, borderWidth: 1 },
  map: { flex: 1 },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26 },
  recenter: { position: 'absolute', right: 16, top: 16, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, borderRadius: 12, padding: 10 },
  retry: { marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: colors.activityNav },
  routeControls: { gap: 10 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  recordingMetrics: { flexDirection: 'row', gap: 8 },
  metric: { width: '48%', flexGrow: 1, padding: 12, backgroundColor: colors.surface, borderRadius: 12 },
  compactMetric: { width: 0, minWidth: 0, flexGrow: 1, alignItems: 'center', paddingHorizontal: 4, backgroundColor: colors.surfaceRaised },
  compactMetricValue: { fontSize: 16 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 9 },
  statusValue: { color: colors.activityNav, fontSize: 14, fontWeight: '700', textAlign: 'right' },
  metricLabel: { color: colors.textMuted, fontSize: 12 },
  metricValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  timer: { color: colors.text, fontSize: 36, fontWeight: '900', textAlign: 'center' },
  timerCaption: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: -12 },
  big: { color: colors.activityNav, fontSize: 42, fontWeight: '800' },
  stepRing: { alignSelf: 'center', width: 164, height: 164, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', alignItems: 'center' },
  stepHistoryRow: { paddingVertical: 10, borderTopColor: colors.border, borderTopWidth: 1 },
  button: { backgroundColor: colors.activityNav, padding: 15, borderRadius: 14, alignItems: 'center' },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  dangerButton: { backgroundColor: colors.danger },
  buttonText: { color: colors.text, fontWeight: '800' },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  deleteText: { color: colors.danger, fontSize: 12, paddingTop: 8 },
  input: { color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  row: { flexDirection: 'row', gap: 8 },
  smallButton: { flex: 1, padding: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', borderRadius: 10 },
  selected: { borderColor: colors.activityNav, borderWidth: 1 },
  modalShade: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 24 },
});
