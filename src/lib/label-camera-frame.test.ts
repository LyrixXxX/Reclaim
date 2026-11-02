import { frameCrop, labelFrame } from './label-camera-frame';

test('tall and wide guides remain centered and inside the preview', () => {
  for (const shape of ['tall', 'wide'] as const) {
    const frame = labelFrame({ width: 360, height: 600 }, shape);
    expect(frame.x).toBeGreaterThan(0);
    expect(frame.y).toBeGreaterThan(0);
    expect(frame.x + frame.width).toBeLessThan(360);
    expect(frame.y + frame.height).toBeLessThan(600);
  }
  expect(labelFrame({ width: 360, height: 600 }, 'tall').height).toBeGreaterThan(labelFrame({ width: 360, height: 600 }, 'wide').height);
});

test('maps a framed guide to a portrait camera photo', () => {
  const preview = { width: 360, height: 600 };
  const crop = frameCrop({ width: 1080, height: 1800 }, preview, labelFrame(preview, 'tall'));
  expect(crop.originX).toBeGreaterThan(0);
  expect(crop.originY).toBeGreaterThan(0);
  expect(crop.width).toBeLessThan(1080);
  expect(crop.height).toBeLessThan(1800);
});

test('accounts for a photo whose aspect ratio differs from the preview', () => {
  const preview = { width: 360, height: 600 };
  const crop = frameCrop({ width: 1200, height: 1600 }, preview, labelFrame(preview, 'wide'));
  expect(crop.originX).toBeGreaterThan(0);
  expect(crop.originY).toBeGreaterThanOrEqual(0);
  expect(crop.originX + crop.width).toBeLessThanOrEqual(1200);
  expect(crop.originY + crop.height).toBeLessThanOrEqual(1600);
});

test('does not crop before the preview has a valid size', () => {
  expect(() => frameCrop({ width: 1200, height: 1600 }, { width: 0, height: 0 }, { x: 0, y: 0, width: 100, height: 100 })).toThrow();
});
