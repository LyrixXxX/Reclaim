import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TrailMedia } from '@/components/trail-media';
import { getMapKey } from '@/lib/activity-maps';
import { searchTrailDatabase } from '@/lib/trail-database';
import { combineTrails, directionsUrl, findSavedTrail, milesToPlace, searchStadiaTrails, SavedTrail, searchPlace, searchTrails, sortSavedTrails, TRAIL_RADII, TrailRadius, TrailResult, trailDifficultyLabel, trailKindLabel, trailLengthLabel, trailRowDetails } from '@/lib/trails';
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
  /** True while the slower map search may still add trails to what's shown. */
  const [findingMore, setFindingMore] = useState(false);
  const [error, setError] = useState('');
  const [details, setDetails] = useState<Place>();
  const searchId = useRef(0);

  /**
   * The trail database comes first, since it has lengths and shapes. Where it fully covers the
   * area, that's the answer. Elsewhere, two more sources run at once: Stadia answers in about a
   * second and is shown as soon as it does; the OpenStreetMap search is slower and often busy, so
   * its trails are added when (and if) it answers.
   */
  const runSearch = async (from: Origin, miles: TrailRadius) => {
    const id = ++searchId.current;
    const current = () => id === searchId.current;
    setBusy('trails'); setError(''); setOrigin(from); setTab('nearby'); setResults(undefined); setFindingMore(false);
    const database = await searchTrailDatabase(from.latitude, from.longitude, miles);
    if (!current()) return;
    if (database?.coverage === 'full') { setResults(database.trails); setBusy(undefined); return; }
    const known = database?.trails ?? [];
    setFindingMore(true);
    const more = searchTrails(from.latitude, from.longitude, miles).catch(() => null);
    const quick = await getMapKey().then((key) => searchStadiaTrails(from.latitude, from.longitude, miles, key)).catch(() => [] as TrailResult[]);
    if (!current()) return;
    if (quick.length || known.length) { setResults(combineTrails([known, quick])); setBusy(undefined); }
    const extra = await more;
    if (!current()) return;
    setFindingMore(false); setBusy(undefined);
    if (extra) setResults(combineTrails([known, quick, extra]));
    else if (!quick.length && !known.length) setError(`Trails couldn’t be loaded near ${from.label} right now. Check your connection and try again.`);
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
      // Never asks for permission here: searching a place has to work without location access.
      const permission = await Location.getForegroundPermissionsAsync();
      const last = permission.granted ? await Location.getLastKnownPositionAsync().catch(() => null) : null;
      const place = await searchPlace(query, await getMapKey(), fetch, last?.coords);
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
    setOrigin(undefined); setResults(undefined); setBusy(undefined); setFindingMore(false); setError('');
  };

  const changeRadius = (miles: TrailRadius) => {
    setRadius(miles);
    if (origin) void runSearch(origin, miles);
  };

  // Search near you on first open when location access was already given; never ask unprompted.
  useEffect(() => {
    let alive = true;
    void Location.getForegroundPermissionsAsync().then((permission) => { if (alive && permission.granted) void searchNearMe(false); });
    return () => { alive = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- runs once, on first open

  const saved = sortSavedTrails(savedTrails);
  const distanceFrom = (place: Place) => 'distanceMiles' in place ? place.distanceMiles : origin ? milesToPlace(origin, place) : undefined;
  const openDirections = (place: Place) => { void Linking.openURL(directionsUrl(place)).catch(() => Alert.alert('Directions', 'Google Maps couldn’t be opened.')); };
  const toggleSaved = (place: Place) => {
    const savedItem = findSavedTrail(savedTrails, place);
    if (savedItem) Alert.alert('Remove from saved?', `${place.name} will be removed from your saved trails.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => removeTrailPlace(savedItem.id) }]);
    else saveTrailPlace(place as TrailResult);
  };
  const toggleFavorite = (place: Place) => toggleFavoriteTrailPlace(findSavedTrail(savedTrails, place) ?? place);

  const row = (place: Place) => {
    const savedItem = findSavedTrail(savedTrails, place);
    const meta = trailRowDetails(place, distanceFrom(place));
    return <View key={place.id} style={styles.row}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${place.name}. ${meta}. Show details`} onPress={() => setDetails(place)} onLongPress={() => savedItem && toggleSaved(place)} style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.75 }]}>
        <Text style={styles.rowTitle} numberOfLines={2}>{place.name}</Text>
        <Text style={styles.rowDetails} numberOfLines={2}>{meta}</Text>
      </Pressable>
      <View style={styles.rowActions}>
        <Pressable accessibilityRole="button" accessibilityLabel={savedItem ? `Remove ${place.name} from saved` : `Save ${place.name}`} onPress={() => toggleSaved(place)} style={styles.smallButton}><Text style={styles.smallButtonText}>{savedItem ? 'Saved ✓' : 'Save'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Details for ${place.name}`} onPress={() => setDetails(place)} hitSlop={6} style={styles.detailsLink}><Text style={styles.detailsLinkText}>Details ›</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={savedItem?.favorite ? `Unfavorite ${place.name}` : `Favorite ${place.name}`} accessibilityState={{ selected: !!savedItem?.favorite }} onPress={() => toggleFavorite(place)} hitSlop={6} style={styles.starButton}><Text style={[styles.star, savedItem?.favorite && styles.starOn]}>{savedItem?.favorite ? '★' : '☆'}</Text></Pressable>
      </View>
    </View>;
  };

  const detailItem = details ? findSavedTrail(savedTrails, details) : undefined;
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
          <View style={styles.countRow}><Text style={[styles.muted, { flex: 1 }]}>{results.length} {results.length === 1 ? 'place' : 'places'} within {radius} miles of {origin.label}</Text>{findingMore && <><ActivityIndicator size="small" color={colors.activityNav} /><Text style={styles.muted}>Finding more</Text></>}</View>
          <View style={styles.list}>{results.map(row)}</View>
        </>}
    </> : saved.length ? <>
      <Text style={styles.muted}>★ favorites stay at the top. Hold a saved trail to remove it.</Text>
      <View style={styles.list}>{saved.map(row)}</View>
    </> : <View style={styles.state}><Text style={styles.muted}>Trails you save show up here. Star the ones you want to visit again.</Text></View>}

    <Text style={styles.footnote}>Trail data © OpenStreetMap contributors. Distances are straight-line from where you searched, and lengths are measured from map data, so they’re approximate. Check conditions and access before you go.</Text>

    <Modal visible={!!details} transparent animationType="slide" onRequestClose={() => setDetails(undefined)}>
      <View style={styles.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={() => setDetails(undefined)} style={StyleSheet.absoluteFill} />
        {details && <SafeAreaView edges={['bottom']} style={styles.sheet}>
          <View style={styles.handle} />
          <ScrollView contentContainerStyle={styles.sheetContent}>
            <Text style={styles.sheetTitle}>{details.name}</Text>
            <Text style={styles.muted}>{trailKindLabel(details.kind)}{detailMiles !== undefined ? ` · ${detailMiles} mi away` : ''}</Text>
            {details.lengthMiles ? <View style={styles.lengthBlock}>
              <Text style={styles.lengthValue}>{capitalize(trailLengthLabel(details.lengthMiles))}</Text>
              <Text style={styles.muted}>Measured from map data, so it can differ from trail signs. It may be one way rather than a round trip.</Text>
            </View> : null}
            <TrailMedia key={details.id} trail={details} />
            <View style={styles.facts}>
              {details.climbFt ? <Fact label="Climb" value={`${details.climbFt.toLocaleString('en-US')} ft`} /> : null}
              {details.difficulty ? <Fact label="Difficulty" value={trailDifficultyLabel(details) ?? details.difficulty} /> : null}
              {details.surface ? <Fact label="Surface" value={details.surface} /> : null}
              {details.operator ? <Fact label="Managed by" value={details.operator} /> : null}
              {details.address ? <Fact label="Address" value={details.address} /> : null}
            </View>
            <Pressable accessibilityRole="button" onPress={() => openDirections(details)} style={styles.bigButton}><Text style={styles.bigButtonText}>{details.parking ? 'Directions to parking' : 'Directions in Google Maps'}</Text></Pressable>
            <View style={styles.sheetRow}>
              <Pressable accessibilityRole="button" onPress={() => toggleSaved(details)} style={[styles.sheetButton]}><Text style={styles.smallButtonText}>{detailItem ? 'Saved ✓' : 'Save'}</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => toggleFavorite(details)} style={[styles.sheetButton, detailItem?.favorite && styles.favoriteOn]}><Text style={[styles.smallButtonText, detailItem?.favorite && styles.starOn]}>{detailItem?.favorite ? '★ Favorite' : '☆ Favorite'}</Text></Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>}
      </View>
    </Modal>
  </ScrollView></SafeAreaView>;
}

const capitalize = (text = '') => text.charAt(0).toUpperCase() + text.slice(1);

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
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  list: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, paddingHorizontal: spacing.md },
  row: { paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  rowMain: { gap: 3 },
  rowTitle: { color: colors.text, fontSize: 16, fontFamily: font.semibold },
  rowDetails: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular, lineHeight: 18 },
  detailsLink: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  detailsLinkText: { color: colors.activityNav, fontSize: 13, fontFamily: font.semibold },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallButton: { minHeight: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  smallButtonText: { color: colors.text, fontSize: 13, fontFamily: font.semibold },
  primarySmallText: { color: colors.background, fontSize: 13, fontFamily: font.bold },
  starButton: { marginLeft: 'auto', width: 40, height: 36, alignItems: 'center', justifyContent: 'center' },
  star: { color: colors.textMuted, fontSize: 22 },
  starOn: { color: '#F2C94C' },
  footnote: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, lineHeight: 16, textAlign: 'center', marginTop: 8 },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: '#000A' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 10, maxHeight: '90%' },
  sheetContent: { gap: 10, paddingBottom: 16 },
  lengthBlock: { gap: 2, marginTop: 2 },
  lengthValue: { color: colors.text, fontSize: 22, fontFamily: font.bold },
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
