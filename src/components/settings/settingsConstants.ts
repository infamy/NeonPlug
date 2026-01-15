/**
 * Settings Tab Constants
 * All dropdown/select options for the Settings tab
 */

export const COLOR_OPTIONS = [
  { value: 0, label: 'White', hex: '#FFFFFF' },
  { value: 1, label: 'Black', hex: '#000000' },
  { value: 2, label: 'Orange', hex: '#FFA500' },
  { value: 3, label: 'Red', hex: '#FF0000' },
  { value: 4, label: 'Yellow', hex: '#FFFF00' },
  { value: 5, label: 'Green', hex: '#00FF00' },
  { value: 6, label: 'Cyan', hex: '#00FFFF' },
  { value: 7, label: 'Blue', hex: '#0000FF' },
];

// Generate UTC zone options programmatically (-12 to +13)
export const UTC_ZONE_OPTIONS = Array.from({ length: 26 }, (_, i) => ({
  value: i,
  label: i === 12 ? 'UTC' : `UTC ${i < 12 ? '' : '+'}${i - 12}:00`,
}));

export const POWER_ON_INTERFACE_OPTIONS = [
  { value: 0, label: 'Power On Picture' },
  { value: 1, label: 'Custom Message' },
  { value: 2, label: 'Battery Volt' },
];

export const AUTO_POWER_OFF_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: '30 Min' },
  { value: 2, label: '60 Min' },
  { value: 3, label: '120 Min' },
  { value: 4, label: '240 Min' },
  { value: 5, label: '480 Min' },
];

export const BUTTON_FUNCTION_OPTIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Power Select' },
  { value: 2, label: 'Volt' },
  { value: 3, label: 'Talkaround' },
  { value: 4, label: 'Digital Encrypt' },
  { value: 5, label: 'Call' },
  { value: 6, label: 'VOX' },
  { value: 7, label: 'V/M' },
  { value: 8, label: 'Alarm' },
  { value: 9, label: 'One Touch Call 1' },
  { value: 10, label: 'One Touch Call 2' },
  { value: 11, label: 'One Touch Call 3' },
  { value: 12, label: 'One Touch Call 4' },
  { value: 13, label: 'One Touch Call 5' },
  { value: 14, label: 'SMS' },
  { value: 15, label: 'CSV Contacts' },
  { value: 16, label: 'Zone Up' },
  { value: 17, label: 'Zone Down' },
  { value: 18, label: 'Scan' },
  { value: 19, label: 'Record Switch' },
  { value: 20, label: 'Previous Record' },
  { value: 21, label: 'Next Record' },
  { value: 22, label: 'FM Radio' },
  { value: 23, label: 'FM Search' },
  { value: 24, label: 'GPS Information' },
  { value: 25, label: 'Monitor' },
  { value: 26, label: 'Switch Main Channel' },
  { value: 27, label: 'Lone Work' },
  { value: 28, label: 'Keypad Lock' },
  { value: 29, label: 'Nuisance Channel Delete' },
  { value: 30, label: 'TBST Send' },
  { value: 31, label: 'APRS Send' },
  { value: 32, label: 'Channel Type' },
  { value: 33, label: 'Display Mode' },
  { value: 34, label: 'CTC Scan' },
  { value: 35, label: 'CTC Setting' },
  { value: 36, label: 'Silent Tone' },
  { value: 37, label: 'Roaming' },
  { value: 38, label: 'Sub-PTT' },
  { value: 39, label: 'Analog Scramble Switch' },
  { value: 40, label: 'One Key Scan Freq' },
  { value: 41, label: 'Flashlight' },
  { value: 42, label: 'Man Down Alarm' },
];

export const ANALOG_CALL_TYPE_OPTIONS = [
  { value: 0, label: 'No. (Contact number)' },
  { value: 1, label: 'Call Type' },
  { value: 2, label: 'Call ID' },
];

export const ONE_TOUCH_CALL_TYPE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Analog' },
  { value: 2, label: 'Digital' },
];

export const DIGITAL_CALL_TYPE_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Private' },
  { value: 2, label: 'Group' },
  { value: 3, label: 'Message' },
  { value: 4, label: 'Call Alert' },
  { value: 5, label: 'Radio Check' },
  { value: 6, label: 'Remote Monitor' },
  { value: 7, label: 'Active' },
  { value: 8, label: 'Kill' },
];

export const FUN_PLUS_OPERATE_MODE_OPTIONS = [
  { value: 0, label: 'Call' },
  { value: 1, label: 'Menu' },
];

export const FUN_PLUS_MENU_SELECT_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'SMS' },
  { value: 2, label: 'New SMS' },
  { value: 3, label: 'Shortcut Text' },
  { value: 4, label: 'Inbox' },
  { value: 5, label: 'Outbox' },
  { value: 6, label: 'Contact List' },
  { value: 7, label: 'Manual Dial' },
  { value: 8, label: 'Call Log' },
  { value: 9, label: 'Sent Call' },
  { value: 10, label: 'Answered Call' },
  { value: 11, label: 'Missed Call' },
  { value: 12, label: 'Zone' },
  { value: 13, label: 'Radio Setting' },
];

export const FUN_PLUS_CALL_WAY_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Analog' },
  { value: 2, label: 'Digital' },
];

export const getColorHex = (colorValue: number): string => {
  const color = COLOR_OPTIONS.find(c => c.value === colorValue);
  return color?.hex || '#FFFFFF';
};
