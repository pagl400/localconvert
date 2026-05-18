import { useWindowDimensions } from 'react-native';

// Tablet landscape per the handoff: iPad (≥ 768 dp width) OR Android tablet
// (≥ 600 dp width) AND landscape orientation. Portrait tablets fall back to
// the phone layout, scaled up.
export function useIsTabletLandscape(): boolean {
  const { width, height } = useWindowDimensions();
  const longSide = Math.max(width, height);
  const isLandscape = width > height;
  const isTabletSize = longSide >= 900;
  return isTabletSize && isLandscape;
}
