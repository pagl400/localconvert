import * as Haptics from 'expo-haptics';

// Haptics are decorative. The expo-haptics JS module is always present in
// node_modules, but the *native* binding is only available after a native
// rebuild (pnpm ios / pnpm android / EAS build). If the dev-client was built
// before this package was added, the native side throws at call time — we
// swallow that so the app stays usable under `pnpm start` without forcing
// a Native rebuild first. Once the user rebuilds, haptics light up.

function safe(fn: () => Promise<unknown> | void) {
  try {
    const result = fn();
    if (result && typeof (result as Promise<unknown>).catch === 'function') {
      (result as Promise<unknown>).catch(() => {});
    }
  } catch {
    // Native module not linked yet, or platform doesn't support this haptic.
  }
}

export function selection() {
  safe(() => Haptics.selectionAsync());
}

export function impactLight() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function impactMedium() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function notifySuccess() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function notifyError() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}
