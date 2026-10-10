/**
 * Radtel RT-950 Pro settings, from the function block at 0x9000.
 *
 * Each is the radio's own number, or RT950PRO_RADIO_DEFAULT (-1) where the
 * radio stores 0xFF: a setting still at its factory default, whose value
 * nobody has read. Showing that as the first option in a list would claim a
 * setting the radio may not have.
 */
export const RT950PRO_RADIO_DEFAULT = -1;

export interface Rt950ProSettings {
  squelch: number;
  batterySave: number;
  voxGain: number;
  backlight: number;
  dualWatch: number;
  tot: number;
  keyBeep: number;
  scanMode: number;
  pttId: number;
  sendIdDelay: number;
  displayModeA: number;
  displayModeB: number;
  displayModeC: number;
  autoKeyLock: number;
  tailNoiseClear: number;
  repeaterNoiseClear: number;
  repeaterNoiseDetect: number;
  rogerBeep: number;
  fmRadio: number;
  keypadLock: number;
  bluetooth: number;
  voxDelay: number;
  voxEnabled: number;
}
