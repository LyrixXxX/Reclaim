import * as Haptics from 'expo-haptics';

export function selectionHaptic() {
  void Haptics.selectionAsync().catch(() => undefined);
}

export function confirmationHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
