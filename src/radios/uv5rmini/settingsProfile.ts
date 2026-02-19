/**
 * UV5R-Mini settings profile. Drives the Settings tab UI.
 */
import type { SettingsProfile } from '../../types/settingsProfile';

function optionsFor(values: string[]) {
  return values.map((label, i) => ({ value: i, label }));
}

export const UV5RMINI_SETTINGS_PROFILE: SettingsProfile = {
  radioType: 'UV5R-Mini',
  sections: [
    {
      id: 'basic',
      title: 'Basic',
      fields: [
        { key: 'uv5rMiniSettings.squelch', label: 'Squelch', type: 'select', options: optionsFor(['Off', '1', '2', '3', '4', '5']) },
        { key: 'uv5rMiniSettings.savemode', label: 'Save mode', type: 'select', options: optionsFor(['Off', 'On']) },
        { key: 'uv5rMiniSettings.vox', label: 'VOX', type: 'select', options: optionsFor(['Off', '1', '2', '3', '4', '5', '6', '7', '8', '9']) },
        { key: 'uv5rMiniSettings.backlight', label: 'Backlight', type: 'select', options: optionsFor(['Always On', ...Array.from({ length: 4 }, (_, i) => `${5 + i * 5} sec`)]) },
        { key: 'uv5rMiniSettings.dualstandby', label: 'Dual watch', type: 'select', options: optionsFor(['Off', 'On']) },
        { key: 'uv5rMiniSettings.tot', label: 'Timeout timer', type: 'select', options: optionsFor(['Off', ...Array.from({ length: 12 }, (_, i) => `${15 + i * 15} sec`)]) },
        { key: 'uv5rMiniSettings.beep', label: 'Beep', type: 'select', options: optionsFor(['Off', 'On']) },
        { key: 'uv5rMiniSettings.voicesw', label: 'Enable voice', type: 'checkbox' },
        { key: 'uv5rMiniSettings.voice', label: 'Voice prompt', type: 'select', options: optionsFor(['English', 'Chinese']) },
      ],
    },
    {
      id: 'display',
      title: 'Display & Channel',
      fields: [
        { key: 'uv5rMiniSettings.chadistype', label: 'Channel A display', type: 'select', options: optionsFor(['Name', 'Frequency', 'Channel Number']) },
        { key: 'uv5rMiniSettings.chbdistype', label: 'Channel B display', type: 'select', options: optionsFor(['Name', 'Frequency', 'Channel Number']) },
        { key: 'uv5rMiniSettings.chaworkmode', label: 'Channel A work mode', type: 'select', options: optionsFor(['Frequency', 'Channel']) },
        { key: 'uv5rMiniSettings.chbworkmode', label: 'Channel B work mode', type: 'select', options: optionsFor(['Frequency', 'Channel']) },
        { key: 'uv5rMiniSettings.powerondistype', label: 'Power on display', type: 'select', options: optionsFor(['LOGO', 'BATT voltage']) },
        { key: 'uv5rMiniSettings.aOrB', label: 'VFO selected', type: 'select', options: [{ value: 0, label: 'A' }, { value: 1, label: 'B' }] },
      ],
    },
    {
      id: 'ptt',
      title: 'PTT & Roger',
      fields: [
        { key: 'uv5rMiniSettings.pttid', label: 'PTT ID', type: 'select', options: optionsFor(['Off', 'BOT', 'EOT', 'Both']) },
        { key: 'uv5rMiniSettings.pttdly', label: 'Send ID delay', type: 'select', options: optionsFor(Array.from({ length: 30 }, (_, i) => `${100 + i * 100} ms`)) },
        { key: 'uv5rMiniSettings.roger', label: 'Roger', type: 'checkbox' },
        { key: 'uv5rMiniSettings.sidetone', label: 'Side tone', type: 'select', options: optionsFor(['Off', 'KB Side Tone', 'ANI Side Tone', 'KB + ANI Side Tone']) },
      ],
    },
    {
      id: 'scan',
      title: 'Scan & Squelch',
      fields: [
        { key: 'uv5rMiniSettings.scanmode', label: 'Scan mode', type: 'select', options: optionsFor(['Time', 'Carrier', 'Search']) },
        { key: 'uv5rMiniSettings.ctsdcsscantype', label: 'QT save mode', type: 'select', options: optionsFor(['Both', 'RX', 'TX']) },
      ],
    },
    {
      id: 'alarm',
      title: 'Alarm & Safety',
      fields: [
        { key: 'uv5rMiniSettings.alarmmode', label: 'Alarm mode', type: 'select', options: optionsFor(['Local', 'Send Tone', 'Send Code']) },
        { key: 'uv5rMiniSettings.alarmtone', label: 'Sound alarm', type: 'checkbox' },
        { key: 'uv5rMiniSettings.totalarm', label: 'Timeout alarm', type: 'select', options: optionsFor(['Off', '1 sec', '2 sec', '3 sec', '4 sec', '5 sec', '6 sec', '7 sec', '8 sec', '9 sec', '10 sec']) },
      ],
    },
    {
      id: 'repeater',
      title: 'Repeater',
      fields: [
        { key: 'uv5rMiniSettings.tailclear', label: 'Tail clear', type: 'checkbox' },
        { key: 'uv5rMiniSettings.rpttailclear', label: 'Rpt tail clear', type: 'select', options: optionsFor(Array.from({ length: 11 }, (_, i) => `${i * 100} ms`)) },
        { key: 'uv5rMiniSettings.rpttaildet', label: 'Rpt tail delay', type: 'select', options: optionsFor(Array.from({ length: 11 }, (_, i) => `${i * 100} ms`)) },
      ],
    },
    {
      id: 'vox',
      title: 'VOX & Misc',
      fields: [
        { key: 'uv5rMiniSettings.voxdlytime', label: 'VOX delay time', type: 'select', options: optionsFor(Array.from({ length: 16 }, (_, i) => `${500 + i * 100} ms`)) },
        { key: 'uv5rMiniSettings.voxsw', label: 'VOX switch', type: 'checkbox' },
        { key: 'uv5rMiniSettings.menuquittime', label: 'Menu quit timer', type: 'select', options: optionsFor([...Array.from({ length: 10 }, (_, i) => `${5 + i * 5} sec`), '60 sec']) },
        { key: 'uv5rMiniSettings.dispani', label: 'Display ANI', type: 'checkbox' },
        { key: 'uv5rMiniSettings.inputdtmf', label: 'Input DTMF', type: 'checkbox' },
        { key: 'uv5rMiniSettings.bcl', label: 'BCL', type: 'checkbox' },
        { key: 'uv5rMiniSettings.autolock', label: 'Key auto lock', type: 'checkbox' },
        { key: 'uv5rMiniSettings.keylock', label: 'Key lock', type: 'checkbox' },
        { key: 'uv5rMiniSettings.fmenable', label: 'Disable FM', type: 'checkbox' },
        { key: 'uv5rMiniSettings.hangup', label: 'Hang-up time', type: 'select', options: optionsFor(['3 s', '4 s', '5 s', '6 s', '7 s', '8 s', '9 s', '10 s']) },
      ],
    },
  ],
};
