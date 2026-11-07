import { Camera, GeoJSONSource, Layer, Map, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { rasterMapStyle } from '@/lib/activity-map-style';
import { getMapKey } from '@/lib/activity-maps';
import { decodeTrailPath, nearbyTrailPhoto, TRAIL_USER_AGENT, TrailPhoto, trailPhoto, TrailResult } from '@/lib/trails';
import { colors, font } from '@/theme';

type MediaTrail = Pick<TrailResult, 'id' | 'name' | 'latitude' | 'longitude' | 'wikidata' | 'wikipedia' | 'path' | 'parking'>;

// Lookups are kept for the session, so reopening a trail doesn't fetch again.
const photoCache = new globalThis.Map<string, TrailPhoto | null>();
let styleCache: StyleSpecification | null | undefined;

/** The trail drawn on a map, or its spot when its shape isn't known, plus a freely licensed photo when one is found. */
export function TrailMedia({ trail }: { trail: MediaTrail }) {
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null | undefined>(styleCache);
  const [photo, setPhoto] = useState<TrailPhoto | null | undefined>(photoCache.get(trail.id));

  useEffect(() => {
    let alive = true;
    if (styleCache === undefined) void getMapKey().then((key) => { styleCache = key ? rasterMapStyle(key) : null; if (alive) setMapStyle(styleCache); }).catch(() => undefined);
    if (!photoCache.has(trail.id)) {
      void trailPhoto(trail).catch(() => null).then((linked) => linked ?? nearbyTrailPhoto(trail).catch(() => null)).then((found) => { photoCache.set(trail.id, found); if (alive) setPhoto(found); });
    }
    return () => { alive = false; };
  }, [trail]);

  const lines = useMemo(() => decodeTrailPath(trail.path), [trail.path]);
  const shape = lines.length ? { type: 'Feature' as const, properties: {}, geometry: { type: 'MultiLineString' as const, coordinates: lines } } : null;
  const view = useMemo(() => {
    const points = lines.flat();
    if (!points.length) return { center: [trail.longitude, trail.latitude] as [number, number], zoom: 14 };
    const longitudes = points.map((point) => point[0]);
    const latitudes = points.map((point) => point[1]);
    return { bounds: [Math.min(...longitudes), Math.min(...latitudes), Math.max(...longitudes), Math.max(...latitudes)] as [number, number, number, number], padding: { top: 24, right: 24, bottom: 24, left: 24 } };
  }, [lines, trail.latitude, trail.longitude]);
  const pin = { type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [trail.longitude, trail.latitude] } };
  const parking = trail.parking ? { type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [trail.parking.longitude, trail.parking.latitude] } } : null;
  return <View style={styles.wrap}>
    {photo && <View>
      {/* Wikimedia refuses Android's default image User-Agent with a 403, which leaves the photo blank. */}
      <Image accessibilityLabel={`Photo of ${trail.name}`} source={{ uri: photo.url, headers: { 'User-Agent': TRAIL_USER_AGENT } }} resizeMode="cover" style={[styles.photo, { aspectRatio: photo.width && photo.height ? Math.max(1.2, Math.min(2, photo.width / photo.height)) : 1.6 }]} />
      <Pressable accessibilityRole="link" accessibilityLabel={`Photo credit: ${photo.credit}${photo.license ? `, ${photo.license}` : ''}. Open on Wikimedia Commons`} onPress={() => void Linking.openURL(photo.sourceUrl).catch(() => undefined)}>
        <Text style={styles.credit} numberOfLines={2}>Photo: {photo.credit}{photo.license ? ` · ${photo.license}` : ''} · Wikimedia Commons</Text>
      </Pressable>
    </View>}
    {mapStyle && <View pointerEvents="none" style={styles.map}>
      <Map androidView="texture" style={StyleSheet.absoluteFill} mapStyle={mapStyle} dragPan={false} touchZoom={false} doubleTapZoom={false} touchRotate={false} touchPitch={false}>
        <Camera initialViewState={view} />
        {shape ? <GeoJSONSource id="trail-shape" data={shape}>
          <Layer id="trail-shape-casing" type="line" paint={{ 'line-color': '#FFFFFF', 'line-width': 6 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
          <Layer id="trail-shape-line" type="line" paint={{ 'line-color': colors.activityNav, 'line-width': 3.5 }} layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
        </GeoJSONSource> : <GeoJSONSource id="trail-pin" data={pin}>
          <Layer id="trail-pin-ring" type="circle" paint={{ 'circle-radius': 11, 'circle-color': '#FFFFFF' }} />
          <Layer id="trail-pin-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': colors.activityNav }} />
        </GeoJSONSource>}
        {parking && <GeoJSONSource id="trail-parking" data={parking}>
          <Layer id="trail-parking-ring" type="circle" paint={{ 'circle-radius': 8, 'circle-color': '#FFFFFF' }} />
          <Layer id="trail-parking-dot" type="circle" paint={{ 'circle-radius': 5, 'circle-color': '#2F80ED' }} />
        </GeoJSONSource>}
      </Map>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  photo: { width: '100%', borderRadius: 14, backgroundColor: colors.surfaceRaised },
  credit: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 4 },
  map: { height: 180, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
});
