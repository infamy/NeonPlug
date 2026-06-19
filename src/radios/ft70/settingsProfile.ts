/**
 * Settings profile for the Yaesu FT-70D.
 */
import type { SettingsProfile } from '../../types/settingsProfile';

function opt(values: string[]) {
  return values.map((label, i) => ({ value: i, label }));
}

const APO_OPTIONS = opt(['Off', ...Array.from({ length: 24 }, (_, i) => `${((i + 1) * 0.5).toFixed(1)}h`)]);
const TOT_OPTIONS = opt(['Off', ...Array.from({ length: 20 }, (_, i) => `${((i + 1) * 0.5).toFixed(1)} min`)]);
const RESUME_OPTIONS = opt([
  ...Array.from({ length: 17 }, (_, i) => `${(2.0 + i * 0.5).toFixed(1)}s`),
  'Busy', 'Hold',
]);
const RESTART_OPTIONS = opt([
  ...Array.from({ length: 9 }, (_, i) => `${(0.1 + i * 0.1).toFixed(1)}s`),
  ...Array.from({ length: 19 }, (_, i) => `${(1.0 + i * 0.5).toFixed(1)}s`),
]);
const RX_SAVE_OPTIONS = opt([
  'Off', '0.2s', '.3s', '.4s', '.5s', '.6s', '.7s', '.8s', '.9s', '1.0s', '1.5s',
  '2.0s', '2.5s', '3.0s', '3.5s', '4.0s', '4.5s', '5.0s', '5.5s', '6.0s', '6.5s', '7.0s',
  '7.5s', '8.0s', '8.5s', '9.0s', '10.0s', '15s', '20s', '25s', '30s', '35s', '40s', '45s', '50s', '55s', '60s',
]);
const LAMP_OPTIONS = opt([...Array.from({ length: 9 }, (_, i) => `Key ${i + 2} sec`), 'Continuous', 'Off']);
const LCD_DIMMER_OPTIONS = opt(Array.from({ length: 6 }, (_, i) => `Level ${i + 1}`));
const MIC_GAIN_OPTIONS = opt(Array.from({ length: 9 }, (_, i) => `Level ${i + 1}`));
const VOLUME_OPTIONS = opt(Array.from({ length: 32 }, (_, i) => `Level ${i}`));
const SQUELCH_OPTIONS = opt(Array.from({ length: 16 }, (_, i) => `Level ${i}`));
const BEEP_LEVEL_OPTIONS = opt(Array.from({ length: 7 }, (_, i) => `Level ${i + 1}`));
const BEEP_SELECT_OPTIONS = opt(['Key + Scan', 'Key', 'Off']);
const LOCK_OPTIONS = opt(['Key', 'Dial', 'Key + Dial', 'PTT', 'Key + PTT', 'Dial + PTT', 'All']);
const DTMF_DELAY_OPTIONS = opt(['50 ms', '250 ms', '450 ms', '750 ms', '1000 ms']);
const PTT_DELAY_OPTIONS = opt(['Off', '20 ms', '50 ms', '100 ms', '200 ms']);
const GM_RING_OPTIONS = opt(['Off', 'In Range', 'Always']);
const GM_INTERVAL_OPTIONS = opt(['Long', 'Normal', 'Off']);
const AMS_TX_MODE_OPTIONS = opt(['Auto', 'Digital', 'FM']);
const DG_ID_OPTIONS = opt(Array.from({ length: 100 }, (_, i) => `${i}`));
const DIG_POPUP_OPTIONS = opt(['Off', '2 sec', '4 sec', '6 sec', '8 sec', '10 sec', '20 sec', '30 sec', '60 sec', 'Continuous']);
const OPENING_MESSAGE_OPTIONS = opt(['Off', 'DC', 'Message']);

