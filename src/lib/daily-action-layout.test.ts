const { readFileSync } = jest.requireActual<{ readFileSync: (path: string, encoding: string) => string }>('node:fs');

const screen = (name: string) => readFileSync(`src/app/${name}.tsx`, 'utf8');

describe('daily action layout contracts', () => {
  test('CPAP capture precedes the latest-night and streak summaries', () => {
    const source = screen('cpap');
    const capture = source.indexOf('>+ Scan CPAP Screen<');
    const manual = source.indexOf('>Enter reading manually<');
    expect(capture).toBeGreaterThan(0);
    expect(manual).toBeGreaterThan(capture);
    expect(source).toContain('setCaptureOnOpen(true); setEditing(null)');
    expect(source).toContain('setCaptureOnOpen(false); setEditing(null)');
    expect(capture).toBeLessThan(source.indexOf('{latest &&'));
    expect(capture).toBeLessThan(source.indexOf('<CpapUsageStreakCard'));
  });
  test('nutrition keeps both navigation rows before the summary and preserves selected dates', () => {
    const source = screen('nutrition');
    expect(source.indexOf('>Describe Meal<')).toBeLessThan(source.indexOf('<NutritionNavigation date={date}'));
    expect(source.indexOf('<NutritionNavigation date={date}')).toBeLessThan(source.indexOf('{!goal ?'));
    for (const mode of ['text', 'label', 'manual']) expect(source).toContain(`mode: '${mode}', date`);
  });
  test('dose history starts collapsed and retains the paged editable history', () => {
    const source = screen('medications');
    expect(source).toContain('useState<Record<string, boolean>>({})');
    expect(source).toContain('{historyExpanded[item.id] && <HistoryPages');
    expect(source).toContain('accessibilityState={{ expanded: !!historyExpanded[item.id] }}');
    expect(source).toContain('setEventEditor({ medication: item, event })');
  });
  test('health hub cards navigate to their trackers and keep detailed BP reports behind recorded data', () => {
    const source = screen('health');
    expect(source).toContain("onPress={() => router.push('/medications')}");
    expect(source).toContain("onPress={() => router.push('/labs')}");
    expect(source).toContain("onPress={() => router.push('/health?detail=bloodPressure')}");
    expect(source).toContain('!!summary.readings.length &&');
    expect(source).toContain('href="/doctor-summary"');
  });
});
