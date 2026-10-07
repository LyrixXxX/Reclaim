import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTrackers } from '@/state/tracker-context';
import { colors } from '@/theme';

export function LocalSaveStatus({ errorsOnly = false }: { errorsOnly?: boolean }) {
  const { saveStatus, retrySave } = useTrackers();
  if (errorsOnly && saveStatus !== 'error') return null;
  const content = <View style={styles.card} accessibilityLiveRegion="polite">
    <Text style={styles.title}>{saveStatus === 'error' ? 'Changes not saved on this device' : saveStatus === 'saving' ? 'Saving on this device…' : 'Saved on this device'}</Text>
    <Text style={styles.description}>{saveStatus === 'error'
      ? 'Keep Reclaim open. Your latest changes are still in memory. Free some device space if needed, then retry. You can also export a backup in Settings.'
      : 'Records stay local. Keep a backup outside this device in case it is lost or damaged.'}</Text>
    {saveStatus === 'error' && <Pressable accessibilityRole="button" onPress={retrySave} style={styles.button}><Text style={styles.title}>Retry save</Text></Pressable>}
  </View>;
  return errorsOnly ? <SafeAreaView edges={['bottom']} style={styles.safe}>{content}</SafeAreaView> : content;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.surface },
  card: { padding: 16, gap: 8, backgroundColor: colors.surface, borderRadius: 16 },
  title: { color: colors.text, fontSize: 14, fontWeight: '700' },
  description: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  button: { backgroundColor: colors.surfaceRaised, padding: 12, borderRadius: 12, alignSelf: 'flex-start' },
});
