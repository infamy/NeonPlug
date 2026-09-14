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
        { key: 'radioSpecific.squelch', label: 'Squelch', type: 'select', options: optionsFor(['Off', '1', '2', '3', '4', '5']) },
        { key: 'radioSpecific.savemode', label: 'Save mode', type: 'select', options: optionsFor(['Off', 'On']) },
        { key: 'radioSpecific.vox', label: 'VOX', type: 'select', options: optionsFor(['Off', '1', '2', '3', '4', '5', '6', '7', '8', '9']) },
        { key: 'radioSpecific.backlight', label: 'Backlight', type: 'select', options: optionsFor(['Always On', ...Array.from({ length: 4 }, (_, i) => `${5 + i * 5} sec`)]) },
        { key: 'radioSpecific.dualstandby', label: 'Dual watch', type: 'select', options: optionsFor(['Off', 'On']) },
        { key: 'radioSpecific.tot', label: 'Timeout timer', type: 'select', options: optionsFor(['Off', ...Array.from({ length: 12 }, (_, i) => `${15 + i * 15} sec`)]) },
        { key: 'radioSpecific.beep', label: 'Beep', type: 'select', options: optionsFor(['Off', 'On']) },
        { key: 'radioSpecific.voicesw', label: 'Enable voice', type: 'checkbox' },
        { key: 'radioSpecific.voice', label: 'Voice prompt', type: 'select', options: optionsFor(['English', 'Chinese']) },
      ],
    },
    {
      id: 'display',
      title: 'Display & Channel',
      fields: [
        { key: 'radioSpecific.chadistype', label: 'Channel A display', type: 'select', options: optionsFor(['Name', 'Frequency', 'Channel Number']) },
        { key: 'radioSpecific.chbdistype', label: 'Channel B display', type: 'select', options: optionsFor(['Name', 'Frequency', 'Channel Number']) },
        { key: 'radioSpecific.chaworkmode', label: 'Channel A work mode', type: 'select', options: optionsFor(['Frequency', 'Channel']) },
        { key: 'radioSpecific.chbworkmode', label: 'Channel B work mode', type: 'select', options: optionsFor(['Frequency', 'Channel']) },
        { key: 'radioSpecific.powerondistype', label: 'Power on display', type: 'select', options: optionsFor(['LOGO', 'BATT voltage']) },
        { key: 'radioSpecific.aOrB', label: 'VFO selected', type: 'select', options: [{ value: 0, label: 'A' }, { value: 1, label: 'B' }] },
      ],
    },
    {
      id: 'ptt',
      title: 'PTT & Roger',
      fields: [
        { key: 'radioSpecific.pttid', label: 'PTT ID', type: 'select', options: optionsFor(['Off', 'BOT', 'EOT', 'Both']) },
        { key: 'radioSpecific.pttdly', label: 'Send ID delay', type: 'select', options: optionsFor(Array.from({ length: 30 }, (_, i) => `${100 + i * 100} ms`)) },
        { key: 'radioSpecific.roger', label: 'Roger', type: 'checkbox' },
        { key: 'radioSpecific.sidetone', label: 'Side tone', type: 'select', options: optionsFor(['Off', 'KB Side Tone', 'ANI Side Tone', 'KB + ANI Side Tone']) },
      ],
    },
    {
      id: 'scan',
      title: 'Scan & Squelch',
      fields: [
        { key: 'radioSpecific.scanmode', label: 'Scan mode', type: 'select', options: optionsFor(['Time', 'Carrier', 'Search']) },
        { key: 'radioSpecific.ctsdcsscantype', label: 'QT save mode', type: 'select', options: optionsFor(['Both', 'RX', 'TX']) },
      ],
    },
    {
      id: 'alarm',
      title: 'Alarm & Safety',
      fields: [
        { key: 'radioSpecific.alarmmode', label: 'Alarm mode', type: 'select', options: optionsFor(['Local', 'Send Tone', 'Send Code']) },
        { key: 'radioSpecific.alarmtone', label: 'Sound alarm', type: 'checkbox' },
        { key: 'radioSpecific.totalarm', label: 'Timeout alarm', type: 'select', options: optionsFor(['Off', '1 sec', '2 sec', '3 sec', '4 sec', '5 sec', '6 sec', '7 sec', '8 sec', '9 sec', '10 sec']) },
      ],
    },
    {
      id: 'repeater',
      title: 'Repeater',
      fields: [
        { key: 'radioSpecific.tailclear', label: 'Tail clear', type: 'checkbox' },
        { key: 'radioSpecific.rpttailclear', label: 'Rpt tail clear', type: 'select', options: optionsFor(Array.from({ length: 11 }, (_, i) => `${i * 100} ms`)) },
        { key: 'radioSpecific.rpttaildet', label: 'Rpt tail delay', type: 'select', options: optionsFor(Array.from({ length: 11 }, (_, i) => `${i * 100} ms`)) },
      ],
    },
    {
      id: 'vox',
      title: 'VOX & Misc',
      fields: [
        { key: 'radioSpecific.voxdlytime', label: 'VOX delay time', type: 'select', options: optionsFor(Array.from({ length: 16 }, (_, i) => `${500 + i * 100} ms`)) },
        { key: 'radioSpecific.voxsw', label: 'VOX switch', type: 'checkbox' },
        { key: 'radioSpecific.menuquittime', label: 'Menu quit timer', type: 'select', options: optionsFor([...Array.from({ length: 10 }, (_, i) => `${5 + i * 5} sec`), '60 sec']) },
        { key: 'radioSpecific.dispani', label: 'Display ANI', type: 'checkbox' },
        { key: 'radioSpecific.inputdtmf', label: 'Input DTMF', type: 'checkbox' },
        { key: 'radioSpecific.bcl', label: 'BCL', type: 'checkbox' },
        { key: 'radioSpecific.autolock', label: 'Key auto lock', type: 'checkbox' },
        { key: 'radioSpecific.keylock', label: 'Key lock', type: 'checkbox' },
        { key: 'radioSpecific.fmenable', label: 'Disable FM', type: 'checkbox' },
        { key: 'radioSpecific.hangup', label: 'Hang-up time', type: 'select', options: optionsFor(['3 s', '4 s', '5 s', '6 s', '7 s', '8 s', '9 s', '10 s']) },
      ],
    },
  ],
};
