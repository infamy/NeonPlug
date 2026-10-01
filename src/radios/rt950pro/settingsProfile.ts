/**
 * Radtel RT-950 Pro settings profile. Drives the Settings tab.
 *
 * Labels are only the ones the RT-950 Pro CHIRP driver's sources agree on, and
 * a number whose unit nobody has pinned down is shown as the radio's own
 * number. ⚠️ Not yet checked against a radio.
 */
import type { SettingsProfile } from '../../types/settingsProfile';
import { RT950PRO_RADIO_DEFAULT } from '../../types/rt950proSettings';
import { RT950PRO_MODEL_ID } from './modelId';

/** Every list starts with the radio's factory default, which is where a new radio's settings sit. */
const options = (labels: string[]) => [
  { value: RT950PRO_RADIO_DEFAULT, label: 'Radio default' },
  ...labels.map((label, value) => ({ value, label })),
];
const numbers = (max: number) => options(Array.from({ length: max + 1 }, (_, i) => String(i)));
const onOff = options(['Off', 'On']);

export const RT950PRO_SETTINGS_PROFILE: SettingsProfile = {
  radioType: RT950PRO_MODEL_ID,
  sections: [
    {
      id: 'radio',
      title: 'Radio',
      fields: [
        { key: 'radioSpecific.squelch', label: 'Squelch level', type: 'select', options: numbers(9) },
        { key: 'radioSpecific.batterySave', label: 'Battery save', type: 'select', options: numbers(3) },
        { key: 'radioSpecific.tot', label: 'Time-out timer', type: 'select', options: numbers(9) },
        { key: 'radioSpecific.dualWatch', label: 'Dual watch', type: 'select', options: onOff },
        { key: 'radioSpecific.keyBeep', label: 'Key beep', type: 'select', options: onOff },
        { key: 'radioSpecific.rogerBeep', label: 'Roger beep', type: 'select', options: onOff },
        { key: 'radioSpecific.fmRadio', label: 'FM radio', type: 'select', options: onOff },
        { key: 'radioSpecific.bluetooth', label: 'Bluetooth', type: 'select', options: onOff },
      ],
    },
    {
      id: 'vox',
      title: 'VOX',
      fields: [
        { key: 'radioSpecific.voxEnabled', label: 'VOX', type: 'select', options: onOff },
        { key: 'radioSpecific.voxGain', label: 'VOX gain', type: 'select', options: numbers(9) },
        { key: 'radioSpecific.voxDelay', label: 'VOX delay', type: 'select', options: numbers(9) },
      ],
    },
    {
      id: 'display',
      title: 'Display',
      fields: [
        { key: 'radioSpecific.backlight', label: 'Auto backlight', type: 'select', options: numbers(9) },
        { key: 'radioSpecific.displayModeA', label: 'Display A', type: 'select', options: options(['Channel', 'Frequency', 'Name']) },
        { key: 'radioSpecific.displayModeB', label: 'Display B', type: 'select', options: options(['Channel', 'Frequency', 'Name']) },
        { key: 'radioSpecific.displayModeC', label: 'Display C', type: 'select', options: options(['Channel', 'Frequency', 'Name']) },
      ],
    },
    {
      id: 'scan',
      title: 'Scan & signalling',
      fields: [
        { key: 'radioSpecific.scanMode', label: 'Scan mode', type: 'select', options: options(['Time', 'Carrier', 'Search']) },
        { key: 'radioSpecific.pttId', label: 'PTT ID', type: 'select', options: options(['Off', 'BOT', 'EOT', 'Both']) },
        { key: 'radioSpecific.sendIdDelay', label: 'Send ID delay', type: 'select', options: numbers(9) },
        { key: 'radioSpecific.tailNoiseClear', label: 'Tail noise clear', type: 'select', options: onOff },
        { key: 'radioSpecific.repeaterNoiseClear', label: 'Repeater noise clear', type: 'select', options: onOff },
        { key: 'radioSpecific.repeaterNoiseDetect', label: 'Repeater noise detect', type: 'select', options: onOff },
      ],
    },
    {
      id: 'keypad',
      title: 'Keypad',
      fields: [
        { key: 'radioSpecific.keypadLock', label: 'Keypad lock', type: 'select', options: onOff },
        { key: 'radioSpecific.autoKeyLock', label: 'Auto key lock', type: 'select', options: onOff },
      ],
    },
  ],
};
