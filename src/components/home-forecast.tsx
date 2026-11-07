import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useFocusEffect } from 'expo-router';

import { getRouteForecast, type RouteForecast } from '@/lib/route-weather';
import { colors, font, radius } from '@/theme';

/**
 * Today's NWS forecast on Home. Only uses location the app already has permission for,
 * never asks for it here, and prefers the phone's last known position.
 */
export function HomeForecast() {
  const [forecast, setForecast] = useState<Extract<RouteForecast, { status: 'ready' }>>();
  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void (async () => {
      try {
        const permission = await Location.getForegroundPermissionsAsync();
        if (!permission.granted) return;
        const position = await Location.getLastKnownPositionAsync({ maxAge: 3 * 3_600_000 })
          ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
        if (!position || cancelled) return;
        const result = await getRouteForecast(position.coords.latitude, position.coords.longitude);
        if (!cancelled && result.status === 'ready') setForecast(result);
      } catch { /* Weather is a nice-to-have; Home works without it. */ }
    })();
    return () => { cancelled = true; };
  }, []));
  if (!forecast) return null;
  return <View accessible accessibilityLabel={`Forecast for ${forecast.area}: ${forecast.temperature} degrees, ${forecast.condition}`} style={styles.card}>
    <Text style={styles.symbol} accessible={false}>{forecast.symbol}</Text>
    <View style={{ flex: 1 }}>
      <Text style={styles.temp}>{forecast.temperature}°{forecast.unit} <Text style={styles.condition}>· {forecast.condition}</Text></Text>
      <Text style={styles.area} numberOfLines={1}>{forecast.area} · NWS</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingHorizontal: 16, paddingVertical: 12 },
  symbol: { fontSize: 26 },
  temp: { color: colors.text, fontSize: 17, fontFamily: font.bold },
  condition: { color: colors.textMuted, fontSize: 14, fontFamily: font.medium },
  area: { color: colors.textMuted, fontSize: 12, fontFamily: font.regular, marginTop: 2 },
});
