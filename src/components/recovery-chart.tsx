import { useMemo, useState } from 'react';
import { LayoutChangeEvent, NativeSyntheticEvent, StyleSheet, Text, View, ViewProps } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { RecoveryPoint } from '@/lib/recovery';
import { colors, spacing } from '@/theme';

const HEIGHT = 190;
const PAD = { top: 16, right: 12, bottom: 28, left: 34 };

type Props = {
  points: RecoveryPoint[];
  color: string;
  valueLabel?: string;
  emptyMessage?: string;
};

export function RecoveryChart({ points, color, valueLabel = 'successful days', emptyMessage = 'Choose a start date to begin your recovery chart.' }: Props) {
  const [width, setWidth] = useState(300);
  const [selected, setSelected] = useState<RecoveryPoint | null>(null);
  const chartWidth = Math.max(1, width - PAD.left - PAD.right);
  const chartHeight = HEIGHT - PAD.top - PAD.bottom;
  const maxValue = Math.max(1, ...points.map((point) => point.cumulative));

  const coordinates = useMemo(() => points.map((point, index) => ({
    ...point,
    x: PAD.left + (points.length <= 1 ? chartWidth / 2 : (index / (points.length - 1)) * chartWidth),
    y: PAD.top + chartHeight - (point.cumulative / maxValue) * chartHeight,
  })), [chartHeight, chartWidth, maxValue, points]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const onTouch: ViewProps['onTouchStart'] = (event: NativeSyntheticEvent<unknown>) => {
    if (!coordinates.length) return;
    const x = (event.nativeEvent as { locationX: number }).locationX;
    const nearest = coordinates.reduce((best, point) =>
      Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best);
    setSelected(nearest);
  };

  if (!points.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Progress starts here</Text>
        <Text style={styles.emptyBody}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View onLayout={onLayout} onTouchStart={onTouch} style={styles.wrapper}>
      {selected && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipDate}>{formatDate(selected.date)}</Text>
          <Text style={styles.tooltipValue}>
            {tooltipText(selected, valueLabel)}
          </Text>
        </View>
      )}
      <Svg width="100%" height={HEIGHT}>
        {[0, 0.5, 1].map((ratio) => {
          const y = PAD.top + chartHeight - ratio * chartHeight;
          return (
            <Line
              key={ratio}
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y}
              y2={y}
              stroke={colors.border}
              strokeDasharray="3 6"
            />
          );
        })}
        <SvgText x={4} y={PAD.top + 4} fill={colors.textDim} fontSize={9}>{maxValue}</SvgText>
        <SvgText x={20} y={PAD.top + chartHeight + 3} fill={colors.textDim} fontSize={9}>0</SvgText>
        <Path
          d={coordinates.map((point, index) => point.outcome === 'no_data' ? '' : `${index && coordinates[index - 1].outcome !== 'no_data' ? 'L' : 'M'}${point.x},${point.y}`).join(' ')}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coordinates.filter((point) => !point.successful && point.outcome !== 'no_data').map((point) => (
          <Circle key={point.date} cx={point.x} cy={point.y} r={5} fill={colors.surface} stroke={color} strokeWidth={2} />
        ))}
        {selected && coordinates.find((point) => point.date === selected.date) && (
          <Circle
            cx={coordinates.find((point) => point.date === selected.date)!.x}
            cy={coordinates.find((point) => point.date === selected.date)!.y}
            r={5}
            fill={color}
            stroke={colors.text}
            strokeWidth={2}
          />
        )}
        <SvgText x={PAD.left} y={HEIGHT - 5} fill={colors.textDim} fontSize={9}>
          {formatShort(points[0].date)}
        </SvgText>
        <SvgText x={width - PAD.right} y={HEIGHT - 5} fill={colors.textDim} fontSize={9} textAnchor="end">
          {formatShort(points.at(-1)!.date)}
        </SvgText>
      </Svg>
      <Text style={styles.hint}>Touch the chart to inspect a day</Text>
    </View>
  );
}

function formatDate(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatShort(key: string) {
  return new Date(`${key}T00:00:00`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric',
  });
}

function tooltipText(point: RecoveryPoint, valueLabel: string) {
  if (point.successful) return `${point.cumulative} ${valueLabel}`;
  if (point.outcome === 'lapse') return 'Lapse recorded — progress preserved';
  if (point.outcome === 'partial') return 'Partial reduction — total unchanged';
  return 'No data / unsure — total unchanged';
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', minHeight: HEIGHT + 26 },
  tooltip: {
    position: 'absolute',
    zIndex: 2,
    top: 4,
    alignSelf: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tooltipDate: { color: colors.textDim, fontSize: 11, textAlign: 'center' },
  tooltipValue: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 2 },
  hint: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: -3 },
  empty: {
    height: HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  emptyBody: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 7 },
});
