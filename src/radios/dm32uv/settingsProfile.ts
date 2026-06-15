/**
 * DM-32UV / DP570UV settings profile.
 * Drives the Settings tab UI; parse/encode stay in structures.ts.
 */
import type { SettingsProfile } from '../../types/settingsProfile';

export const DM32UV_SETTINGS_PROFILE: SettingsProfile = {
  radioType: 'DM-32UV',
  features: ['bootImage', 'oneKeyOperation', 'gpsAprs'],
  sections: [
    {
      id: 'powerOnDisplay',
      title: 'Power On Display',
      fields: [
        { key: 'powerOnDisplayLine1', label: 'Line 1', type: 'text', maxLength: 14 },
        { key: 'powerOnDisplayLine2', label: 'Line 2', type: 'text', maxLength: 14 },
        { key: 'powerOnInterface', label: 'Power On Interface', type: 'select', optionsId: 'powerOnInterface' },
        { key: 'allowReset', label: 'Allow Reset', type: 'checkbox' },
        { key: 'autoPowerOff', label: 'Auto Power Off', type: 'select', optionsId: 'autoPowerOff' },
      ],
    },
    {
      id: 'displaySettings',
      title: 'Display Settings',
      fields: [
        { key: 'callsignColor', label: 'Callsign Color', type: 'color', optionsId: 'color' },
        { key: 'standbyTextColor', label: 'Standby Text Color', type: 'color', optionsId: 'color' },
        { key: 'channelAColor', label: 'Channel A Color', type: 'color', optionsId: 'color' },
        { key: 'channelBColor', label: 'Channel B Color', type: 'color', optionsId: 'color' },
        { key: 'zoneAColor', label: 'Zone A Color', type: 'color', optionsId: 'color' },
        { key: 'zoneBColor', label: 'Zone B Color', type: 'color', optionsId: 'color' },
        { key: 'backlightBrightness', label: 'Backlight Brightness', type: 'range', min: 1, max: 6 },
        { key: 'autoBacklightDuration', label: 'Auto Backlight Duration (s)', type: 'number', min: 5, max: 30, step: 5 },
        { key: 'menuExitTime', label: 'Menu Exit Time', type: 'number', min: 1, max: 30 },
        { key: 'standbyCharacterColor1', label: 'Standby Character Color 1', type: 'number', min: 0, max: 30 },
        { key: 'standbyCharacterColor2', label: 'Standby Character Color 2', type: 'number', min: 0, max: 30 },
      ],
    },
    {
      id: 'alertTones',
      title: 'Alert Tones',
      fields: [
        {
          key: 'alertToneFlags',
          label: 'Alert Tone Flags',
          type: 'bitfield',
          bits: [
            { bitIndex: 0, label: 'Key Press Tone' },
            { bitIndex: 1, label: 'Key Release Tone' },
            { bitIndex: 2, label: 'Menu Exit Tone' },
            { bitIndex: 3, label: 'Call End Tone' },
            { bitIndex: 4, label: 'Talk Permit Tone' },
            { bitIndex: 5, label: 'StartUp Sound' },
            { bitIndex: 6, label: 'Voice Prompt' },
            { bitIndex: 7, label: 'Scan Stop Tone' },
          ],
        },
        {
          key: 'alertToneFlagsCont',
          label: 'Alert Tone Flags (Additional)',
          type: 'bitfield',
          bits: [
            { bitIndex: 0, label: 'Battery Low' },
            { bitIndex: 1, label: 'Analog TX End Tone' },
            { bitIndex: 2, label: 'Analog TX Alert Tone' },
          ],
        },
      ],
    },
    {
      id: 'displayFlags',
      title: 'Display Flags',
      fields: [
        {
          key: 'displayFlags',
          label: 'Display Flags',
          type: 'bitfield',
          bits: [
            { bitIndex: 0, label: 'Volume Change Prompt' },
            { bitIndex: 1, label: 'Time Display' },
          ],
        },
        { key: 'dataDisplayFormat', label: 'Data Display Format', type: 'select', optionsId: 'dataDisplayFormat' },
      ],
    },
    {
      id: 'digitalSettings',
      title: 'Digital Settings',
      fields: [
        {
          key: 'digitalDecodeFlags',
          label: 'Call Match',
          type: 'bitfield',
          bits: [
            { bitIndex: 0, label: 'Private Call Match' },
            { bitIndex: 1, label: 'Group Call Match' },
          ],
        },
        { key: 'callHoldTime', label: 'Call Hold Time [s]', type: 'number', min: 0, max: 61 },
        { key: 'activeWaitTime', label: 'Active Wait Time (raw)', type: 'number', min: 0, max: 255 },
        { key: 'activeRetriesTime', label: 'Active Retries Time (1–8)', type: 'number', min: 1, max: 8 },
        { key: 'preCarrierTime', label: 'Pre-Carrier Time (raw)', type: 'number', min: 0, max: 255 },
        {
          key: 'digitalSettingsFlags',
          label: 'Decode Flags',
          type: 'bitfield',
          bits: [
            { bitIndex: 7, label: 'Remote Monitor Decode' },
            { bitIndex: 6, label: 'Radio Disable Decode' },
            { bitIndex: 5, label: 'Radio Check Decode' },
            { bitIndex: 4, label: 'Radio Enable Decode' },
            { bitIndex: 3, label: 'Call Alert Decode' },
            { bitIndex: 0, label: 'Missed Call Alert' },
          ],
        },
        { key: 'smsFormat', label: 'SMS Format (raw)', type: 'number', min: 0, max: 11 },
        {
          key: 'nameDisplayFlags',
          label: 'Name Display',
          type: 'bitfield',
          bits: [
            { bitIndex: 7, label: 'Name Data Format (bit 1)' },
            { bitIndex: 6, label: 'Name Data Format (bit 0)' },
            { bitIndex: 3, label: 'Send TX Name' },
            { bitIndex: 2, label: 'Name Display Priority' },
          ],
        },
        { key: 'txDwellTime', label: 'TX Dwell Time', type: 'number', min: 0, max: 255 },
      ],
    },
    {
      id: 'vfoEmbedded',
      title: 'VFO / Embedded',
      fields: [
        {
          key: 'vfoEmbeddedFlags',
          label: 'VFO Embedded Flags',
          type: 'bitfield',
          bits: [
            { bitIndex: 0, label: 'VFO Embedded 0' },
            { bitIndex: 1, label: 'VFO Embedded 1' },
            { bitIndex: 2, label: 'VFO Embedded 2' },
          ],
        },
      ],
    },
    {
      id: 'keyLock',
      title: 'Key Lock',
      fields: [
        { key: 'lockKey', label: 'Lock Key', type: 'select', optionsId: 'lockKey' },
        { key: 'knobLock', label: 'Knob Lock', type: 'checkbox' },
        { key: 'sideKeyLock', label: 'Side Key Lock', type: 'checkbox' },
        { key: 'autoKeypadLockDelayTime', label: 'Auto Keypad Lock Delay Time (s)', type: 'number', min: 5, max: 60 },
        { key: 'longPressTime', label: 'Long Press Time', type: 'number', min: 1, max: 5 },
      ],
    },
    {
      id: 'buttonSk1',
      title: 'SK1 Button',
      fields: [
        { key: 'sk1Short', label: 'Short Press', type: 'select', optionsId: 'buttonFunction' },
        { key: 'sk1Long', label: 'Long Press', type: 'select', optionsId: 'buttonFunction' },
      ],
    },
    {
      id: 'buttonSk2',
      title: 'SK2 Button',
      fields: [
        { key: 'sk2Short', label: 'Short Press', type: 'select', optionsId: 'buttonFunction' },
        { key: 'sk2Long', label: 'Long Press', type: 'select', optionsId: 'buttonFunction' },
      ],
    },
    {
      id: 'buttonP1',
      title: 'P1 Button',
      fields: [
        { key: 'p1Short', label: 'Short Press', type: 'select', optionsId: 'buttonFunction' },
        { key: 'p1Long', label: 'Long Press', type: 'select', optionsId: 'buttonFunction' },
      ],
    },
    {
      id: 'buttonP2',
      title: 'P2 Button',
      fields: [
        { key: 'p2Short', label: 'Short Press', type: 'select', optionsId: 'buttonFunction' },
        { key: 'p2Long', label: 'Long Press', type: 'select', optionsId: 'buttonFunction' },
      ],
    },
    // Menu Items: nested keys under menuEnableFlags (handled via path in SettingsTab)
    {
      id: 'menuZones',
      title: 'Zones',
      fields: [
        { key: 'menuEnableFlags.zoneList', label: 'Zone List', type: 'checkbox' },
        { key: 'menuEnableFlags.newZone', label: 'New Zone', type: 'checkbox' },
      ],
    },
    {
      id: 'menuDigital',
      title: 'Digital Features',
      fields: [
        { key: 'menuEnableFlags.callAlert', label: 'Call Alert', type: 'checkbox' },
        { key: 'menuEnableFlags.radioCheck', label: 'Radio Check', type: 'checkbox' },
        { key: 'menuEnableFlags.remoteMonitor', label: 'Remote Monitor', type: 'checkbox' },
        { key: 'menuEnableFlags.radioEnable', label: 'Radio Enable', type: 'checkbox' },
        { key: 'menuEnableFlags.radioDisable', label: 'Radio Disable', type: 'checkbox' },
        { key: 'menuEnableFlags.measurePeriod', label: 'Measure Period', type: 'checkbox' },
      ],
    },
    {
      id: 'menuDisplay',
      title: 'Display/UI',
      fields: [
        { key: 'menuEnableFlags.talkaround', label: 'Talkaround', type: 'checkbox' },
        { key: 'menuEnableFlags.alertTone', label: 'Alert Tone', type: 'checkbox' },
        { key: 'menuEnableFlags.txPower', label: 'TX Power', type: 'checkbox' },
        { key: 'menuEnableFlags.startDisplay', label: 'Start Display', type: 'checkbox' },
        { key: 'menuEnableFlags.langSelect', label: 'Lang Select', type: 'checkbox' },
        { key: 'menuEnableFlags.matchPrivate', label: 'Match Private', type: 'checkbox' },
        { key: 'menuEnableFlags.matchGroup', label: 'Match Group', type: 'checkbox' },
        { key: 'menuEnableFlags.displayMode', label: 'Display Mode', type: 'checkbox' },
      ],
    },
    {
      id: 'menuCommunication',
      title: 'Communication',
      fields: [
        { key: 'menuEnableFlags.smsFormat', label: 'SMS Format', type: 'checkbox' },
        { key: 'menuEnableFlags.subChannelMode', label: 'Sub Channel Mode', type: 'checkbox' },
        { key: 'menuEnableFlags.powerSave', label: 'Power Save', type: 'checkbox' },
        { key: 'menuEnableFlags.fmRadio', label: 'FM Radio', type: 'checkbox' },
        { key: 'menuEnableFlags.gps', label: 'GPS', type: 'checkbox' },
        { key: 'menuEnableFlags.aprs', label: 'APRS', type: 'checkbox' },
        { key: 'menuEnableFlags.record', label: 'Record', type: 'checkbox' },
      ],
    },
    {
      id: 'menuContacts',
      title: 'CSV Contacts',
      fields: [
        { key: 'menuEnableFlags.addContact', label: 'Add Contact', type: 'checkbox' },
        { key: 'menuEnableFlags.delContact', label: 'Del Contact', type: 'checkbox' },
        { key: 'menuEnableFlags.editContact', label: 'Edit Contact', type: 'checkbox' },
        { key: 'menuEnableFlags.sendMessage', label: 'Send Message', type: 'checkbox' },
        { key: 'menuEnableFlags.functionality', label: 'Functionality', type: 'checkbox' },
        { key: 'menuEnableFlags.manualDial', label: 'Manual Dial', type: 'checkbox' },
        { key: 'menuEnableFlags.csvContacts', label: 'CSV Contacts', type: 'checkbox' },
      ],
    },
    {
      id: 'menuCallLog',
      title: 'Call Log',
      fields: [
        { key: 'menuEnableFlags.missedCall', label: 'Missed Call', type: 'checkbox' },
        { key: 'menuEnableFlags.answeredCall', label: 'Answered Call', type: 'checkbox' },
        { key: 'menuEnableFlags.sentCall', label: 'Sent Call', type: 'checkbox' },
        { key: 'menuEnableFlags.delLog', label: 'Del Log', type: 'checkbox' },
      ],
    },
    {
      id: 'menuProgram',
      title: 'Program',
      fields: [
        { key: 'menuEnableFlags.rxFrequency', label: 'RX Frequency', type: 'checkbox' },
        { key: 'menuEnableFlags.txFrequency', label: 'TX Frequency', type: 'checkbox' },
        { key: 'menuEnableFlags.ctcDcs', label: 'CTC/DCS', type: 'checkbox' },
        { key: 'menuEnableFlags.txContact', label: 'TX Contact', type: 'checkbox' },
        { key: 'menuEnableFlags.colorCode', label: 'Color Code', type: 'checkbox' },
        { key: 'menuEnableFlags.timeSlot', label: 'Time Slot', type: 'checkbox' },
        { key: 'menuEnableFlags.radioId', label: 'Radio ID', type: 'checkbox' },
        { key: 'menuEnableFlags.radioName', label: 'Radio Name', type: 'checkbox' },
        { key: 'menuEnableFlags.channelType', label: 'Channel Type', type: 'checkbox' },
        { key: 'menuEnableFlags.tdmaDirectMode', label: 'TDMA Direct Mode', type: 'checkbox' },
        { key: 'menuEnableFlags.rxGroupList', label: 'RX Group List', type: 'checkbox' },
        { key: 'menuEnableFlags.addChannel', label: 'Add Channel', type: 'checkbox' },
        { key: 'menuEnableFlags.channelName', label: 'Channel Name', type: 'checkbox' },
      ],
    },
  ],
};
