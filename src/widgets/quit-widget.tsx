'use no memo';
// The widget library calls these as plain functions, so the React Compiler must leave them alone.

import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { QuitWidgetData } from './widget-data';

export const QUIT_WIDGET_NAME = 'QuitTimer';

const BG = '#14171C';
const TEXT = '#F3F5F7';
const MUTED = '#9BA4AF';
const ACCENT = '#5DD6C6';
const FONT = 'Manrope_700Bold';

/** Home-screen card: days quit, the next milestone, and a shortcut to the craving helper. */
export function QuitWidget({ data }: { data: QuitWidgetData }) {
  'use no memo';
  if (data.kind === 'empty') {
    return <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 22, padding: 16, justifyContent: 'center' }}>
      <TextWidget text="Reclaim" style={{ fontSize: 16, color: TEXT, fontFamily: FONT }} />
      <TextWidget text="Start a quit timer to see your days here." style={{ fontSize: 13, color: MUTED, marginTop: 6 }} />
    </FlexWidget>;
  }
  return <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 22, padding: 16, flexDirection: 'column', justifyContent: 'space-between' }}>
    <TextWidget text={`${data.name.toUpperCase()}-FREE`} style={{ fontSize: 11, color: data.color as `#${string}`, fontFamily: FONT, letterSpacing: 1.1 }} maxLines={1} truncate="END" />
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <TextWidget text={data.days.toLocaleString()} style={{ fontSize: 44, color: TEXT, fontFamily: 'Manrope_800ExtraBold' }} />
      <TextWidget text={data.days === 1 ? ' day' : ' days'} style={{ fontSize: 15, color: MUTED, fontFamily: FONT, marginBottom: 8 }} />
    </FlexWidget>
    <TextWidget text={[data.savings && `${data.savings} saved`, data.next].filter(Boolean).join('  ·  ')} style={{ fontSize: 12, color: MUTED }} maxLines={1} truncate="END" />
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'reclaim://craving' }} style={{ marginTop: 10, width: 'match_parent', height: 36, borderRadius: 18, backgroundColor: '#1A2E2C', alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text="Having a craving?" style={{ fontSize: 13, color: ACCENT, fontFamily: FONT }} />
    </FlexWidget>
  </FlexWidget>;
}
