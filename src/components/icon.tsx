import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '@/theme';

// Line icons on a 24px grid (Lucide geometry, ISC license), drawn with
// react-native-svg so no icon font has to load.
const paths = {
  home: ['M3 10.5 12 3l9 7.5', 'M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5'],
  steps: ['M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z', 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z', 'M16 17h4', 'M4 13h4'],
  routes: ['M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z', 'M15 5.764v15', 'M9 3.236v15'],
  habits: ['m8.5 12.5 2.5 2.5 4.5-5'],
  weight: ['M6 3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z', 'M8.5 10a3.5 3.5 0 0 1 7 0', 'm12 10 1.6-2.2'],
  nutrition: ['M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2', 'M7 2v20', 'M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'],
  workouts: ['M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z', 'm2.5 21.5 1.4-1.4', 'm20.1 3.9 1.4-1.4', 'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z', 'm9.6 14.4 4.8-4.8'],
  supplements: ['m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z', 'm8.5 8.5 7 7'],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'],
  chevronRight: ['m9 18 6-6-6-6'],
  chevronLeft: ['m15 18-6-6 6-6'],
  chevronUp: ['m18 15-6-6-6 6'],
  chevronDown: ['m6 9 6 6 6-6'],
  plus: ['M5 12h14', 'M12 5v14'],
  sliders: ['M10 5H3', 'M12 19H3', 'M14 3v4', 'M16 17v4', 'M21 12h-9', 'M21 19h-5', 'M21 5h-7', 'M8 10v4', 'M8 12H3'],
  expand: ['M15 3h6v6', 'M9 21H3v-6', 'M21 3l-7 7', 'M3 21l7-7'],
  heading: ['M12 2 19 21 12 17 5 21 12 2z'],
  locate: ['M2 12h3', 'M19 12h3', 'M12 2v3', 'M12 19v3'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
} as const;

const circles: Partial<Record<IconName, [number, number, number][]>> = {
  habits: [[12, 12, 9]],
  settings: [[12, 12, 3]],
  locate: [[12, 12, 7], [12, 12, 1.5]],
};

export type IconName = keyof typeof paths;

export function Icon({ name, size = 22, color = colors.text, strokeWidth = 1.9, fill = 'none' }: { name: IconName; size?: number; color?: string; strokeWidth?: number; fill?: string }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    {paths[name].map((d) => <Path key={d} d={d} />)}
    {circles[name]?.map(([cx, cy, r]) => <Circle key={`${cx}-${cy}-${r}`} cx={cx} cy={cy} r={r} />)}
  </Svg>;
}

const chevronIcons = { right: 'chevronRight', left: 'chevronLeft', up: 'chevronUp', down: 'chevronDown' } as const;

/** The one chevron used across the app: links, list rows, pagers, and expand/collapse toggles. */
export function Chevron({ direction = 'right', size = 20, color = colors.textMuted }: { direction?: keyof typeof chevronIcons; size?: number; color?: string }) {
  return <Icon name={chevronIcons[direction]} size={size} color={color} strokeWidth={2.2} />;
}
