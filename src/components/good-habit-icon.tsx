import { Image, ImageSourcePropType, StyleProp, ImageStyle } from 'react-native';
import { Tracker } from '@/models/tracker';

const images: Record<NonNullable<Tracker['habitTemplate']>, ImageSourcePropType> = {
  water: require('../../assets/good-habits/water.png'),
  walk: require('../../assets/good-habits/walk.png'),
  sleep: require('../../assets/good-habits/sleep.png'),
  exercise: require('../../assets/good-habits/exercise.png'),
  reading: require('../../assets/good-habits/reading.png'),
  mindfulness: require('../../assets/good-habits/mindfulness.png'),
  dental: require('../../assets/good-habits/dental.png'),
};

export function GoodHabitIcon({ type, size = 48, style }: { type: NonNullable<Tracker['habitTemplate']>; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image accessibilityLabel={`${type} habit icon`} source={images[type]} resizeMode="contain" style={[{ width: size, height: size, borderRadius: size * 0.2 }, style]} />;
}
