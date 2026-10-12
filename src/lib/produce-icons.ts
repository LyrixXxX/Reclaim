export const PRODUCE_EXAMPLES = [
  { key: 'apple', name: 'Apple', category: 'fruit' }, { key: 'banana', name: 'Banana', category: 'fruit' },
  { key: 'berries', name: 'Berries', category: 'fruit' }, { key: 'orange', name: 'Orange', category: 'fruit' },
  { key: 'grapes', name: 'Grapes', category: 'fruit' }, { key: 'watermelon', name: 'Watermelon', category: 'fruit' },
  { key: 'pineapple', name: 'Pineapple', category: 'fruit' }, { key: 'mango', name: 'Mango', category: 'fruit' },
  { key: 'strawberry', name: 'Strawberry', category: 'fruit' }, { key: 'blueberry', name: 'Blueberry', category: 'fruit' },
  { key: 'raspberry', name: 'Raspberry', category: 'fruit' }, { key: 'peach', name: 'Peach', category: 'fruit' },
  { key: 'cherry', name: 'Cherry', category: 'fruit' }, { key: 'kiwi', name: 'Kiwi', category: 'fruit' },
  { key: 'grapefruit', name: 'Grapefruit', category: 'fruit' }, { key: 'mixed-fruit', name: 'Mixed fruit', category: 'fruit' },
  { key: 'broccoli', name: 'Broccoli', category: 'vegetable' }, { key: 'carrot', name: 'Carrot', category: 'vegetable' },
  { key: 'spinach', name: 'Spinach', category: 'vegetable' }, { key: 'lettuce', name: 'Lettuce', category: 'vegetable' },
  { key: 'tomato', name: 'Tomato', category: 'vegetable' }, { key: 'bell-pepper', name: 'Bell pepper', category: 'vegetable' },
  { key: 'yellow-pepper', name: 'Yellow pepper', category: 'vegetable' }, { key: 'cucumber', name: 'Cucumber', category: 'vegetable' },
  { key: 'kale', name: 'Kale', category: 'vegetable' }, { key: 'green-beans', name: 'Green beans', category: 'vegetable' },
  { key: 'asparagus', name: 'Asparagus', category: 'vegetable' }, { key: 'cauliflower', name: 'Cauliflower', category: 'vegetable' },
  { key: 'zucchini', name: 'Zucchini', category: 'vegetable' }, { key: 'onion', name: 'Onion', category: 'vegetable' },
  { key: 'mushroom', name: 'Mushroom', category: 'vegetable' }, { key: 'sweet-potato', name: 'Sweet potato', category: 'vegetable' },
] as const;
export type ProduceIconKey = typeof PRODUCE_EXAMPLES[number]['key'];
export const produceIconsForCategory = (category: 'fruit' | 'vegetable') => PRODUCE_EXAMPLES.filter((item) => item.category === category);

export function recognizedProduceIcon(name: string, category?: 'fruit' | 'vegetable') {
  const lower = name.toLowerCase();
  const matches = PRODUCE_EXAMPLES.filter((item) => (!category || item.category === category) && (lower.includes(item.name.toLowerCase()) || lower.includes(item.key.replace(/-/g, ' '))));
  return matches.length === 1 ? matches[0].key : undefined;
}
