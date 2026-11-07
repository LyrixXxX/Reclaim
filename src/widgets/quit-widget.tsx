'use no memo';
// The widget library calls these as plain functions, so the React Compiler must leave them alone.

import { FlexWidget, TextWidget } from 'react-native-android-widget';

import { QuitWidgetData } from './widget-data';

export const QUIT_WIDGET_NAME = 'QuitTimer';

const BG = '#14171C';
const TEXT = '#F3F5F7';
const MUTED = '#9BA4AF';
const ACCENT = '#5DD6C6';
const STEPS = '#62D2F2';
const FONT = 'Manrope_700Bold';

/** Home-screen card: days quit, the next milestone, and a shortcut to the craving helper. */
export function QuitWidget({ data }: { data: QuitWidgetData }) {
  'use no memo';
  if (data.kind === 'empty') {
    return <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 22, padding: 16, justifyContent: 'center' }}>
      <TextWidget text="Reclaim" style={{ fontSize: 16, color: TEXT, fontFamily: FONT }} />
      <TextWidget text="Turn on step tracking or start a quit timer to see it here." style={{ fontSize: 13, color: MUTED, marginTop: 6 }} />
    </FlexWidget>;
  }
  if (data.kind === 'steps') {
    return <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'reclaim://activity' }} style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 22, padding: 16, flexDirection: 'column', justifyContent: 'space-between' }}>
      <TextWidget text="TODAY’S STEPS" style={{ fontSize: 11, color: STEPS, fontFamily: FONT, letterSpacing: 1.1 }} />
      <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
        <TextWidget text={data.steps.count.toLocaleString()} style={{ fontSize: 44, color: TEXT, fontFamily: 'Manrope_800ExtraBold' }} />
        {!!data.goal && <TextWidget text={` / ${data.goal.toLocaleString()}`} style={{ fontSize: 15, color: MUTED, fontFamily: FONT, marginBottom: 8 }} />}
      </FlexWidget>
      <TextWidget text={`Est. calories: ${data.steps.kcal.toLocaleString()}`} style={{ fontSize: 13, color: MUTED, fontFamily: FONT }} />
    </FlexWidget>;
  }
  return <FlexWidget clickAction="OPEN_APP" style={{ height: 'match_parent', width: 'match_parent', backgroundColor: BG, borderRadius: 22, padding: 16, flexDirection: 'column', justifyContent: 'space-between' }}>
    <TextWidget text={`${data.name.toUpperCase()}-FREE`} style={{ fontSize: 11, color: data.color as `#${string}`, fontFamily: FONT, letterSpacing: 1.1 }} maxLines={1} truncate="END" />
    <FlexWidget style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
      <TextWidget text={data.days.toLocaleString()} style={{ fontSize: 44, color: TEXT, fontFamily: 'Manrope_800ExtraBold' }} />
      <TextWidget text={data.days === 1 ? ' day' : ' days'} style={{ fontSize: 15, color: MUTED, fontFamily: FONT, marginBottom: 8 }} />
    </FlexWidget>
    <TextWidget text={[data.savings && `${data.savings} saved`, data.next].filter(Boolean).join('  ·  ')} style={{ fontSize: 12, color: MUTED }} maxLines={1} truncate="END" />
    {data.steps && <TextWidget text={`${data.steps.count.toLocaleString()} steps  ·  Est. calories: ${data.steps.kcal.toLocaleString()}`} style={{ fontSize: 12, color: STEPS, fontFamily: FONT, marginTop: 4 }} maxLines={1} truncate="END" />}
    <FlexWidget clickAction="OPEN_URI" clickActionData={{ uri: 'reclaim://craving' }} style={{ marginTop: 10, width: 'match_parent', height: 36, borderRadius: 18, backgroundColor: '#1A2E2C', alignItems: 'center', justifyContent: 'center' }}>
      <TextWidget text="Having a craving?" style={{ fontSize: 13, color: ACCENT, fontFamily: FONT }} />
    </FlexWidget>
  </FlexWidget>;
}
