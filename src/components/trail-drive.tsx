import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { getMapKey } from '@/lib/activity-maps';
import { DriveRoute, driveLabel, drivingRoute } from '@/lib/trails';
import { colors, font } from '@/theme';

type Point = { latitude: number; longitude: number };

// Each lookup uses paid credits, so one trail is only looked up once per session from about the same place.
const routes = new Map<string, DriveRoute | null>();
const routeKey = (from: Point, to: Point) => [from.latitude, from.longitude, to.latitude, to.longitude].map((value) => value.toFixed(2)).join(',');

/**
 * The real drive to a trail, from where you are now, not the place you searched. Shows nothing when
 * your location isn't allowed or the lookup fails: the straight-line distance is still on screen.
 */
export function TrailDrive({ to, from }: { to: Point; from?: Point }) {
  const [route, setRoute] = useState<DriveRoute | null | undefined>();

  useEffect(() => {
    let alive = true;
    const show = (found: DriveRoute | null) => { if (alive) setRoute(found); };
    void (async () => {
      let start = from;
      if (!start) {
        // Never asks for permission here: it only uses access you've already given.
        const permission = await Location.getForegroundPermissionsAsync();
        const last = permission.granted ? await Location.getLastKnownPositionAsync() : null;
        start = last?.coords;
      }
      if (!start) { show(null); return; }
      const key = routeKey(start, to);
      if (routes.has(key)) { show(routes.get(key) ?? null); return; }
      const found = await drivingRoute(start, to, await getMapKey());
      routes.set(key, found);
      show(found);
    })().catch(() => show(null));
    return () => { alive = false; };
  }, [from, to]);

  if (route === null) return null;
  return <Text style={route ? styles.drive : styles.finding}>{route ? driveLabel(route) : 'Finding the drive…'}</Text>;
}

const styles = StyleSheet.create({
  drive: { color: colors.text, fontSize: 15, fontFamily: font.semibold },
  finding: { color: colors.textMuted, fontSize: 13, fontFamily: font.regular },
});
