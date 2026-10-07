import Svg, { Circle, Polyline } from 'react-native-svg';
import { View } from 'react-native';

import { ActivityPoint } from '@/models/tracker';
import { colors } from '@/theme';

export function routePreviewCoordinates(points: readonly ActivityPoint[], width = 320, height = 150) {
  if (!points.length) return [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.longitude); maxX = Math.max(maxX, point.longitude);
    minY = Math.min(minY, point.latitude); maxY = Math.max(maxY, point.latitude);
  }
  const spanX = Math.max(maxX - minX, 0.00001);
  const spanY = Math.max(maxY - minY, 0.00001);
  const scale = Math.min((width - 32) / spanX, (height - 32) / spanY);
  const drawnWidth = spanX * scale, drawnHeight = spanY * scale;
  return points.map((point) => ({
    x: (width - drawnWidth) / 2 + (point.longitude - minX) * scale,
    y: (height - drawnHeight) / 2 + (maxY - point.latitude) * scale,
    segment: point.segment ?? 0,
  }));
}

export function RoutePreview({ points, height = 150 }: { points: readonly ActivityPoint[]; height?: number }) {
  const coordinates = routePreviewCoordinates(points);
  const segments = new Map<number, string[]>();
  for (const point of coordinates) segments.set(point.segment, [...(segments.get(point.segment) ?? []), `${point.x},${point.y}`]);
  return <View style={{ backgroundColor: colors.surfaceRaised, borderRadius: 12, overflow: 'hidden', height }}>
    <Svg width="100%" height={height} viewBox="0 0 320 150" accessibilityLabel="Offline route path preview">
      {[...segments.entries()].map(([segment, line]) => <Polyline key={segment} points={line.join(' ')} fill="none" stroke={colors.activityNav} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />)}
      {coordinates[0] && <Circle cx={coordinates[0].x} cy={coordinates[0].y} r="5" fill="#78DE8F" />}
      {coordinates.length > 1 && <Circle cx={coordinates.at(-1)!.x} cy={coordinates.at(-1)!.y} r="5" fill="#F6AE6B" />}
    </Svg>
  </View>;
}
