import { Tracker } from '@/models/tracker';
import { addWaterShortcut, removeWaterShortcut, waterShortcuts } from './water-habit';

const water = (quick?: number, presets?: number[]) => ({ id: 'w', habitTemplate: 'water', waterQuickAddOz: quick, waterPresetOz: presets }) as unknown as Tracker;

describe('water quick-add buttons', () => {
  it('lists the main button first and drops duplicates of it', () => {
    expect(waterShortcuts(water(8, [8, 12, 12, 16]))).toEqual({ main: 8, others: [12, 16] });
    expect(waterShortcuts(water())).toEqual({ main: 8, others: [] });
  });

  it('adds a bottle size as another button', () => {
    expect(addWaterShortcut(water(8, [12]), 16.9, false)).toEqual({ waterQuickAddOz: 8, waterPresetOz: [12, 16.9] });
    expect(addWaterShortcut(water(8, [12]), 12, false)).toEqual({ waterQuickAddOz: 8, waterPresetOz: [12] });
    expect(addWaterShortcut(water(8, []), 8, false)).toEqual({ waterQuickAddOz: 8, waterPresetOz: [] });
  });

  it('makes a size the main button and keeps the old main as another button', () => {
    expect(addWaterShortcut(water(8, [12, 16.9]), 16.9, true)).toEqual({ waterQuickAddOz: 16.9, waterPresetOz: [8, 12] });
    expect(addWaterShortcut(water(8, []), 20, true)).toEqual({ waterQuickAddOz: 20, waterPresetOz: [8] });
  });

  it('keeps at most eight other buttons', () => {
    const full = water(8, [1, 2, 3, 4, 5, 6, 7, 9]);
    expect(addWaterShortcut(full, 10, false).waterPresetOz).toEqual([2, 3, 4, 5, 6, 7, 9, 10]);
    expect(addWaterShortcut(full, 10, true).waterPresetOz).toHaveLength(8);
  });

  it('removes a button', () => {
    expect(removeWaterShortcut(water(8, [12, 16.9]), 12)).toEqual({ waterQuickAddOz: 8, waterPresetOz: [16.9] });
  });
});
