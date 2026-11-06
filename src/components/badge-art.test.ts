import { badgeImages } from './badge-art';

describe('badge art', () => {
  const growth = badgeImages();

  test('each good habit uses its own six images', () => {
    const sets = (['water', 'walk', 'reading', 'sleep', 'produce', 'mindfulness', 'dental'] as const).map((habitTemplate) => badgeImages({ habitTemplate }));
    for (const images of sets) {
      expect(images).toHaveLength(6);
      expect(images).not.toBe(growth);
    }
    expect(new Set(sets).size).toBe(sets.length);
  });

  test('everything else keeps the growth badges', () => {
    expect(growth).toHaveLength(6);
    expect(badgeImages({ habitTemplate: 'exercise' })).toBe(growth);
    expect(badgeImages({})).toBe(growth);
  });
});
