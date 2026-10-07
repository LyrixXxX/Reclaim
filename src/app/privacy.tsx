import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PrivacyContent } from '@/components/privacy-content';
import { colors } from '@/theme';

export default function PrivacyScreen() {
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView><PrivacyContent /></ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({ safe: { flex: 1, backgroundColor: colors.background } });
