/**
 * Settings profiles for the FT-65/FT-4/FT-25R family.
 * FT65_SETTINGS_PROFILE includes compander (FT-65/FT-25R have the hardware).
 * FT4_SETTINGS_PROFILE omits it.
 */
import type { SettingsProfile } from '../../types/settingsProfile';

function opt(values: string[]) {
  return values.map((label, i) => ({ value: i, label }));
}

const APO_OPTIONS   = opt(['Off', '0.5h', '1.0h', '1.5h', '2.0h', '2.5h', '3.0h', '3.5h', '4.0h', '4.5h', '5.0h', '5.5h', '6.0h', '6.5h', '7.0h', '7.5h', '8.0h', '8.5h', '9.0h', '9.5h', '10.0h', '10.5h', '11.0h', '11.5h', '12.0h']);
const TOT_OPTIONS   = opt(['Off', ...Array.from({ length: 30 }, (_, i) => `${i + 1} min`)]);
const BATT_OPTIONS  = opt(['Off', '200 ms', '300 ms', '500 ms', '1 s', '2 s']);
const BEEP_OPTIONS  = opt(['Key + Scan', 'Key', 'Off']);
const BELL_OPTIONS  = opt(['Off', '1T', '3T', '5T', '8T', 'Continuous']);
const LAMP_OPTIONS  = opt(['5 sec', '10 sec', '30 sec', 'Key', 'Off']);
const SCAN_OPTIONS  = opt(['Busy', 'Hold', 'Time']);
const SQL_OPTIONS   = opt(['Off', 'S-1', 'S-2', 'S-3', 'S-4', 'S-5', 'S-6', 'S-7', 'S-Full']);
const ARTS_OPTIONS  = opt(['Off', 'In Range', 'Always']);
const ARTS_INTV     = opt(['25 sec', '15 sec']);
const KEY_LOCK_OPT  = opt(['Key', 'PTT', 'Key + PTT']);
const MONI_OPTIONS  = opt(['Monitor', '1750 Hz', '2100 Hz', '1000 Hz', '1450 Hz']);
const DTMF_MODE_OPT = opt(['Manual', 'Auto']);
const DTMF_DLY_OPT  = opt(['50 ms', '250 ms', '450 ms', '750 ms', '1000 ms']);
const DTMF_SPD_OPT  = opt(['50 ms', '100 ms']);

function makeSections(includeCompander: boolean): SettingsProfile['sections'] {
  return [
    {
      id: 'basic',
      title: 'Basic',
      fields: [
        { key: 'ft65Settings.rfSquelch',  label: 'RF Squelch',      type: 'select', options: SQL_OPTIONS },
        { key: 'ft65Settings.apo',         label: 'Auto Power Off',   type: 'select', options: APO_OPTIONS },
        { key: 'ft65Settings.tot',         label: 'Time-Out Timer',   type: 'select', options: TOT_OPTIONS },
        { key: 'ft65Settings.battSave',    label: 'Battery Save',     type: 'select', options: BATT_OPTIONS },
        { key: 'ft65Settings.bclo',        label: 'Busy Channel Lockout', type: 'checkbox' },
        { key: 'ft65Settings.txSave',      label: 'TX Save',          type: 'checkbox' },
      ],
    },
    {
      id: 'audio',
      title: 'Audio & Beep',
      fields: [
        { key: 'ft65Settings.beep',        label: 'Beep',             type: 'select', options: BEEP_OPTIONS },
        { key: 'ft65Settings.bell',        label: 'Bell Rings',       type: 'select', options: BELL_OPTIONS },
        { key: 'ft65Settings.edgBeep',     label: 'Edge Beep',        type: 'checkbox' },
        ...(includeCompander ? [{ key: 'ft65Settings.compander', label: 'Compander', type: 'checkbox' as const }] : []),
      ],
    },
    {
      id: 'display',
      title: 'Display & Indicators',
      fields: [
        { key: 'ft65Settings.lamp',        label: 'Lamp',             type: 'select', options: LAMP_OPTIONS },
        { key: 'ft65Settings.txLed',       label: 'TX LED',           type: 'checkbox' },
        { key: 'ft65Settings.bsyLed',      label: 'Busy LED',         type: 'checkbox' },
        { key: 'ft65Settings.scanLamp',    label: 'Scan Lamp',        type: 'checkbox' },
      ],
    },
    {
      id: 'scan',
      title: 'Scan',
      fields: [
        { key: 'ft65Settings.scanResume',  label: 'Scan Resume',      type: 'select', options: SCAN_OPTIONS },
        { key: 'ft65Settings.priRvt',      label: 'Priority Revert',  type: 'checkbox' },
      ],
    },
    {
      id: 'ptt',
      title: 'PTT & Monitor',
      fields: [
        { key: 'ft65Settings.moniTcall',   label: 'Monitor / Tone',   type: 'select', options: MONI_OPTIONS },
        { key: 'ft65Settings.vox',         label: 'VOX',              type: 'checkbox' },
        { key: 'ft65Settings.keyLock',     label: 'Key Lock',         type: 'select', options: KEY_LOCK_OPT },
      ],
    },
    {
      id: 'misc',
      title: 'Misc',
      fields: [
        { key: 'ft65Settings.vfoSpl',      label: 'VFO Split',        type: 'checkbox' },
        { key: 'ft65Settings.wfmRcv',      label: 'WFM Receive',      type: 'checkbox' },
        { key: 'ft65Settings.wxAlert',     label: 'WX Alert',         type: 'checkbox' },
      ],
    },
    {
      id: 'arts',
      title: 'ARTS',
      fields: [
        { key: 'ft65Settings.useCwid',     label: 'CW ID Enable',     type: 'checkbox' },
        { key: 'ft65Settings.cwId',        label: 'CW ID Callsign',   type: 'text', maxLength: 6 },
        { key: 'ft65Settings.artsBeep',    label: 'ARTS Beep',        type: 'select', options: ARTS_OPTIONS },
        { key: 'ft65Settings.artsIntv',    label: 'ARTS Interval',    type: 'select', options: ARTS_INTV },
      ],
    },
    {
      id: 'dtmf',
      title: 'DTMF',
      fields: [
        { key: 'ft65Settings.dtmfMode',    label: 'DTMF Mode',        type: 'select', options: DTMF_MODE_OPT },
        { key: 'ft65Settings.dtmfDelay',   label: 'DTMF Delay',       type: 'select', options: DTMF_DLY_OPT },
        { key: 'ft65Settings.dtmfSpeed',   label: 'DTMF Speed',       type: 'select', options: DTMF_SPD_OPT },
      ],
    },
    {
      id: 'security',
      title: 'Security',
      fields: [
        { key: 'ft65Settings.usePasswd',   label: 'Password Enable',  type: 'checkbox' },
        { key: 'ft65Settings.passwd',      label: 'Password (4 digits)', type: 'text', maxLength: 4 },
      ],
    },
  ];
}

export const FT65_SETTINGS_PROFILE: SettingsProfile = {
  radioType: 'FT-65',
  sections: makeSections(true),
};

export const FT4_SETTINGS_PROFILE: SettingsProfile = {
  radioType: 'FT-4',
  sections: makeSections(false),
};

// FT-25R shares the FT-65 profile (same hardware, VHF-only)
export const FT25R_SETTINGS_PROFILE: SettingsProfile = {
  radioType: 'FT-25R',
  sections: makeSections(true),
};
