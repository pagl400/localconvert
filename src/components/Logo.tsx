import Svg, { Path, Rect } from 'react-native-svg';

import { useTheme } from '../theme/useTheme';

interface LogoProps {
  size?: number;
}

export function Logo({ size = 28 }: LogoProps) {
  const c = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" fill="none">
      <Rect x={2} y={2} width={28} height={28} rx={7} fill={c.accent} />
      <Path
        d="M10 14h6m-3-3v6"
        stroke="#ffffff"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <Path
        d="M19 18l3 3-3 3"
        stroke="#ffffff"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
