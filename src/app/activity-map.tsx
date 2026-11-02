import { Camera, GeoJSONSource, Layer, Map, type StyleSpecification } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MainScreenHeader } from '@/components/main-screen-header';
import { SavedAdConfirmation } from '@/components/saved-ad-confirmation';
import { routeDisplayName } from '@/components/activity-route-details';
import { RoutePreview } from '@/components/route-preview';
import { RouteElevationCard } from '@/components/route-elevation-card';
import { activityToday } from '@/lib/activity-overview';
import { activeRouteDurationMs, activityDurationMs, averagePaceMinPerMile, estimatedRouteCalories, latestRouteWeightKg, routeDistanceMeters, routeMovingDurationMs } from '@/lib/activity';
import { motionTotals } from '@/lib/activity-motion';
import { readRouteAutoPauseEnabled } from '@/lib/route-auto-pause';
import { formatMiles } from '@/lib/activity-units';
import { getMapKey, loadMapStyle } from '@/lib/activity-maps';
import { localDateKey } from '@/lib/progress';
import { readRouteMileAlertsEnabled } from '@/lib/route-mile-alerts';
import { compassDirection, directionArrowCoordinates, usableCompassHeading } from '@/lib/route-compass';
import { getRouteForecast, gpsAccuracyBars, type RouteForecast } from '@/lib/route-weather';
import { clearFinishedRoute, finishRoute, isRouteRecording, pauseRoute, readActiveRoute, readPendingRoute, resumeRoute, startRoute, ActiveRoute } from '@/lib/activity-recording';
import { ActivityPoint, ActivityRoute } from '@/models/tracker';
import { useTrackers } from '@/state/tracker-context';
import { useAds } from '@/state/ads-context';
import { colors, layout, spacing } from '@/theme';

