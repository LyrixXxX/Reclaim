import { PRODUCE_EXAMPLES, recognizedProduceIcon } from './produce-icons';

test('the icon library includes sixteen fruits and sixteen vegetables', () => {
  expect(PRODUCE_EXAMPLES.filter((item) => item.category === 'fruit')).toHaveLength(16);
  expect(PRODUCE_EXAMPLES.filter((item) => item.category === 'vegetable')).toHaveLength(16);
});

test('recognized names match a local icon while ambiguous foods stay generic', () => {
  expect(recognizedProduceIcon('Fresh apple slices')).toBe('apple');
  expect(recognizedProduceIcon('Steamed broccoli', 'vegetable')).toBe('broccoli');
  expect(recognizedProduceIcon('apple and banana smoothie')).toBeUndefined();
  expect(recognizedProduceIcon('mixed dinner plate')).toBeUndefined();
});
