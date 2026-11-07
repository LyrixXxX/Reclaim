import { useState } from 'react';
import { TextInput, TextInputProps } from 'react-native';

import { isoToUs, maskUsDate, usToIso } from '@/lib/us-date';

type Props = Omit<TextInputProps, 'value' | 'onChangeText' | 'keyboardType'> & {
  /** Stored date, YYYY-MM-DD. */
  value: string;
  /** Receives YYYY-MM-DD once the date is complete and real; otherwise the text as typed, which fails date validation. */
  onChangeText: (value: string) => void;
};

/** A date input shown and typed as MM/DD/YYYY, while the app keeps storing YYYY-MM-DD. */
export function DateField({ value, onChangeText, placeholder = 'MM/DD/YYYY', ...props }: Props) {
  const [text, setText] = useState(() => isoToUs(value));
  const [synced, setSynced] = useState(value);
  // Follow outside changes, such as a Today button, without fighting the user's typing.
  if (value !== synced) {
    setSynced(value);
    if (value !== (usToIso(text) ?? text)) setText(isoToUs(value));
  }
  return <TextInput
    {...props}
    value={text}
    placeholder={placeholder}
    keyboardType="number-pad"
    maxLength={10}
    onChangeText={(input) => {
      const next = maskUsDate(input, text);
      const stored = usToIso(next) ?? next;
      setText(next);
      setSynced(stored);
      onChangeText(stored);
    }}
  />;
}