type MapCamera = React.ComponentRef<typeof Camera>;
type MapSurface = React.ComponentRef<typeof Map>;
type MapViewport = { center: [number, number]; zoom: number; bearing: number; pitch: number };
const MAP_CONTROL_SIZE = 48;
const MAP_ART_VISIBLE_SIZE = 37;
function MapControlArtwork({ control }: { control: 'expand' | 'recenter' }) {
  const artwork = control === 'expand' ? { centerX: 433.5, centerY: 454.5, extent: 574 } : { centerX: 1319, centerY: 448.5, extent: 658 };
  const scale = MAP_ART_VISIBLE_SIZE / artwork.extent;
  return <Image accessible={false} source={require('../../assets/images/route-map-controls-black.png')} resizeMode="stretch" style={{ position: 'absolute', width: 1774 * scale, height: 887 * scale, left: MAP_CONTROL_SIZE / 2 - artwork.centerX * scale, top: MAP_CONTROL_SIZE / 2 - artwork.centerY * scale }} />;
}
function MapModeArtwork({ following }: { following: boolean }) {
  // The supplied artwork has the filled arrow on the left and outline on the right.
  const artwork = following ? { centerX: 483, centerY: 439.5, extent: 604 } : { centerX: 1277, centerY: 441, extent: 613 };
  const scale = 38 / artwork.extent;
  return <Image accessible={false} source={require('../../assets/images/route-map-mode-arrows.png')} resizeMode="stretch" style={{ position: 'absolute', width: 1774 * scale, height: 887 * scale, left: MAP_CONTROL_SIZE / 2 - artwork.centerX * scale, top: MAP_CONTROL_SIZE / 2 - artwork.centerY * scale }} />;
}
export default function ActivityMapScreen() {
  const { showCompletionAd } = useAds();
  const { activityRoutes = [], weightEntries = [], saveActivityRoute, setSectionVisibility } = useTrackers();
  const { routeId } = useLocalSearchParams<{ routeId?: string }>();
  const [kind, setKind] = useState<'walk' | 'hike' | 'run'>('walk');
  const [pending, setPending] = useState<ActivityRoute | null>(null);
  const [savedConfirmation, setSavedConfirmation] = useState(false);
  const [routeName, setRouteName] = useState('');
  const [routeNotes, setRouteNotes] = useState('');
  const scrollRef = useRef<ScrollViewInstance>(null);
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
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [gpsFixTime, setGpsFixTime] = useState(0);
  const [forecast, setForecast] = useState<RouteForecast | null>(null);
  const cameraRef = useRef<MapCamera>(null);
  const mapRef = useRef<MapSurface>(null);
  const viewportRef = useRef<MapViewport | null>(null);
  const [cameraStart, setCameraStart] = useState<MapViewport | null>(null);
  const [mapExpanded, setMapExpanded] = useState(false);
  const followingRef = useRef(true);
  const positionRef = useRef<[number, number] | null>(null);
  const mapModeRef = useRef<'map' | 'follow'>('map');
  const headingRef = useRef<number | null>(null);
  const lastHeadingCameraRef = useRef({ degrees: -1, time: 0 });
  const lastCompassDisplayRef = useRef({ degrees: -1, accuracy: -1, time: 0 });
  const [mapMode, setMapMode] = useState<'map' | 'follow'>('map');
  const [mapZoom, setMapZoom] = useState(15);
  const [compass, setCompass] = useState<{ heading: number; accuracy: number; trueNorth: boolean } | null>(null);
  const [compassUnavailable, setCompassUnavailable] = useState(false);
  const [compassNeedsCalibration, setCompassNeedsCalibration] = useState(false);
  const handledRouteId = useRef<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [weightPrompt, setWeightPrompt] = useState(false);
  const [locationDisclosure, setLocationDisclosure] = useState(false);
  const [routeWeightKg, setRouteWeightKg] = useState<number | undefined>();
  const [mileAlerts, setMileAlerts] = useState(false);
  const [autoPause, setAutoPause] = useState(false);
  const [showTimingDetails, setShowTimingDetails] = useState(false);
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
    void readRouteMileAlertsEnabled().then(setMileAlerts).catch(() => undefined);
    void readRouteAutoPauseEnabled().then(setAutoPause).catch(() => undefined);
    if (mapPermissionRefresh > 0) setLocationMessage('Finding your location…');
    void getMapKey().then((value) => { if (!cancelled) { setKey(value); if (!value) setMapLoading(false); } }).catch(() => { if (!cancelled) { setMapError('Map configuration could not be read.'); setMapLoading(false); } });
    void refresh();
    const timer = setInterval(() => { void refresh(); }, 5000);
    const clockTimer = setInterval(() => setNow(Date.now()), 1000);
    let locationSubscription: Location.LocationSubscription | undefined;
    let cancelled = false;
    const updateForecast = (latitude: number, longitude: number) => {
      void getRouteForecast(latitude, longitude).then((result) => { if (!cancelled) setForecast(result); });
    };
    void (async () => {
      // Opening the live map is the first moment foreground location is useful.
      // Reviewing a saved route does not need a new permission request.
      const existingPermission = await Location.getForegroundPermissionsAsync();
      const permission = !existingPermission.granted && !routeId && existingPermission.canAskAgain
        ? await Location.requestForegroundPermissionsAsync()
        : existingPermission;
      if (cancelled) return;
      if (!permission.granted) { setLocationMessage('Allow location to center the map. You can try again with Re-Center.'); return; }
      const initial = await Location.getLastKnownPositionAsync().catch(() => null);
      if (initial && !cancelled) {
        const coordinate: [number, number] = [initial.coords.longitude, initial.coords.latitude];
        setPosition(coordinate);
        positionRef.current = coordinate;
        setCenter((previous) => previous ?? coordinate);
        setGpsAccuracy(initial.coords.accuracy);
        setGpsFixTime(initial.timestamp);
        if (Date.now() - initial.timestamp < 5 * 60_000) updateForecast(initial.coords.latitude, initial.coords.longitude);
      }
      locationSubscription = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5000 }, (location) => {
        if (cancelled) return;
        const coordinate: [number, number] = [location.coords.longitude, location.coords.latitude];
        setPosition(coordinate);
        positionRef.current = coordinate;
        setCenter((previous) => previous ?? coordinate);
        setGpsAccuracy(location.coords.accuracy);
        setGpsFixTime(location.timestamp);
        updateForecast(location.coords.latitude, location.coords.longitude);
        setLocationMessage('');
        if (followingRef.current) cameraRef.current?.easeTo({ center: coordinate, ...(mapModeRef.current === 'follow' && headingRef.current !== null ? { bearing: headingRef.current } : {}), duration: 400 });
      });
      if (cancelled) locationSubscription.remove();
    })().catch(() => { if (!cancelled) setLocationMessage('Could not get your location. Tap Re-Center to try again.'); });
    const subscription = AppState.addEventListener('change', (status) => { if (status === 'active') void refresh(); });
    return () => { cancelled = true; clearInterval(timer); clearInterval(clockTimer); subscription.remove(); locationSubscription?.remove(); };
  }, [refresh, mapPermissionRefresh, routeId]));
  useFocusEffect(useCallback(() => {
    if (mapMode !== 'follow' || !active?.id || selected) return;
    let cancelled = false;
    let starting = false;
    let headingSubscription: Location.LocationSubscription | undefined;
    const startHeading = async () => {
      if (starting || headingSubscription || AppState.currentState !== 'active') return;
      starting = true;
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) { if (!cancelled) setCompassUnavailable(true); return; }
        if (cancelled || AppState.currentState !== 'active') return;
        const subscription = await Location.watchHeadingAsync((reading) => {
          if (cancelled) return;
          const heading = usableCompassHeading(reading);
          if (heading === null) { headingRef.current = null; setCompass(null); setCompassNeedsCalibration(true); return; }
          headingRef.current = heading;
          setCompassNeedsCalibration(false);
          const now = Date.now();
          const displayed = lastCompassDisplayRef.current;
          const displayChange = Math.abs(((heading - displayed.degrees + 540) % 360) - 180);
          if (displayChange >= 2 || reading.accuracy !== displayed.accuracy || now - displayed.time >= 1000) {
            setCompass({ heading, accuracy: reading.accuracy, trueNorth: reading.trueHeading >= 0 });
            lastCompassDisplayRef.current = { degrees: heading, accuracy: reading.accuracy, time: now };
          }
          setCompassUnavailable(false);
          const last = lastHeadingCameraRef.current;
          const change = Math.abs(((heading - last.degrees + 540) % 360) - 180);
          if (!followingRef.current || !positionRef.current || change < 2 || (now - last.time < 450 && change < 8)) return;
          cameraRef.current?.easeTo({ center: positionRef.current, bearing: heading, duration: 350 });
          lastHeadingCameraRef.current = { degrees: heading, time: now };
        }, () => { if (!cancelled) setCompassUnavailable(true); });
        if (cancelled || AppState.currentState !== 'active') subscription.remove();
        else headingSubscription = subscription;
      } catch { if (!cancelled) setCompassUnavailable(true); }
      finally { starting = false; }
    };
    void startHeading();
    const appSubscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') void startHeading();
      else { headingSubscription?.remove(); headingSubscription = undefined; }
    });
    return () => { cancelled = true; headingSubscription?.remove(); appSubscription.remove(); };
  }, [mapMode, active?.id, selected]));
  const withBusy = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); await refresh(); }
    catch (error) { Alert.alert('Activity', error instanceof Error ? error.message : 'This action could not be completed.'); }
    finally { setBusy(false); }
  };
  const startConfiguredRoute = (weightKg: number) => {
    void withBusy(async () => { setSelected(null); await startRoute(kind, weightKg, mileAlerts, autoPause); setSectionVisibility('routes', true); setMapPermissionRefresh((value) => value + 1); });
  };
  const checkPermissionsAndBegin = async (weightKg: number) => {
    setRouteWeightKg(weightKg);
    try {
      const [foreground, background] = await Promise.all([Location.getForegroundPermissionsAsync(), Location.getBackgroundPermissionsAsync()]);
      if (foreground.granted && background.granted) { startConfiguredRoute(weightKg); return; }
    } catch { /* The normal permission request runs after the disclosure. */ }
    setLocationDisclosure(true);
  };
  const begin = () => {
    const localDate = localDateKey(new Date());
    const savedWeight = latestRouteWeightKg(weightEntries, localDate);
    if (savedWeight) {
      void checkPermissionsAndBegin(savedWeight);
    } else setWeightPrompt(true);
  };
  const beginWithEnteredWeight = () => {
    const value = Number(weightDraft);
    if (!Number.isFinite(value) || value <= 0 || value > (weightUnit === 'lb' ? 1400 : 635)) { Alert.alert('Enter a valid weight', 'Weight is used only for this route’s calorie estimate.'); return; }
    setWeightPrompt(false);
    void checkPermissionsAndBegin(weightUnit === 'lb' ? value * 0.45359237 : value);
  };
  const beginAfterDisclosure = () => {
    setLocationDisclosure(false);
    if (routeWeightKg) startConfiguredRoute(routeWeightKg);
  };
  const finish = () => Alert.alert('Finish route?', 'This stops GPS recording and opens the route summary.', [
    { text: 'Keep recording', style: 'cancel' },
    { text: 'Finish', onPress: () => void withBusy(async () => { const route = await finishRoute(); setPending(route); setRouteName(''); setRouteNotes(''); mapModeRef.current = 'map'; headingRef.current = null; setMapMode('map'); setCompass(null); if (positionRef.current) cameraRef.current?.easeTo({ center: positionRef.current, bearing: 0, duration: 400 }); }) },
  ]);
  const savePending = () => void withBusy(async () => {
    if (!pending) return;
    await saveActivityRoute({ ...pending, name: routeName.trim().slice(0, 120) || undefined, notes: routeNotes.trim().slice(0, 2000) || undefined });
    await clearFinishedRoute();
    setPending(null);
    setSavedConfirmation(true);
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
    positionRef.current = coordinate;
    setGpsAccuracy(location.coords.accuracy);
    setGpsFixTime(location.timestamp);
    setLocationMessage('');
    return location.coords;
  };
  const recenter = () => void withBusy(async () => {
    const location: [number, number] = position || await findPosition().then((coords): [number, number] => [coords.longitude, coords.latitude]);
    followingRef.current = true;
    setSelected(null);
    cameraRef.current?.easeTo({ center: location, zoom: 15, ...(mapModeRef.current === 'follow' && headingRef.current !== null ? { bearing: headingRef.current } : {}), duration: 500 });
  });
  const toggleMapMode = () => {
    const next = mapMode === 'map' ? 'follow' : 'map';
    mapModeRef.current = next;
    setMapMode(next);
    setCompassUnavailable(false);
    setCompassNeedsCalibration(false);
    lastHeadingCameraRef.current = { degrees: -1, time: 0 };
    lastCompassDisplayRef.current = { degrees: -1, accuracy: -1, time: 0 };
    followingRef.current = true;
    if (next === 'map') { headingRef.current = null; setCompass(null); }
    if (positionRef.current) cameraRef.current?.easeTo({ center: positionRef.current, bearing: next === 'follow' ? headingRef.current ?? 0 : 0, duration: 400 });
    else if (mapCenter) cameraRef.current?.easeTo({ center: mapCenter, bearing: next === 'follow' ? headingRef.current ?? 0 : 0, duration: 400 });
  };
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
  const selectedMovingMs = selectedRoute ? routeMovingDurationMs(selectedRoute) : null;
  const selectedMovingPace = selectedRoute && selectedMovingMs != null ? averagePaceMinPerMile(selectedRoute.distanceMeters, selectedMovingMs) : null;
  const changePendingKind = (choice: 'walk' | 'hike' | 'run') => {
    if (!pending) return;
    const calorieDuration = pending.movingMs === undefined ? activityDurationMs(pending) : pending.movingMs;
    setPending({ ...pending, kind: choice, estimatedCalories: estimatedRouteCalories(pending.distanceMeters, calorieDuration, pending.estimateWeightKg, choice) ?? undefined });
  };
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
  const directionArrow = position && active && !selectedRoute && mapMode === 'follow' && compass && {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [directionArrowCoordinates(position, compass.heading, mapZoom)] },
  };
  const activeDistance = active ? routeDistanceMeters(active.points) : 0;
  const activeDuration = active && now ? activeRouteDurationMs(active, now) : 0;
  const activeTimes = motionTotals(active?.motion, activeDuration);
  const activePace = averagePaceMinPerMile(activeDistance, activeTimes.movingMs ?? 0);
  const activeOverallPace = averagePaceMinPerMile(activeDistance, activeDuration);
  const activeCalories = active ? estimatedRouteCalories(activeDistance, active?.motion ? activeTimes.movingMs ?? 0 : activeDuration, active.estimateWeightKg, active.kind) : null;
  const routeStatus = active?.pausedAt ? 'Manually paused' : active?.autoPausedAt ? 'Auto-paused' : recording ? 'Recording…' : 'Interrupted';
  const gpsStatus = !position ? 'Finding signal' : active?.pausedAt ? 'Paused' : recording ? 'Tracking' : 'Needs attention';
  const currentAccuracy = now && now - gpsFixTime > 30_000 ? null : gpsAccuracy;
  const accuracyBars = gpsAccuracyBars(currentAccuracy);
  const today = activityToday(activityRoutes, new Date());
  const openExpandedMap = () => { setCameraStart(viewportRef.current); setMapExpanded(true); };
  const closeExpandedMap = () => { setCameraStart(viewportRef.current); setMapExpanded(false); };
  const showMapAttribution = () => {
    const map = mapRef.current;
    if (map) void map.showAttribution().catch(() => Alert.alert('Map attribution unavailable', 'Please try again.'));
  };
  const renderMapPanel = (expanded: boolean) => <View style={expanded ? styles.expandedMap : [styles.fullMap, active && styles.recordingMap]}>
    {style && mapCenter && !mapError ? <Map
      ref={mapRef}
      style={styles.map}
      mapStyle={style}
      compass={false}
      logo={false}
      attribution={false}
      dragPan={expanded}
      touchZoom={expanded}
      doubleTapZoom={expanded}
      touchRotate={expanded}
      touchPitch={false}
      onDidFailLoadingMap={() => setMapError('Map imagery could not load. Check your connection or Stadia Maps access, then retry.')}
      onRegionWillChange={(event) => { if (event.nativeEvent.userInteraction) followingRef.current = false; }}
      onRegionDidChange={(event) => {
        const { center: mapPosition, zoom, bearing, pitch } = event.nativeEvent;
        if (Number.isFinite(zoom)) {
          viewportRef.current = { center: mapPosition, zoom, bearing, pitch };
          setMapZoom((previous) => Math.abs(previous - zoom) >= 0.1 ? zoom : previous);
        }
      }}
    >
      <Camera ref={cameraRef} initialViewState={cameraStart ?? { center: mapCenter, zoom: 15 }} />
      {line && <GeoJSONSource id="activity-route" data={line}><Layer id="activity-line" type="line" paint={{ 'line-color': colors.activityNav, 'line-width': 4 }} /></GeoJSONSource>}
      {currentPoint && !directionArrow && <GeoJSONSource id="activity-position" data={currentPoint}><Layer id="activity-position-dot" type="circle" paint={{ 'circle-color': colors.activityNav, 'circle-radius': 7, 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2 }} /></GeoJSONSource>}
      {directionArrow && <GeoJSONSource id="activity-heading-arrow" data={directionArrow}><Layer id="activity-heading-fill" type="fill" paint={{ 'fill-color': colors.activityNav, 'fill-opacity': 1 }} /><Layer id="activity-heading-outline" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 2 }} /></GeoJSONSource>}
    </Map> : <View style={styles.mapEmpty}><Text style={styles.body}>{mapError || (mapLoading ? 'Loading map…' : !key ? 'Map service is not configured in this build. GPS routes can still be recorded.' : locationMessage || 'Finding your location…')}</Text>{!!mapError && <Pressable accessibilityRole="button" onPress={retryMap} style={styles.retry}><Text style={styles.buttonText}>Retry map</Text></Pressable>}</View>}
    {active && !selectedRoute && <View style={styles.navigationControls}>
      <Pressable accessibilityRole="button" accessibilityLabel={mapMode === 'map' ? 'Fixed north-up map. Switch to Follow mode' : 'Follow mode on. Switch to fixed north-up map'} accessibilityState={{ selected: mapMode === 'follow' }} onPress={toggleMapMode} style={styles.navigationButton}><MapModeArtwork following={mapMode === 'follow'} /></Pressable>
      {mapMode === 'follow' && <View style={styles.compassBadge}><Text style={styles.compassText}>{compass ? `${compassDirection(compass.heading)} · ${String(Math.round(compass.heading)).padStart(3, '0')}°${compass.trueNorth ? '' : ' magnetic'}` : compassUnavailable ? 'Compass unavailable' : compassNeedsCalibration ? 'Calibrate compass' : 'Finding heading…'}</Text>{compass?.accuracy === 1 && <Text style={styles.compassWarning}>Low accuracy</Text>}</View>}
    </View>}
    {expanded ? <View pointerEvents="none" style={styles.mapHint}><Text style={styles.mapHintText}>Drag with one finger · pinch to zoom{active ? ' · Re-Center resumes following' : ''}</Text></View> : <Pressable accessibilityRole="button" accessibilityLabel="Expand map for one-finger navigation" onPress={openExpandedMap} style={styles.expandMapButton}><MapControlArtwork control="expand" /></Pressable>}
    <Pressable accessibilityRole="button" accessibilityLabel="Re-center map on my location" onPress={recenter} style={styles.recenter}><MapControlArtwork control="recenter" /></Pressable>
    {style && mapCenter && !mapError && <View pointerEvents="box-none" style={styles.mapAttributionRow}>
      <Text style={styles.mapLibreLabel}>MapLibre</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Map attribution and information" onPress={showMapAttribution} hitSlop={8} style={styles.mapAttributionButton}><Text style={styles.mapAttributionIcon}>i</Text></Pressable>
    </View>}
  </View>;
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView ref={scrollRef} nestedScrollEnabled contentContainerStyle={styles.content}>
    <MainScreenHeader title="Routes" subtitle="Record walks, hikes, and runs with GPS." accent={colors.activityNav} action={<Pressable accessibilityRole="button" accessibilityLabel="Route settings" onPress={() => router.push('/route-settings' as Href)} style={styles.settingsButton}><Text style={styles.settingsButtonText}>Settings</Text></Pressable>} />
    {pending ? <View style={styles.card}><Text style={styles.cardTitle}>Route completed 🎉</Text><Text style={styles.body}>{new Date(pending.endedAt).toLocaleString(undefined, { hour12: true })}</Text><RoutePreview points={pending.points} /><View style={styles.metrics}><Metric label="Distance" value={formatMiles(pending.distanceMeters)} /><Metric label="Elapsed time" value={formatDuration(activityDurationMs(pending))} /><Metric label="Moving time" value={pending.movingMs === undefined ? '—' : formatDuration(pending.movingMs)} /><Metric label="Moving pace" value={formatPace(pending.movingMs === undefined ? null : averagePaceMinPerMile(pending.distanceMeters, pending.movingMs))} /><Metric label="Stopped time" value={pending.stoppedMs === undefined ? "—" : formatDuration(pending.stoppedMs)} /><Metric label="Overall pace" value={formatPace(averagePaceMinPerMile(pending.distanceMeters, activityDurationMs(pending)))} /><Metric label="Est. calories" value={pending.estimatedCalories == null ? '—' : `${pending.estimatedCalories} kcal`} /><Metric label="Route Steps" value={pending.routeSteps === undefined ? '—' : pending.routeSteps.toLocaleString()} /></View><Text style={styles.note}>Elapsed time excludes manual pauses. Unclassified GPS time is not counted as movement.</Text><Text style={styles.body}>Route name</Text><TextInput accessibilityLabel="Route name" value={routeName} onChangeText={setRouteName} maxLength={120} placeholder={pending.kind === 'route' ? 'Route' : pending.kind} placeholderTextColor={colors.textDim} style={styles.input} /><Text style={styles.body}>Activity type</Text><View style={styles.row}>{(['walk', 'hike', 'run'] as const).map((choice) => <Pressable key={choice} onPress={() => changePendingKind(choice)} style={[styles.smallButton, pending.kind === choice && styles.selected]}><Text style={styles.buttonText}>{choice.toUpperCase()}</Text></Pressable>)}</View><Text style={styles.body}>Notes (optional)</Text><TextInput accessibilityLabel="Route notes" value={routeNotes} onChangeText={setRouteNotes} maxLength={2000} multiline placeholder="Anything you want to remember" placeholderTextColor={colors.textDim} style={[styles.input, { minHeight: 80 }]} /><View style={styles.row}><View style={{ flex: 1 }}><Button label="Save route" onPress={savePending} /></View><View style={{ flex: 1 }}><Button label="Discard" onPress={discardPending} secondary /></View></View></View> : null}
    {!pending && <View style={active ? styles.recordingShell : styles.idleShell}>
    {active ? <View style={styles.recordingCard}><View style={styles.recordingHeader}><Text style={styles.cardTitle}>{active.pausedAt ? 'Route paused' : active.autoPausedAt ? 'Auto-paused' : 'Recording route'}</Text><Text style={[styles.recordingStatus, (active.pausedAt || !recording) && styles.statusWarning]}>● {routeStatus}</Text></View><Text accessibilityLabel={`Elapsed time ${formatDuration(activeDuration)}`} style={styles.timer}>{formatClock(activeDuration)}</Text><Text style={styles.timerCaption}>Elapsed time · {active.kind.toUpperCase()}{active.mileAlerts ? ' · Mile alerts on' : ''}</Text><View style={styles.recordingMetrics}><Metric compact label="Moving time" value={formatClock(activeTimes.movingMs ?? 0)} /><Metric compact label="Distance" value={formatMiles(activeDistance)} /><Metric compact label="Moving pace" value={formatPace(activePace)} /></View><View style={styles.recordingMetrics}><Metric compact label="Est. calories" value={activeCalories === null ? '—' : `${activeCalories} kcal`} /><Metric compact label="Route Steps" value={active.routeSteps === undefined ? '—' : active.routeSteps.toLocaleString()} /></View><Pressable accessibilityRole="button" accessibilityState={{ expanded: showTimingDetails }} onPress={() => setShowTimingDetails((value) => !value)}><Text style={styles.note}>{showTimingDetails ? 'Hide' : 'Show'} timing details</Text></Pressable>{showTimingDetails && <View><StatusRow label="Overall pace" value={formatPace(activeOverallPace)} /><StatusRow label="Stopped time" value={formatDuration(activeTimes.stoppedMs ?? 0)} /><StatusRow label="Unclassified GPS time" value={formatDuration(activeTimes.unclassifiedMs)} /><Text style={styles.note}>Elapsed excludes manual pauses; uncertain or missing GPS time is not assumed to be moving.</Text></View>}{active.mileAlertError && <Text style={styles.note}>Mile alert unavailable: {active.mileAlertError}</Text>}</View> : !pending && !selectedRoute ? <View style={styles.card}><Text style={styles.cardTitle}>Track an activity</Text><Text style={styles.body}>Choose an activity, then start your route.</Text><View style={styles.row}>{(['walk', 'hike', 'run'] as const).map((choice) => <Pressable key={choice} accessibilityRole="button" onPress={() => setKind(choice)} style={[styles.smallButton, kind === choice && styles.selected]}><Text style={styles.buttonText}>{choice.toUpperCase()}</Text></Pressable>)}</View></View> : null}
    <View style={styles.conditions}>
      <View style={styles.conditionHalf} accessibilityLabel={forecast?.status === 'ready' ? `Forecast for ${forecast.area}: ${forecast.temperature} degrees ${forecast.unit === 'F' ? 'Fahrenheit' : 'Celsius'}, ${forecast.condition}` : 'Forecast unavailable'}>
        <Text style={styles.conditionLabel}>NWS FORECAST</Text>
        <Text style={styles.conditionValue}>{forecast?.status === 'ready' ? `${forecast.symbol} ${forecast.temperature}°${forecast.unit}` : forecast?.status === 'unavailable' ? 'Unavailable here' : forecast?.status === 'error' ? 'Unavailable now' : 'Loading…'}</Text>
        <Text style={styles.conditionDetail} numberOfLines={2}>{forecast?.status === 'ready' ? `${forecast.area} · ${forecast.condition}` : forecast?.status === 'unavailable' ? 'U.S. areas only' : forecast?.status === 'error' ? 'Check connection later' : 'Based on your location'}</Text>
      </View>
      <View style={styles.conditionHalf} accessibilityLabel={`GPS estimated accuracy ${currentAccuracy == null ? 'unavailable' : `approximately ${Math.round(currentAccuracy)} meters`}`}>
        <Text style={styles.conditionLabel}>GPS ACCURACY</Text>
        <View accessible accessibilityLabel={`GPS accuracy ${accuracyBars} of 4 bars`} style={styles.signalBars}>{[1, 2, 3, 4].map((bar) => <View key={bar} style={[styles.signalBar, { height: 6 + bar * 4 }, bar <= accuracyBars && styles.signalBarOn]} />)}</View>
        <Text style={styles.conditionDetail}>{currentAccuracy == null ? 'Finding a fix' : `Approx. ±${Math.round(currentAccuracy)} m`}</Text>
      </View>
    </View>
    {!pending && (mapExpanded ? <View style={[styles.fullMap, active && styles.recordingMap]} /> : renderMapPanel(false))}
    {selectedRoute && (mapError || !style) && <RoutePreview points={selectedRoute.points} />}
    {active ? <><Text style={styles.note}>{active.pausedAt ? 'Recording paused' : recording ? 'Recording continues with the screen locked' : 'Recording interrupted · tap Resume'}</Text><View style={styles.row}><View style={{ flex: 1 }}><Button label={active.pausedAt || !recording ? 'Resume' : 'Pause'} onPress={() => void withBusy(async () => { if (active.pausedAt || !recording) await resumeRoute(); else await pauseRoute(); })} secondary /></View><View style={{ flex: 1 }}><Button label="Finish" onPress={finish} danger /></View></View></> : !pending && !selectedRoute ? <Button label="Start Route" onPress={begin} /> : null}
    </View>}
    {active && <View style={styles.card}><Text style={styles.cardTitle}>Current activity</Text><StatusRow label="Activity type" value={active.kind.charAt(0).toUpperCase() + active.kind.slice(1)} /><StatusRow label="GPS" value={gpsStatus} /><StatusRow label="Distance" value={formatMiles(activeDistance)} /><StatusRow label="Elapsed time" value={formatClock(activeDuration)} /><StatusRow label="Moving time" value={formatClock(activeTimes.movingMs ?? 0)} /><StatusRow label="Est. calories" value={activeCalories === null ? '—' : `${activeCalories} kcal`} /></View>}
    <SavedAdConfirmation visible={savedConfirmation} title="Route saved" subject="Your route" onContinue={() => { setSavedConfirmation(false); void showCompletionAd('route'); }} />
    {mapExpanded && !pending && <Modal visible animationType="slide" onRequestClose={closeExpandedMap}><SafeAreaView style={styles.expandedSafe} edges={['top', 'bottom']}>
      <View style={styles.expandedHeader}><Pressable accessibilityRole="button" accessibilityLabel="Back to route screen" onPress={closeExpandedMap} style={styles.closeMapButton}><Text style={styles.buttonText}>‹ Back to route</Text></Pressable><Text style={styles.expandedTitle} numberOfLines={1}>{active ? `${active.kind.toUpperCase()} · ${formatMiles(activeDistance)}` : selectedRoute ? routeDisplayName(selectedRoute) : 'Routes map'}</Text></View>
      {renderMapPanel(true)}
    </SafeAreaView></Modal>}
    <Modal visible={weightPrompt} transparent animationType="fade" onRequestClose={() => setWeightPrompt(false)}><View style={styles.modalShade}><View style={styles.card}><Text style={styles.cardTitle}>Weight for this route</Text><Text style={styles.body}>No saved weight is available. Enter one for an approximate calorie estimate. This will not add a Weight entry.</Text><TextInput accessibilityLabel="Route weight" keyboardType="decimal-pad" value={weightDraft} onChangeText={setWeightDraft} placeholder="Weight" placeholderTextColor={colors.textDim} style={styles.input} /><View style={styles.row}>{(['lb', 'kg'] as const).map((unit) => <Pressable key={unit} onPress={() => setWeightUnit(unit)} style={[styles.smallButton, weightUnit === unit && styles.selected]}><Text style={styles.buttonText}>{unit}</Text></Pressable>)}</View><Button label="Start Route" onPress={beginWithEnteredWeight} /><Button label="Cancel" onPress={() => setWeightPrompt(false)} secondary /></View></View></Modal>
    <Modal visible={locationDisclosure} transparent animationType="fade" onRequestClose={() => setLocationDisclosure(false)}><View style={styles.modalShade}><View style={styles.card}><Text style={styles.cardTitle}>Location while recording a route</Text><Text style={styles.body}>Reclaim collects location data to record the walk, hike, or run you choose to start, even when the app is in the background or the screen is locked. This draws your route and calculates distance and pace. Recording stops when you pause or finish. Saved route points stay on your device unless you export them; they are not used for ads.</Text><Button label="Continue to route permissions" onPress={beginAfterDisclosure} /><Button label="Not now" onPress={() => setLocationDisclosure(false)} secondary /></View></View></Modal>
    {selectedRoute && <View style={styles.card}>
      <Text style={styles.cardTitle}>{selectedRoute.name || selectedRoute.kind}</Text>
      <Text style={styles.body}>{selectedRoute.kind === 'route' ? 'Route' : selectedRoute.kind.charAt(0).toUpperCase() + selectedRoute.kind.slice(1)} · {new Date(selectedRoute.startedAt).toLocaleDateString()}</Text>
      <View style={styles.metrics}>
        <Metric label="Distance" value={formatMiles(selectedRoute.distanceMeters)} />
        <Metric label="Elapsed time" value={formatDuration(selectedDuration)} />
        <Metric label="Moving time" value={selectedMovingMs === null ? '—' : formatDuration(selectedMovingMs)} />
        <Metric label="Moving pace" value={formatPace(selectedMovingPace)} />
        <Metric label="Overall pace" value={formatPace(selectedPace)} />
        <Metric label="Est. calories" value={selectedRoute.estimatedCalories == null ? '—' : `${selectedRoute.estimatedCalories} kcal`} />
        <Metric label="Route Steps" value={selectedRoute.routeSteps === undefined ? '—' : selectedRoute.routeSteps.toLocaleString()} />
      </View>
      <RouteElevationCard points={selectedRoute.points} />
      <StatusRow label="Started" value={new Date(selectedRoute.startedAt).toLocaleString(undefined, { hour12: true })} />
      <StatusRow label="Finished" value={new Date(selectedRoute.endedAt).toLocaleString(undefined, { hour12: true })} />
      {selectedRoute.pausedMs > 0 && <StatusRow label="Time paused" value={formatDuration(selectedRoute.pausedMs)} />}
      {selectedRoute.stoppedMs !== undefined && <StatusRow label="Stopped time" value={formatDuration(selectedRoute.stoppedMs)} />}
      {selectedRoute.unclassifiedMs !== undefined && <StatusRow label="Unclassified GPS time" value={formatDuration(selectedRoute.unclassifiedMs)} />}
      {selectedMovingMs === null && <Text style={styles.note}>This older route did not record movement timing, so moving time and moving pace are unavailable.</Text>}
      {selectedRoute.notes && <View><Text style={styles.metricLabel}>Notes</Text><Text style={styles.body}>{selectedRoute.notes}</Text></View>}
      <Button label="Back to live map" onPress={() => { setSelected(null); followingRef.current = true; if (position) cameraRef.current?.easeTo({ center: position, zoom: 15, duration: 400 }); }} secondary />
    </View>}
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Today’s routes</Text>
      <View style={styles.metrics}>
        <Metric label="Distance" value={formatMiles(today.distanceMeters)} />
        <Metric label="Elapsed time" value={formatDuration(today.activeMs)} />
        <Metric label="Est. calories" value={today.estimatedCalories === null ? '—' : `${today.estimatedCalories} kcal`} />
        <Metric label="Route Steps" value={today.routeSteps === null ? '—' : today.routeSteps.toLocaleString()} />
      </View>
      <Text style={styles.note}>Route steps are included in your daily step count—not added to it again. Older routes may not have a step count.</Text>
    </View>
    <Button label="View saved routes" onPress={() => router.push('/activity-routes' as Href)} secondary />
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
  settingsRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  settingsButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  settingsButtonText: { color: colors.activityNav, fontSize: 13, fontWeight: '600' },
  eyebrow: { color: colors.activityNav, fontWeight: '600', letterSpacing: 2 },
  body: { color: colors.textMuted, fontSize: 14, lineHeight: 21 },
  card: { padding: 20, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 22, gap: 12 },
  recordingShell: { padding: 14, backgroundColor: colors.surface, borderColor: colors.activityNav, borderWidth: 1, borderRadius: 22, gap: 12, overflow: 'hidden' },
  idleShell: { gap: 12 },
  recordingCard: { gap: 12 },
  recordingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  recordingStatus: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  statusWarning: { color: colors.textMuted },
  fullMap: { marginHorizontal: -spacing.lg, height: 380, position: 'relative', backgroundColor: colors.surfaceRaised },
  recordingMap: { marginHorizontal: 0, height: 340, borderRadius: 16, overflow: 'hidden', borderColor: colors.border, borderWidth: 1 },
  expandedSafe: { flex: 1, backgroundColor: colors.background },
  expandedHeader: { minHeight: 62, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface },
  expandedTitle: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  closeMapButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceRaised },
  expandedMap: { flex: 1, position: 'relative', backgroundColor: colors.surfaceRaised },
  conditions: { flexDirection: 'row', gap: 8 },
  conditionHalf: { flex: 1, minWidth: 0, padding: 12, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderColor: colors.border, borderWidth: 1, gap: 4 },
  conditionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
  conditionValue: { color: colors.activityNav, fontSize: 19, fontWeight: '600' }, signalBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 26 }, signalBar: { width: 7, borderRadius: 2, backgroundColor: colors.border }, signalBarOn: { backgroundColor: colors.activityNav },
  conditionDetail: { color: colors.textDim, fontSize: 11 },
  map: { flex: 1 },
  mapEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 26 },
  mapAttributionRow: { position: 'absolute', left: 8, right: 8, bottom: 4, height: 30, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mapLibreLabel: { color: '#526265', fontSize: 13, fontWeight: '600', textShadowColor: '#FFFFFF', textShadowRadius: 3, textShadowOffset: { width: 0, height: 0 } },
  mapAttributionButton: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#208D9E', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9F8F4CC' },
  mapAttributionIcon: { color: '#208D9E', fontSize: 16, fontWeight: '600', lineHeight: 19, textAlign: 'center' },
  recenter: { position: 'absolute', right: 16, top: 16, width: MAP_CONTROL_SIZE, height: MAP_CONTROL_SIZE, overflow: 'hidden' },
  expandMapButton: { position: 'absolute', left: 12, bottom: 44, width: MAP_CONTROL_SIZE, height: MAP_CONTROL_SIZE, overflow: 'hidden' },
  navigationControls: { position: 'absolute', left: 12, right: MAP_CONTROL_SIZE + 28, top: 16, alignItems: 'flex-start', gap: 6 },
  navigationButton: { width: MAP_CONTROL_SIZE, height: MAP_CONTROL_SIZE, overflow: 'hidden' },
  compassBadge: { maxWidth: '100%', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 9, backgroundColor: '#10191CDD' },
  compassText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  compassWarning: { color: colors.danger, fontSize: 11, fontWeight: '700' },
  mapHint: { position: 'absolute', left: 12, bottom: 42, right: 12, alignItems: 'center' },
  mapHintText: { color: colors.text, backgroundColor: '#10191CCC', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, fontSize: 11 },
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
  metricValue: { color: colors.text, fontSize: 18, fontWeight: '600' },
  cardTitle: { color: colors.text, fontSize: 20, fontWeight: '600' },
  timer: { color: colors.text, fontSize: 36, fontWeight: '700', textAlign: 'center' },
  timerCaption: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: -12 },
  big: { color: colors.activityNav, fontSize: 42, fontWeight: '600' },
  stepRing: { alignSelf: 'center', width: 164, height: 164, alignItems: 'center', justifyContent: 'center' },
  ringLabel: { position: 'absolute', alignItems: 'center' },
  stepHistoryRow: { paddingVertical: 10, borderTopColor: colors.border, borderTopWidth: 1 },
  button: { backgroundColor: colors.activityNav, padding: 15, borderRadius: 14, alignItems: 'center' },
  secondary: { backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  dangerButton: { backgroundColor: colors.danger },
  buttonText: { color: colors.text, fontWeight: '600' },
  note: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  deleteText: { color: colors.danger, fontSize: 12, paddingTop: 8 },
  input: { color: colors.text, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 14 },
  row: { flexDirection: 'row', gap: 8 },
  smallButton: { flex: 1, padding: 10, backgroundColor: colors.surfaceRaised, alignItems: 'center', borderRadius: 10 },
  selected: { borderColor: colors.activityNav, borderWidth: 1 },
  modalShade: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'center', padding: 24 },
});
