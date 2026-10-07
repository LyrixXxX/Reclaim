import appConfig from '../../app.json';
import {
  FORM_SAFE_BOTTOM_GAP,
  KEYBOARD_SCROLL_FOOTER,
  formBottomPadding,
  keyboardAvoidingBehavior,
  keyboardScrollFooterHeight,
} from './keyboard';

describe('keyboard-safe forms', () => {
  test('Android uses resize mode instead of pan', () => {
    expect(appConfig.expo.android.softwareKeyboardLayoutMode).toBe('resize');
    expect(keyboardAvoidingBehavior('android')).toBeUndefined();
  });

  test('iOS uses padding keyboard avoidance', () => {
    expect(keyboardAvoidingBehavior('ios')).toBe('padding');
  });

  test('safe-area bottom padding is additive', () => {
    expect(formBottomPadding(24)).toBe(24 + FORM_SAFE_BOTTOM_GAP);
    expect(formBottomPadding(-5)).toBe(FORM_SAFE_BOTTOM_GAP);
  });

  test('forms reserve a safe-area-aware manual keyboard scroll footer', () => {
    expect(KEYBOARD_SCROLL_FOOTER).toBeGreaterThanOrEqual(240);
    expect(keyboardScrollFooterHeight(24)).toBe(24 + KEYBOARD_SCROLL_FOOTER);
  });
});
