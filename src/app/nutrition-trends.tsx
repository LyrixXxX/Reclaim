import { useFocusEffect } from 'expo-router';
import { ReactNode, useCallback, useMemo, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NutritionBalanceRing, NutritionReportChart, ReportChartPoint } from '@/components/nutrition-report-chart';
import { RangeSelector } from '@/components/range-selector';
import { NutritionMetric } from '@/lib/nutrition';
import { buildNutritionReport, MacroMode, macroColors, macroShare, ReportRange, ReportSummary, reportNumber, reportValue } from '@/lib/nutrition-report';
import { useTrackers } from '@/state/tracker-context';
import { colors, layout, spacing } from '@/theme';

const macros = [{ metric: 'carbs', name: 'Carbs' }, { metric: 'protein', name: 'Protein' }, { metric: 'fat', name: 'Fat' }] as const;
export default function NutritionTrendsScreen() {
  const { nutritionEntries = [], nutritionGoals = [], nutritionMealGroups = [], activityRoutes = [], preferences } = useTrackers();
  const [range, setRange] = useState<ReportRange>('week');
  const [offset, setOffset] = useState(0);
  const [mode, setMode] = useState<MacroMode>('grams');
  const [now, setNow] = useState(() => new Date());
  useFocusEffect(useCallback(() => {
    const refresh = () => setNow(new Date());
    refresh();
    const timer = setInterval(refresh, 30000);
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') refresh(); });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []));
  const report = useMemo(() => buildNutritionReport(nutritionEntries, nutritionGoals, nutritionMealGroups, range, offset, now, activityRoutes, preferences?.includeRouteCaloriesInNutrition ?? false), [nutritionEntries, nutritionGoals, nutritionMealGroups, range, offset, now, activityRoutes, preferences?.includeRouteCaloriesInNutrition]);
  const toPoints = (metric: NutritionMetric, selectedMode: MacroMode = 'grams', meals = false): ReportChartPoint[] => report.points.map((point) => ({
    key: point.key, label: point.label, detail: point.detail, value: reportValue(point.average, metric, selectedMode), goal: meals ? null : reportValue(point.goals, metric, selectedMode),
    status: point.state === 'today' ? (range === 'year' || range === 'all' ? `Date bucket to date · includes today · ${point.loggedDays}/${point.elapsedDays} days logged` : point.average ? 'Today' : 'Today · no food logged yet') : point.state === 'future' ? 'Future date' : !point.average ? 'No data' : selectedMode === 'percent' && metric !== 'fiber' && metric !== 'calories' && macroShare(point.average, metric) === null ? 'No macro calories recorded' : range === 'year' || range === 'all' ? `${point.loggedDays} of ${point.elapsedDays} elapsed days logged` : '',
    segments: meals ? report.mealGroups.map((group) => ({ ...group, value: point.meals[group.id] ?? 0 })) : undefined,
  }));
  const parts = macros.map(({ metric, name }) => ({ label: name, color: macroColors[metric], percent: macroShare(report.summary.average, metric) }));
  const periodKey = `${range}-${offset}`;
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
    <Text style={styles.eyebrow}>YOUR NUTRITION, OVER TIME</Text>
    <View style={styles.ranges}><RangeSelector options={[{ value: 'week', label: '7 day' }, { value: 'month', label: '30 day' }, { value: 'year', label: '365 day' }, { value: 'all', label: 'All' }]} value={range} onChange={(value) => { setRange(value); setOffset(0); }} accent={colors.nutritionNav} /></View>
    <View style={styles.navigation}>{range !== 'all' && <Pressable accessibilityRole="button" accessibilityLabel="Previous period" onPress={() => setOffset((value) => value - 1)} style={styles.arrow}><Text style={styles.arrowText}>‹</Text></Pressable>}<Text style={styles.period}>{report.label}</Text>{range !== 'all' && <Pressable accessibilityRole="button" accessibilityLabel="Next period" accessibilityState={{ disabled: offset === 0 }} disabled={offset === 0} onPress={() => setOffset((value) => Math.min(0, value + 1))} style={[styles.arrow, offset === 0 && styles.disabled]}><Text style={styles.arrowText}>›</Text></Pressable>}</View>
    <Text style={styles.explanation}>Charts update as you log, including today. Summary averages and comparisons use completed days through yesterday. Missing days are not zero; a logged day may contain only some of your meals.</Text>
    {report.isCurrent && <View style={styles.today}><Text style={styles.eyebrow}>TODAY</Text><Text style={styles.todayCalories}>{report.today.entryCount ? `${reportNumber(report.today.calories, 0)} kcal` : 'No food logged today'}</Text>{report.today.entryCount > 0 && <Text style={styles.description}>{reportNumber(report.today.carbsGrams)}g carbs · {reportNumber(report.today.proteinGrams)}g protein · {reportNumber(report.today.fatGrams)}g fat · {reportNumber(report.today.fiberGrams)}g fiber</Text>}</View>}
    <Card title="Nutrition overview" description={`${report.summary.loggedDays} of ${report.summary.elapsedDays} elapsed days logged`}>
      <View style={styles.balance}><NutritionBalanceRing parts={parts} /><View style={styles.balanceLegend}>{parts.map((part, index) => <View key={part.label} style={styles.balanceRow}><Text style={[styles.legendName, { color: part.color }]}>{part.label}</Text><Text style={styles.legendValue}>{reportNumber(part.percent, 0)}{part.percent !== null ? '%' : ''}</Text><Text style={styles.description}>{reportNumber(reportValue(report.summary.average, macros[index].metric))} g/day</Text></View>)}</View></View>
      <View style={styles.overviewFooter}><Text style={styles.description}>Average daily calories</Text><Text style={[styles.average, { color: colors.nutritionCalories }]}>{reportNumber(report.summary.average?.calories ?? null, 0)} <Text style={styles.unit}>kcal</Text></Text></View>
      <Text style={styles.note}>Macro balance uses carbs × 4, protein × 4, fat × 9. Fiber is tracked separately. Entered or label calories are preserved and may differ from this calculation.</Text>
    </Card>
    <Card title="Calories vs. goal" description={range === 'year' || range === 'all' ? 'Average intake and goals for the same logged days in each date bucket.' : 'Daily intake alongside your dated calorie goals.'}>
      <Summary current={report.summary} previous={report.previous} metric="calories" mode="grams" unit="kcal" color={colors.nutritionCalories} />
      <NutritionReportChart key={`${periodKey}-calories`} points={toPoints('calories')} range={range} color={colors.nutritionCalories} unit="kcal" kind="line" />
    </Card>
    <Card title="Meal calories" description={range === 'year' || range === 'all' ? 'Average daily calories from each meal, by date bucket.' : 'How your logged calories are distributed across meals.'}>
      <NutritionReportChart key={`${periodKey}-meals`} points={toPoints('calories', 'grams', true)} range={range} color={colors.nutritionNav} unit="kcal" kind="stacked" />
      <View style={styles.mealLegend}>{report.mealGroups.map((group) => <Text key={group.id} style={[styles.mealName, { color: group.color }]}>● {group.name}</Text>)}</View>
    </Card>
    <Text style={styles.section}>Macro trends</Text><RangeSelector options={[{ value: 'grams', label: 'Grams' }, { value: 'percent', label: '% of macro calories' }]} value={mode} onChange={setMode} accent={colors.nutritionNav} />
    {macros.map(({ metric, name }) => <Card key={metric} title={name} description={mode === 'grams' ? `${range === 'year' || range === 'all' ? 'Bucket average daily' : 'Daily'} ${name.toLowerCase()} intake in grams.` : `Share of macro calories from ${name.toLowerCase()}.`}>
      <Summary current={report.summary} previous={report.previous} metric={metric} mode={mode} unit={mode === 'grams' ? 'g' : '%'} color={macroColors[metric]} />
      <NutritionReportChart key={`${periodKey}-${metric}-${mode}`} points={toPoints(metric, mode)} range={range} color={macroColors[metric]} unit={mode === 'grams' ? 'g' : '%'} />
    </Card>)}
    <Card title="Fiber" description={range === 'year' || range === 'all' ? 'Average daily fiber and goal by date bucket, in grams.' : 'Daily fiber intake and your fiber goal, in grams.'}>
      <Summary current={report.summary} previous={report.previous} metric="fiber" mode="grams" unit="g" color={macroColors.fiber} />
      <NutritionReportChart key={`${periodKey}-fiber`} points={toPoints('fiber')} range={range} color={macroColors.fiber} unit="g" />
    </Card>
    <Text style={styles.note}>Comparisons: {report.previousLabel}. {report.isCurrent ? 'Only the equivalent elapsed portion of the previous period is used.' : 'Compared with the previous full period.'} Changes describe your records, not a health assessment.</Text>
  </ScrollView></SafeAreaView>;
}
function Card({ title, description, children }: { title: string; description: string; children: ReactNode }) { return <View style={styles.card}><Text style={styles.cardTitle}>{title}</Text><Text style={styles.description}>{description}</Text>{children}</View>; }
function Summary({ current, previous, metric, mode, unit, color }: { current: ReportSummary; previous: ReportSummary; metric: NutritionMetric; mode: MacroMode; unit: string; color: string }) {
  const value = reportValue(current.average, metric, mode), before = reportValue(previous.average, metric, mode);
  const difference = value !== null && before !== null ? value - before : null;
  return <View style={styles.summary}><Text style={[styles.average, { color }]}>{reportNumber(value, metric === 'calories' ? 0 : 1)} <Text style={styles.unit}>{unit} average</Text></Text>
    {difference !== null && <Text style={styles.comparison}>{difference > 0 ? '+' : difference < 0 ? '−' : ''}{reportNumber(Math.abs(difference))} {mode === 'percent' ? 'percentage points' : unit} vs. previous</Text>}
    <Text style={styles.note}>{current.loggedDays}/{current.elapsedDays} days logged{difference !== null ? ` · Previous ${previous.loggedDays}/${previous.elapsedDays}` : ''}</Text>
  </View>;
}
const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background }, content: { width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', padding: spacing.lg, paddingBottom: 44 }, eyebrow: { color: colors.nutritionNav, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 }, title: { color: colors.text, fontSize: 30, fontWeight: '900', marginTop: 8 }, ranges: { marginTop: 20 }, navigation: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 }, arrow: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, arrowText: { color: colors.text, fontSize: 28 }, period: { color: colors.text, fontSize: 15, fontWeight: '800', flex: 1, textAlign: 'center' }, disabled: { opacity: .3 }, explanation: { color: colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 12 }, today: { backgroundColor: '#211B31', borderRadius: 16, padding: 16, marginTop: 18 }, todayCalories: { color: colors.nutritionCalories, fontSize: 21, fontWeight: '800', marginTop: 8 }, card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: layout.radius, padding: 16, marginTop: 18 }, cardTitle: { color: colors.text, fontSize: 19, fontWeight: '900', marginBottom: 6 }, description: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }, balance: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 }, balanceLegend: { flex: 1, minWidth: 108 }, balanceRow: { marginBottom: 9 }, legendName: { fontSize: 12, fontWeight: '800' }, legendValue: { color: colors.text, fontSize: 19, fontWeight: '900' }, overviewFooter: { borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 13, marginTop: 12 }, average: { fontSize: 25, fontWeight: '900' }, unit: { fontSize: 12, color: colors.textMuted, fontWeight: '600' }, note: { fontSize: 10, color: colors.textMuted, lineHeight: 16, marginTop: 8 }, summary: { marginTop: 14 }, comparison: { color: colors.text, fontSize: 12, marginTop: 5 }, mealLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 13 }, mealName: { fontSize: 12, flexShrink: 1 }, section: { color: colors.text, fontSize: 20, fontWeight: '900', marginTop: 24, marginBottom: 12 } });
