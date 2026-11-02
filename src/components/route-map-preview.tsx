import { Camera, GeoJSONSource, Layer, Map, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { RoutePreview } from '@/components/route-preview';
import { routeMapBounds, routeMapSegments } from '@/lib/route-map-preview';
import type { ActivityPoint } from '@/models/tracker';
import { colors } from '@/theme';

export function RouteMapPreview({ points, mapStyle, height = 150 }: {
  points: readonly ActivityPoint[];
  mapStyle: StyleSpecification | null;
  height?: number;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const bounds = useMemo(() => routeMapBounds(points), [points]);
  const line = useMemo(() => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'MultiLineString' as const, coordinates: routeMapSegments(points) },
  }), [points]);

  if (!mapStyle || !bounds || failed) return <RoutePreview points={points} height={height} />;

  return <View pointerEvents="none" style={[styles.shell, { height }]}>
    <Map androidView="texture" style={styles.map} mapStyle={mapStyle} dragPan={false} touchZoom={false} doubleTapZoom={false} touchRotate={false} touchPitch={false} onDidFinishRenderingMapFully={() => setReady(true)} onDidFailLoadingMap={() => setFailed(true)}>
      <Camera initialViewState={{ bounds, padding: { top: 14, right: 14, bottom: 26, left: 14 } }} />
      {line.geometry.coordinates.length > 0 && <GeoJSONSource id="preview-route" data={line}><Layer id="preview-route-line" type="line" paint={{ 'line-color': colors.activityNav, 'line-width': 4 }} /></GeoJSONSource>}
    </Map>
    {!ready && <View style={styles.fallback}><RoutePreview points={points} height={height} /></View>}
  </View>;
}

const styles = StyleSheet.create({
  shell: { position: 'relative', overflow: 'hidden', borderRadius: 12, backgroundColor: colors.surfaceRaised },
  map: { flex: 1 },
  fallback: { ...StyleSheet.absoluteFill },
});
