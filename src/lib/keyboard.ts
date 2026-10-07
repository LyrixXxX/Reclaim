import { Platform } from 'react-native';

export const FORM_SAFE_BOTTOM_GAP = 24;
export const KEYBOARD_SCROLL_FOOTER = 240;

export function formBottomPadding(safeAreaBottom: number) {
  return Math.max(0, safeAreaBottom) + FORM_SAFE_BOTTOM_GAP;
}

export function keyboardScrollFooterHeight(safeAreaBottom: number) {
  return Math.max(0, safeAreaBottom) + KEYBOARD_SCROLL_FOOTER;
}

/** Android uses Expo's resize mode; adding a second KAV behavior causes double jumps. */
export function keyboardAvoidingBehavior(os: string = Platform.OS) {
  return os === 'ios' ? 'padding' as const : undefined;
}