export const FT70_SETTINGS_PROFILE: SettingsProfile = {
  radioType: 'FT-70',
  sections: [
    {
      id: 'basic',
      title: 'Basic',
      fields: [
        { key: 'radioSpecific.squelch', label: 'Squelch', type: 'select', options: SQUELCH_OPTIONS },
        { key: 'radioSpecific.volume', label: 'Volume', type: 'select', options: VOLUME_OPTIONS },
        { key: 'radioSpecific.apo', label: 'Auto Power Off', type: 'select', options: APO_OPTIONS },
        { key: 'radioSpecific.tot', label: 'Time-Out Timer', type: 'select', options: TOT_OPTIONS },
        { key: 'radioSpecific.rxSave', label: 'RX Battery Save', type: 'select', options: RX_SAVE_OPTIONS },
        { key: 'radioSpecific.bclo', label: 'Busy Channel Lockout', type: 'checkbox' },
        { key: 'radioSpecific.vfoMode', label: 'VFO Mode: Band-limited', type: 'checkbox' },
      ],
    },
    {
      id: 'audio',
      title: 'Audio & Beep',
      fields: [
        { key: 'radioSpecific.beepSelect', label: 'Beep', type: 'select', options: BEEP_SELECT_OPTIONS },
        { key: 'radioSpecific.beepLevel', label: 'Beep Level', type: 'select', options: BEEP_LEVEL_OPTIONS },
        { key: 'radioSpecific.beepEdge', label: 'Beep at Band Edge', type: 'checkbox' },
        { key: 'radioSpecific.micGain', label: 'Mic Gain', type: 'select', options: MIC_GAIN_OPTIONS },
      ],
    },
    {
      id: 'display',
      title: 'Display & Indicators',
      fields: [
        { key: 'radioSpecific.lcdDimmer', label: 'LCD Dimmer', type: 'select', options: LCD_DIMMER_OPTIONS },
        { key: 'radioSpecific.lamp', label: 'Lamp / Backlight', type: 'select', options: LAMP_OPTIONS },
        { key: 'radioSpecific.busyLed', label: 'Busy LED', type: 'checkbox' },
        { key: 'radioSpecific.lock', label: 'Lock Mode', type: 'select', options: LOCK_OPTIONS },
        { key: 'radioSpecific.openingMessageMode', label: 'Opening Message Mode', type: 'select', options: OPENING_MESSAGE_OPTIONS },
        { key: 'radioSpecific.openingMessageText', label: 'Opening Message Text', type: 'text', maxLength: 6 },
      ],
    },
    {
      id: 'scan',
      title: 'Scan',
      fields: [
        { key: 'radioSpecific.scanResume', label: 'Scan Resume', type: 'select', options: RESUME_OPTIONS },
        { key: 'radioSpecific.scanRestart', label: 'Scan Restart Time', type: 'select', options: RESTART_OPTIONS },
        { key: 'radioSpecific.scanLamp', label: 'Scan Lamp', type: 'checkbox' },
      ],
    },
    {
      id: 'dualwatch',
      title: 'Dual Watch',
      fields: [
        { key: 'radioSpecific.dwResumeInterval', label: 'Dual Watch Resume', type: 'select', options: RESUME_OPTIONS },
        { key: 'radioSpecific.dwInterval', label: 'Dual Watch Interval', type: 'select', options: RESTART_OPTIONS },
        { key: 'radioSpecific.dwRt', label: 'Priority Channel Revert', type: 'checkbox' },
        { key: 'radioSpecific.homeVfo', label: 'Home -> VFO', type: 'checkbox' },
        { key: 'radioSpecific.homeRev', label: 'HOME/REV Key = Home', type: 'checkbox' },
        { key: 'radioSpecific.moni', label: 'MONI/T-CALL = Tone Call', type: 'checkbox' },
        { key: 'radioSpecific.ars', label: 'Automatic Repeater Shift', type: 'checkbox' },
      ],
    },
    {
      id: 'ptt',
      title: 'PTT',
      fields: [
        { key: 'radioSpecific.pttDelay', label: 'PTT Delay', type: 'select', options: PTT_DELAY_OPTIONS },
      ],
    },
    {
      id: 'dtmf',
      title: 'DTMF',
      fields: [
        { key: 'radioSpecific.dtmfMode', label: 'DTMF Mode: Auto', type: 'checkbox' },
        { key: 'radioSpecific.dtmfDelay', label: 'DTMF Delay', type: 'select', options: DTMF_DELAY_OPTIONS },
        { key: 'radioSpecific.dtmfSpeed', label: 'DTMF Speed: 100ms', type: 'checkbox' },
      ],
    },
    {
      id: 'digital',
      title: 'Digital (C4FM)',
      fields: [
        { key: 'radioSpecific.myCall', label: 'MYCALL', type: 'text', maxLength: 10 },
        { key: 'radioSpecific.amsTxMode', label: 'AMS TX Mode', type: 'select', options: AMS_TX_MODE_OPTIONS },
        { key: 'radioSpecific.standbyBeep', label: 'Standby Beep', type: 'checkbox' },
        { key: 'radioSpecific.vwMode', label: 'VW Mode', type: 'checkbox' },
        { key: 'radioSpecific.rxDgId', label: 'RX DG-ID', type: 'select', options: DG_ID_OPTIONS },
        { key: 'radioSpecific.txDgId', label: 'TX DG-ID', type: 'select', options: DG_ID_OPTIONS },
        { key: 'radioSpecific.digitalPopup', label: 'Digital Popup Time', type: 'select', options: DIG_POPUP_OPTIONS },
      ],
    },
    {
      id: 'gm',
      title: 'Group Monitor',
      fields: [
        { key: 'radioSpecific.gmRing', label: 'GM Ring', type: 'select', options: GM_RING_OPTIONS },
        { key: 'radioSpecific.gmInterval', label: 'GM Interval', type: 'select', options: GM_INTERVAL_OPTIONS },
      ],
    },
  ],
};
