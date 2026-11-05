import { Camera, GeoJSONSource, Layer, Map, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { rasterMapStyle } from '@/lib/activity-map-style';
import { getMapKey } from '@/lib/activity-maps';
import { TrailPhoto, trailPhoto, TrailResult } from '@/lib/trails';
import { colors, font } from '@/theme';

type MediaTrail = Pick<TrailResult, 'id' | 'name' | 'latitude' | 'longitude' | 'wikidata' | 'wikipedia'>;

// Lookups are kept for the session, so reopening a trail doesn't fetch again.
const photoCache = new globalThis.Map<string, TrailPhoto | null>();
let styleCache: StyleSpecification | null | undefined;

/** The trail's spot on the map, plus a freely licensed photo when its map entry links to one. */
export function TrailMedia({ trail }: { trail: MediaTrail }) {
  const [mapStyle, setMapStyle] = useState<StyleSpecification | null | undefined>(styleCache);
  const [photo, setPhoto] = useState<TrailPhoto | null | undefined>(photoCache.get(trail.id));

  useEffect(() => {
    let alive = true;
    if (styleCache === undefined) void getMapKey().then((key) => { styleCache = key ? rasterMapStyle(key) : null; if (alive) setMapStyle(styleCache); }).catch(() => undefined);
    if (!photoCache.has(trail.id) && (trail.wikidata || trail.wikipedia)) {
      void trailPhoto(trail).catch(() => null).then((found) => { photoCache.set(trail.id, found); if (alive) setPhoto(found); });
    }
    return () => { alive = false; };
  }, [trail]);

  const pin = { type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [trail.longitude, trail.latitude] } };
  return <View style={styles.wrap}>
    {photo && <View>
      <Image accessibilityLabel={`Photo of ${trail.name}`} source={{ uri: photo.url }} resizeMode="cover" style={[styles.photo, { aspectRatio: photo.width && photo.height ? Math.max(1.2, Math.min(2, photo.width / photo.height)) : 1.6 }]} />
      <Pressable accessibilityRole="link" accessibilityLabel={`Photo credit: ${photo.credit}${photo.license ? `, ${photo.license}` : ''}. Open on Wikimedia Commons`} onPress={() => void Linking.openURL(photo.sourceUrl).catch(() => undefined)}>
        <Text style={styles.credit} numberOfLines={2}>Photo: {photo.credit}{photo.license ? ` · ${photo.license}` : ''} · Wikimedia Commons</Text>
      </Pressable>
    </View>}
    {mapStyle && <View pointerEvents="none" style={styles.map}>
      <Map androidView="texture" style={StyleSheet.absoluteFill} mapStyle={mapStyle} dragPan={false} touchZoom={false} doubleTapZoom={false} touchRotate={false} touchPitch={false}>
        <Camera initialViewState={{ center: [trail.longitude, trail.latitude], zoom: 14 }} />
        <GeoJSONSource id="trail-pin" data={pin}>
          <Layer id="trail-pin-ring" type="circle" paint={{ 'circle-radius': 11, 'circle-color': '#FFFFFF' }} />
          <Layer id="trail-pin-dot" type="circle" paint={{ 'circle-radius': 7, 'circle-color': colors.activityNav }} />
        </GeoJSONSource>
      </Map>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  photo: { width: '100%', borderRadius: 14, backgroundColor: colors.surfaceRaised },
  credit: { color: colors.textDim, fontSize: 11, fontFamily: font.regular, marginTop: 4 },
  map: { height: 150, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.surfaceRaised },
});
