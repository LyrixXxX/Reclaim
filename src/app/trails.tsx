import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getMapKey } from '@/lib/activity-maps';
import { directionsUrl, milesBetween, SavedTrail, searchPlace, searchTrails, sortSavedTrails, TRAIL_RADII, TrailRadius, TrailResult, trailKindLabel } from '@/lib/trails';
import { useTrackers } from '@/state/tracker-context';
import { colors, font, layout, spacing } from '@/theme';

type Origin = { latitude: number; longitude: number; label: string };
type Place = TrailResult | SavedTrail;

/** Find trails near a place or your location, get directions, and keep a list of favorites. */
export default function TrailsScreen() {
  const { savedTrails = [], saveTrailPlace, toggleFavoriteTrailPlace, removeTrailPlace } = useTrackers();
  const [tab, setTab] = useState<'nearby' | 'saved'>('nearby');
  const [query, setQuery] = useState('');
  const [radius, setRadius] = useState<TrailRadius>(10);
  const [origin, setOrigin] = useState<Origin>();
  const [results, setResults] = useState<TrailResult[]>();
  const [busy, setBusy] = useState<'place' | 'location' | 'trails'>();
  const [error, setError] = useState('');
  const [details, setDetails] = useState<Place>();
  const searchId = useRef(0);

  const runSearch = async (from: Origin, miles: TrailRadius) => {
    const id = ++searchId.current;
    setBusy('trails'); setError(''); setOrigin(from); setTab('nearby');
    try {
      const found = await searchTrails(from.latitude, from.longitude, miles);
      if (id === searchId.current) setResults(found);
    } catch (cause) {
      if (id === searchId.current) { setResults(undefined); setError(cause instanceof Error ? cause.message : 'Trails couldn’t be loaded. Try again.'); }
    } finally { if (id === searchId.current) setBusy(undefined); }
  };

  const searchNearMe = async (askPermission: boolean) => {
    try {
      let permission = await Location.getForegroundPermissionsAsync();
      setError('');
      if (!permission.granted && askPermission) permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) { if (askPermission) setError('Allow location access, or search for a town, park or ZIP code.'); return; }
      setBusy('location');
      const position = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 }) ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!position) throw new Error('Your location isn’t available right now.');
      await runSearch({ latitude: position.coords.latitude, longitude: position.coords.longitude, label: 'your location' }, radius);
    } catch (cause) {
      setBusy(undefined);
      setError(cause instanceof Error ? cause.message : 'Your location isn’t available right now.');
    }
  };

  const findPlace = async () => {
    if (!query.trim()) return;
    setBusy('place'); setError('');
    try {
      const place = await searchPlace(query, await getMapKey());
      if (!place) { setBusy(undefined); setError(`No place found for “${query.trim()}”. Try a town, park or ZIP code.`); return; }
      await runSearch({ latitude: place.latitude, longitude: place.longitude, label: place.label }, radius);
    } catch (cause) {
      setBusy(undefined);
      setError(cause instanceof Error ? cause.message : 'Place search failed. Try again.');
    }
  };

  /** On when results are around you; searching a place turns it off. */
  const usingLocation = origin?.label === 'your location';
  const toggleLocation = () => {
    if (!usingLocation) { void searchNearMe(true); return; }
    searchId.current += 1; // drop any search still running
    setOrigin(undefined); setResults(undefined); setBusy(undefined); setError('');
  };

  const changeRadius = (miles: TrailRadius) => {
    setRadius(miles);
    if (origin && busy !== 'trails') void runSearch(origin, miles);
  };

  // Search near you on first open when location access was already given; never ask unprompted.
  useEffect(() => {
    let alive = true;
    void Location.getForegroundPermissionsAsync().then((permission) => { if (alive && permission.granted) void searchNearMe(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- runs once, on first open

  const saved = sortSavedTrails(savedTrails);
  const savedById = new Map(savedTrails.map((item) => [item.id, item]));
  const distanceFrom = (place: Place) => 'distanceMiles' in place ? place.distanceMiles : origin ? Math.round(milesBetween(origin, place) * 10) / 10 : undefined;
  const openDirections = (place: Place) => { void Linking.openURL(directionsUrl(place)).catch(() => Alert.alert('Directions', 'Google Maps couldn’t be opened.')); };
  const toggleSaved = (place: Place) => {
    if (savedById.has(place.id)) Alert.alert('Remove from saved?', `${place.name} will be removed from your saved trails.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeTrailPlace(place.id) }]);
    else saveTrailPlace(place as TrailResult);
  };

  const row = (place: Place) => {
    const savedItem = savedById.get(place.id);
    const miles = distanceFrom(place);
    const meta = [trailKindLabel(place.kind), miles !== undefined ? `${miles} mi away` : undefined, place.lengthMiles ? `${place.lengthMiles} mi long` : undefined, place.difficulty].filter(Boolean).join(' · ');
    return <View key={place.id} style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${place.name}. ${meta}. Show details`} onPress={() => setDetails(place)} onLongPress={() => savedItem && toggleSaved(place)} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.75 }]}>
        <Text style={styles.rowTitle} numberOfLines={2}>{savedItem?.favorite ? '★ ' : ''}{place.name}</Text>
        <Text style={styles.muted} numberOfLines={1}>{meta}</Text>
      </Pressable>
      <View style={styles.rowActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Directions to ${place.name}`} onPress={() => openDirections(place)} style={[styles.smallButton, styles.primarySmall]}><Text style={styles.primarySmallText}>Directions</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={savedItem ? `Remove ${place.name} from saved` : `Save ${place.name}`} onPress={() => toggleSaved(place)} style={styles.smallButton}><Text style={styles.smallButtonText}>{savedItem ? 'Saved ✓' : 'Save'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={savedItem?.favorite ? `Unfavorite ${place.name}` : `Favorite ${place.name}`} accessibilityState={{ selected: !!savedItem?.favorite }} onPress={() => toggleFavoriteTrailPlace(place)} hitSlop={6} style={styles.starButton}><Text style={[styles.star, savedItem?.favorite && styles.starOn]}>{savedItem?.favorite ? '★' : '☆'}</Text></Pressable>
      </View>
    </View>;
  };

  const detailItem = details ? savedById.get(details.id) : undefined;
  const detailMiles = details ? distanceFrom(details) : undefined;

  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Find trails</Text>
    <View style={styles.searchRow}>
      <TextInput accessibilityLabel="Search a town, park or ZIP code" value={query} onChangeText={setQuery} onSubmitEditing={() => void findPlace()} returnKeyType="search" placeholder="Town, park or ZIP" placeholderTextColor={colors.textDim} style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel="Search" disabled={!query.trim() || !!busy} onPress={() => void findPlace()} style={[styles.searchButton, (!query.trim() || !!busy) && styles.disabled]}><Text style={styles.primarySmallText}>Search</Text></Pressable>
    </View>
    <Pressable accessibilityRole="switch" accessibilityLabel="Use my location" accessibilityState={{ checked: usingLocation, disabled: busy === 'place' || busy === 'location' }} disabled={busy === 'place' || busy === 'location'} onPress={toggleLocation} style={[styles.locationButton, usingLocation && styles.locationOn, (busy === 'place' || busy === 'location') && styles.disabled]}><View style={[styles.locationDot, { backgroundColor: usingLocation ? colors.success : colors.textDim }]} /><Text style={styles.smallButtonText}>{usingLocation ? 'Using my location' : 'Use my location'}</Text><Text style={styles.locationState}>{usingLocation ? 'On' : 'Off'}</Text></Pressable>
    <View style={styles.chips}>{TRAIL_RADII.map((miles) => <Pressable key={miles} accessibilityRole="radio" accessibilityLabel={`Within ${miles} miles`} accessibilityState={{ checked: radius === miles }} onPress={() => changeRadius(miles)} style={[styles.chip, radius === miles && styles.chipOn]}><Text style={[styles.chipText, radius === miles && styles.chipTextOn]}>{miles} mi</Text></Pressable>)}</View>
    <View style={styles.tabs}>
      {(['nearby', 'saved'] as const).map((value) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: tab === value }} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabOn]}><Text style={[styles.tabText, tab === value && styles.tabTextOn]}>{value === 'nearby' ? 'Nearby' : `Saved${savedTrails.length ? ` (${savedTrails.length})` : ''}`}</Text></Pressable>)}
    </View>

    {tab === 'nearby' ? <>
      {busy ? <View style={styles.state}><ActivityIndicator color={colors.activityNav} /><Text style={styles.muted}>{busy === 'place' ? 'Finding that place…' : busy === 'location' ? 'Finding your location…' : `Looking for trails within ${radius} miles…`}</Text></View>
        : error ? <View style={styles.state}><Text style={styles.errorText}>{error}</Text></View>
        : !origin ? <View style={styles.state}><Text style={styles.muted}>Search a town, park or ZIP code, or use your location, to see hiking trails nearby.</Text></View>
        : !results?.length ? <View style={styles.state}><Text style={styles.muted}>No trails found within {radius} miles of {origin.label}. Try a wider radius.</Text></View>
        : <>
          <Text style={styles.muted}>{results.length} {results.length === 1 ? 'place' : 'places'} within {radius} miles of {origin.label}</Text>
          <View style={styles.list}>{results.map(row)}</View>
        </>}
    </> : saved.length ? <>
      <Text style={styles.muted}>★ favorites stay at the top. Hold a saved trail to remove it.</Text>
      <View style={styles.list}>{saved.map(row)}</View>
    </> : <View style={styles.state}><Text style={styles.muted}>Trails you save show up here. Star the ones you want to visit again.</Text></View>}

    <Text style={styles.footnote}>Trail data © OpenStreetMap contributors. Distances are straight-line from where you searched; check conditions and access before you go.</Text>

    <Modal visible={!!details} transparent animationType="slide" onRequestClose={() => setDetails(undefined)}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={() => setDetails(undefined)} style={StyleSheet.absoluteFill} />
        {details && <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{details.name}</Text>
          <Text style={styles.muted}>{trailKindLabel(details.kind)}{detailMiles !== undefined ? ` · ${detailMiles} mi away` : ''}</Text>
          <View style={styles.facts}>
            {details.lengthMiles ? <Fact label="Length" value={`${details.lengthMiles} mi`} /> : null}
            {details.difficulty ? <Fact label="Difficulty" value={details.difficulty} /> : null}
            {details.surface ? <Fact label="Surface" value={details.surface} /> : null}
            {details.operator ? <Fact label="Managed by" value={details.operator} /> : null}
            {details.address ? <Fact label="Address" value={details.address} /> : null}
            <Fact label="Location" value={`${details.latitude.toFixed(5)}, ${details.longitude.toFixed(5)}`} />
          </View>
          <Pressable accessibilityRole="button" onPress={() => openDirections(details)} style={styles.bigButton}><Text style={styles.bigButtonText}>Directions in Google Maps</Text></Pressable>
          <View style={styles.sheetRow}>
            <Pressable accessibilityRole="button" onPress={() => toggleSaved(details)} style={[styles.sheetButton]}><Text style={styles.smallButtonText}>{detailItem ? 'Saved ✓' : 'Save'}</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => toggleFavoriteTrailPlace(details)} style={[styles.sheetButton, detailItem?.favorite && styles.favoriteOn]}><Text style={[styles.smallButtonText, detailItem?.favorite && styles.starOn]}>{detailItem?.favorite ? '★ Favorite' : '☆ Favorite'}</Text></Pressable>
          </View>
        </SafeAreaView>}
      </View>
    </Modal>
  </ScrollView></SafeAreaView>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.factLabel}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 60, gap: spacing.md },
  title: { color: colors.text, fontSize: 27, fontFamily: font.bold },
  searchRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 48, color: colors.text, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 13, paddingHorizontal: 14, fontSize: 16, fontFamily: font.regular },
  searchButton: { minHeight: 48, paddingHorizontal: 16, borderRadius: 13, backgroundColor: colors.activityNav, alignItems: 'center', justifyContent: 'center' },
  locationButton: { minHeight: 44, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  locationOn: { borderColor: colors.success },
  locationDot: { width: 10, height: 10, borderRadius: 5 },
  locationState: { marginLeft: 'auto', color: colors.textMuted, fontSize: 12, fontFamily: font.semibold },
  disabled: { opacity: 0.5 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { flex: 1, minHeight: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { borderColor: colors.activityNav, backgroundColor: `${colors.activityNav}22` },
  chipText: { color: colors.textMuted, fontSize: 13, fontFamily: font.semibold },
  chipTextOn: { color: colors.text },
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabOn: { borderBottomColor: colors.activityNav },
  tabText: { color: colors.textMuted, fontSize: 15, fontFamily: font.semibold },
  tabTextOn: { color: colors.text },
  state: { paddingVertical: 28, alignItems: 'center', gap: 10 },
  muted: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, lineHeight: 18 },
  errorText: { color: colors.danger, fontSize: 14, fontFamily: font.regular, lineHeight: 20, textAlign: 'center' },
  list: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, paddingHorizontal: spacing.md },
  row: { paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowMain: { gap: 3 },
  rowTitle: { color: colors.text, fontSize: 16, fontFamily: font.semibold },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { color: colors.text, fontSize: 13, fontFamily: font.semibold },
  primarySmall: { backgroundColor: colors.activityNav, borderColor: colors.activityNav },
  primarySmallText: { color: colors.background, fontSize: 13, fontFamily: font.bold },
  starButton: { marginLeft: 'auto', width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  star: { color: colors.textMuted, fontSize: 22 },
  starOn: { color: '#F2C94C' },
  footnote: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000A' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 10 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.textDim, alignSelf: 'center', marginBottom: 6 },
  sheetTitle: { color: colors.text, fontSize: 20, fontFamily: font.bold },
  facts: { gap: 8, marginTop: 4 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular },
  factValue: { color: colors.text, fontSize: 13, fontFamily: font.semibold, flexShrink: 1, textAlign: 'right' },
  bigButton: { minHeight: 50, borderRadius: 14, backgroundColor: colors.activityNav, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  bigButtonText: { color: colors.background, fontSize: 15, fontFamily: font.bold },
  sheetRow: { flexDirection: 'row', gap: 10 },
  sheetButton: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  favoriteOn: { borderColor: '#F2C94C' },
});
