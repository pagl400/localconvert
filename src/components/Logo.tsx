import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

interface LogoProps {
  size?: number;
}

const ID = 'localconvert-logo';

export function Logo({ size = 32 }: LogoProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      accessibilityLabel="LocalConvert"
    >
      <Defs>
        <LinearGradient id={`${ID}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0%" stopColor="#1B2D58" />
          <Stop offset="55%" stopColor="#0B1838" />
          <Stop offset="100%" stopColor="#040A1F" />
        </LinearGradient>
        <LinearGradient id={`${ID}-stroke`} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#9BC8FF" />
          <Stop offset="100%" stopColor="#3D8BF0" />
        </LinearGradient>
      </Defs>
      <Rect width={1024} height={1024} rx={225} fill={`url(#${ID}-bg)`} />
      <Path
        d="M 320 388 A 130 130 0 1 1 320 636 C 460 580 564 444 704 388 A 130 130 0 1 1 704 636 C 564 580 460 444 320 388 Z"
        stroke={`url(#${ID}-stroke)`}
        strokeWidth={92}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}
