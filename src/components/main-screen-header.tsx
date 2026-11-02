import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Header } from '@/components/header';
import { colors, spacing, type } from '@/theme';

type Props = {
  title: string;
  subtitle?: string;
  accent?: string;
  /** Optional control shown to the right of the title, such as an edit button. */
  action?: ReactNode;
};

export function MainScreenHeader({ title, subtitle, accent = colors.accent, action }: Props) {
  return <View style={styles.wrapper}>
    <Header />
    <View style={styles.intro}>
      <View style={styles.titleRow}>
        <View style={styles.titleBlock}>
          <View style={[styles.accentLine, { backgroundColor: accent }]} />
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        </View>
        {action}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrapper: { width: '100%' },
  intro: { marginTop: spacing.md, marginBottom: spacing.lg, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  titleBlock: { flex: 1, gap: 10 },
  accentLine: { width: 28, height: 3, borderRadius: 2 },
  title: { color: colors.text, ...type.display },
  subtitle: { color: colors.textMuted, ...type.body, maxWidth: 560 },
});
