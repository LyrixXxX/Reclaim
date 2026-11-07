const { readFileSync } = jest.requireActual<{ readFileSync: (path: string, encoding: string) => string }>('node:fs');

const screen = (name: string) => readFileSync(`src/app/(tabs)/${name}.tsx`, 'utf8');

describe('daily action layout contracts', () => {
  test('nutrition leads with rings, then Add Food, navigation, nutrients, and meals', () => {
    const source = screen('nutrition');
    const markers = ['<MainScreenHeader', 'style={styles.dateRow}', '{!goal ?', 'accessibilityLabel="Add Food"', '<NutritionNavigation date={date}', '{visibleAdditional.length > 0', '>Meals</Text>'];
    for (let index = 1; index < markers.length; index++) expect(source.indexOf(markers[index])).toBeGreaterThan(source.indexOf(markers[index - 1]));
    expect(source).not.toContain('DAILY NUTRITION');
    // Add Food and each meal's + open quick add, which offers manual, describe and scan.
    expect(source).toContain("pathname: '/nutrition-add', params: { date }");
    expect(source).toContain("pathname: '/nutrition-add', params: { date, meal: group.id }");
    const quickAdd = readFileSync('src/app/nutrition-add.tsx', 'utf8');
    expect(quickAdd).toContain("captureOnOpen: 'camera'");
    for (const mode of ['text', 'label', 'manual']) expect(quickAdd).toContain(`openEntry('${mode}'`);
  });
});
