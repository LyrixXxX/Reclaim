import { Image, StyleSheet, Text, View } from 'react-native';
import { ProduceIconKey } from '@/lib/produce-icons';
import { colors } from '@/theme';

const icons: Record<ProduceIconKey, number> = {
  apple: require('../../assets/produce/apple.png'), banana: require('../../assets/produce/banana.png'), berries: require('../../assets/produce/berries.png'), orange: require('../../assets/produce/orange.png'), grapes: require('../../assets/produce/grapes.png'), watermelon: require('../../assets/produce/watermelon.png'), pineapple: require('../../assets/produce/pineapple.png'), mango: require('../../assets/produce/mango.png'),
  strawberry: require('../../assets/produce/strawberry.png'), blueberry: require('../../assets/produce/blueberry.png'), raspberry: require('../../assets/produce/raspberry.png'), peach: require('../../assets/produce/peach.png'), cherry: require('../../assets/produce/cherry.png'), kiwi: require('../../assets/produce/kiwi.png'), grapefruit: require('../../assets/produce/grapefruit.png'), 'mixed-fruit': require('../../assets/produce/mixed-fruit.png'),
  broccoli: require('../../assets/produce/broccoli.png'), carrot: require('../../assets/produce/carrot.png'), spinach: require('../../assets/produce/spinach.png'), lettuce: require('../../assets/produce/lettuce.png'), tomato: require('../../assets/produce/tomato.png'), 'bell-pepper': require('../../assets/produce/bell-pepper.png'), 'yellow-pepper': require('../../assets/produce/yellow-pepper.png'), cucumber: require('../../assets/produce/cucumber.png'), kale: require('../../assets/produce/kale.png'), 'green-beans': require('../../assets/produce/green-beans.png'), asparagus: require('../../assets/produce/asparagus.png'), cauliflower: require('../../assets/produce/cauliflower.png'), zucchini: require('../../assets/produce/zucchini.png'), onion: require('../../assets/produce/onion.png'), mushroom: require('../../assets/produce/mushroom.png'), 'sweet-potato': require('../../assets/produce/sweet-potato.png'),
};

export function ProduceIcon({ icon, category, size = 48 }: { icon?: ProduceIconKey; category?: 'fruit' | 'vegetable'; size?: number }) {
  if (icon) return <Image source={icons[icon]} style={{ width: size, height: size, borderRadius: size * 0.2 }} resizeMode="contain" />;
  return <View style={[styles.fallback, { width: size, height: size, borderRadius: size * 0.2 }]}><Text style={{ color: colors.habitsNav, fontSize: size * 0.42 }}>{category === 'fruit' ? '●' : category === 'vegetable' ? '◆' : '?'}</Text></View>;
}
const styles = StyleSheet.create({ fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border } });
