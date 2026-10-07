import { PropsWithChildren } from 'react';
import {
  KeyboardAvoidingView,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  formBottomPadding,
  keyboardAvoidingBehavior,
  keyboardScrollFooterHeight,
} from '@/lib/keyboard';

type Props = PropsWithChildren<Omit<ScrollViewProps, 'keyboardShouldPersistTaps'>>;

export function KeyboardSafeScrollView({ children, contentContainerStyle, ...props }: Props) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={styles.container} behavior={keyboardAvoidingBehavior()}>
    <ScrollView
      {...props}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        styles.content,
        contentContainerStyle,
        { paddingBottom: formBottomPadding(insets.bottom) },
      ]}
    >
      {children}
      <ScrollFooter height={keyboardScrollFooterHeight(insets.bottom)} />
    </ScrollView>
  </KeyboardAvoidingView>;
}

function ScrollFooter({ height }: { height: number }) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ height }} />;
}

const styles = StyleSheet.create({ container: { flex: 1 }, content: { flexGrow: 1 } });
