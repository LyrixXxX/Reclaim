const { readFileSync } = jest.requireActual<{ readFileSync: (path: string, encoding: string) => string }>('node:fs');

const screen = (name: string) => readFileSync(`src/app/${name}.tsx`, 'utf8');

describe('daily action layout contracts', () => {
  test('nutrition keeps both navigation rows before the summary and preserves selected dates', () => {
    const source = screen('nutrition');
    expect(source.indexOf('>Describe Meal<')).toBeLessThan(source.indexOf('<NutritionNavigation date={date}'));
    expect(source.indexOf('<NutritionNavigation date={date}')).toBeLessThan(source.indexOf('{!goal ?'));
    for (const mode of ['text', 'label', 'manual']) expect(source).toContain(`mode: '${mode}', date`);
  });
});
