/**
 * DA-7X2 / AT-D890UV general settings — byte offsets within the settings region.
 *
 * DERIVED FROM HARDWARE, not from a document. Six purpose-built `.rdt` codeplugs
 * were written to a radio through the vendor CPS, with a read-only dump taken
 * before the first and after each one. Every field below was located by matching
 * its seven-state value history against the radio's settings block; ordering was
 * used only to break ties. See DA7X2-RDT-TO-RADIO.md.
 *
 * `max` is the highest value the vendor CPS was ever observed to store in that
 * byte, so it is a LOWER BOUND on the real range, not the range itself. A combo
 * that reached index N has at least N+1 entries. Treat it as "safe to write up
 * to", never as "the list ends here".
 *
 * `cpsLabel` is the OCR transcription of the vendor CPS control label, kept
 * verbatim so a cleaned-up `label` can always be checked against its source.
 *
 * ⚠️ Option labels are NOT known for the multi-value fields — the CPS sweep
 * recorded each control's current value, not its dropdown contents. Until that
 * lands, those render as raw numbers. Do not guess the enums.
 *
 * ⚠️ Read-only. Nothing here has been written back to a radio by NeonPlug.
 *
 * ---------------------------------------------------------------------------
 * Cross-check against the vendor settings marshaller (2026-08-30)
 * ---------------------------------------------------------------------------
 * `sub_005c10e0` is the routine that copies the CPS settings struct into the
 * radio image, and a static trace of it produced an independent name->address
 * map for this same region. It agrees with every one of the 97 fields below
 * that it also names — no offset conflicts, no reordering — which is a full
 * second source for six passes of fingerprint correlation. A separate audit of
 * the CPS-tab assignment agreed on all 100 of them too.
 *
 * It does NOT agree byte-for-byte on the raw addresses, and the reason is worth
 * recording because it is a property of the tool and not of the radio. The
 * marshaller writes two runs of four u32 frequencies as `for i = 0 to 3` loops;
 * the trace modelled each iteration as advancing one byte instead of four, so
 * its cursor loses 12 bytes at each loop and everything after it is reported
 * low. Aligning the two maps:
 *
 *   marshaller 0x000-0x057  ->  here +0      (45 exact name matches)
 *   marshaller 0x058-0x05b  ->  here 0x058-0x067   VfoScanFreq0-3, 4 x u32
 *   marshaller 0x05c-0x0b7  ->  here +12
 *   marshaller 0x0b8-0x0bb  ->  here 0x0c4-0x0d3   AutoRepFreq0-3, 4 x u32
 *   marshaller 0x0bc-0x146  ->  here +24     (36 exact name matches)
 *
 * The two loop runs land exactly on the frequency fields this table already
 * placed from hardware, and the corrected end of the marshaller's range
 * (0x146 + 24 = 0x15e) lands exactly on the last byte this table uses. The
 * offsets here are the hardware ones and stay authoritative; the marshaller
 * contributes the NAMES, which is what `vendorName` on the unmapped bytes
 * carries.
 */

import { D890_CALL_HOLD_TIME } from './constants';

export interface D890SettingsField {
  /** Key under RadioSettings.radioSpecific. */
  key: string;
  /** Human-facing label; cleaned up from cpsLabel. */
  label: string;
  /**
   * Verbatim OCR of the vendor CPS control label, for provenance.
   *
   * Absent where no CPS control label was ever observed — the field's name comes
   * from the settings marshaller instead. See `confidence`.
   */
  cpsLabel?: string;
  /** Tab the control lives on in the vendor CPS, used to group the UI. */
  group: string;
  /**
   * The vendor's own internal name for this field, from the 199 column headers
   * of `OptionalSetting.CSV`.
   *
   * That CSV's column order is monotonic in `.rdt` offset, so anchoring it on
   * offsets already confirmed by hardware forces the rest of the alignment.
   * 184 of the 199 columns then match the file bytes exactly.
   *
   * Kept because it is the vendor's ground truth where our own label is OCR of a
   * screenshot — and because it has already caught several mislabellings.
   */
  vendorField?: string;
  /**
   * How the field's identity was established. Absent means the strongest case:
   * located by writing fingerprint codeplugs to a radio and diffing read-only
   * dumps, then independently confirmed by the vendor settings marshaller.
   *
   *   'swept'       the vendor CPS's own before/after capture names this exact
   *                 .rdt offset, so the label and tab are the CPS's own words.
   *   'vendor-name' the settings marshaller names the byte and nothing more —
   *                 the label is that name cleaned up, and the value range is
   *                 unobserved.
   *   'inferred'    neither; the identity is reasoned from neighbouring fields,
   *                 the disassembly and the CPS help file.
   *
   * Anything other than absent is marked in the Settings tab. Do not promote an
   * entry without an actual capture — DA7X2-NEEDS-CONFIRMING.md lists what would
   * settle each one.
   */
  confidence?: 'hardware' | 'swept' | 'vendor-name' | 'inferred';
  /** Byte offset from D890_ADDR.SETTINGS. */
  offset: number;
  /** Highest value ever observed from the CPS. A lower bound on the range. */
  max: number;
  /**
   * How to turn the stored byte into the value the vendor CPS displays.
   *
   * `displayed = value * scale + offset`, with `zeroLabel` overriding index 0
   * where the CPS shows a word there instead of a number ("Off", "Always").
   *
   * `basis` records the strength of the evidence, because these are DERIVED,
   * not read from a table — the CPS generates these lists numerically and there
   * is no string table to check them against:
   *
   *   'two-point'    two independently observed (index, value) pairs, which
   *                  determine a line exactly.
   *   'range-forced' one observed pair, but it sits at the LAST index and the
   *                  measured list length leaves no other linear mapping — e.g.
   *                  index 30 of a 31-entry list displaying "30".
   *
   * Fields whose list is non-uniform (Time Zone, NOAA frequency) deliberately
   * have no rule. A line fitted through two points of a non-linear list is
   * wrong everywhere between them.
   */
  valueRule?: {
    scale: number;
    offset: number;
    unit: string;
    zeroLabel?: string;
    basis: 'two-point' | 'range-forced';
  };
  /**
   * Number of items in the vendor CPS dropdown, measured directly: the sweep
   * pressed {END}, which lands on the last item, so the resulting byte is N-1.
   * This is the exact ceiling for the field, unlike `max`.
   */
  listLength?: number;
  /**
   * The dropdown's item labels, index 0 first — present ONLY where the whole
   * list is known.
   *
   * Recovered by cross-checking two independent sources, and present only where
   * they agree:
   *
   *   1. The CPS sweep drove each dropdown from its current item to its LAST
   *      item. That yields the label at index 0, the label at index N-1, and —
   *      because {END} lands on the last item — the list length N.
   *   2. `language/english.ini` inside the vendor CPS holds its string table as
   *      contiguous runs of numbered keys, one run per dropdown vocabulary.
   *
   * A list is accepted only when exactly one N-long window in that string table
   * matches BOTH measured endpoint labels. The endpoints are therefore evidence,
   * not assumptions, and the interior comes from the vendor's own strings rather
   * than from interpolation.
   *
   * The ini is shared across five radio models and its runs are supersets: the
   * CPS shows only the first N entries for this radio, which is why N is
   * load-bearing and why a window is taken rather than a whole run.
   *
   * Anything without a verified match has no options here and renders as a raw
   * number. Do not fill these in by guessing an interior.
   */
  options?: readonly string[];
}

export const D890_SETTINGS_FIELDS: readonly D890SettingsField[] = [
  { key: 'keyTone',                         label: 'Key Tone',                            cpsLabel: 'Key Tone',                            group: 'Alert Tone',      offset: 0x000, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'Beep' },
  { key: 'keyLock',                         label: 'Key Lock',                            cpsLabel: 'Key Lock',                            group: 'Key Function',    offset: 0x002, max: 1, listLength: 2, options: ['Manual', 'Auto'], vendorField: 'KeyLock' },
  { key: 'autoShutdown',                    label: 'Auto Shutdown',                       cpsLabel: 'Auto Shutdown',                       group: 'Power Save',      offset: 0x003, max: 4, listLength: 5, vendorField: 'AutoPowerOff', valueRule: { scale: 30, offset: 0, unit: 'min', zeroLabel: 'Off', basis: 'two-point' } },
  { key: 'tot',                             label: 'TOT',                                 cpsLabel: 'TOT',                                 group: 'Other',           offset: 0x004, max: 8, listLength: 9, vendorField: 'TOT' },
  { key: 'frequencyStep',                   label: 'Frequency Step',                      cpsLabel: 'Frequency Step',                      group: 'Other',           offset: 0x008, max: 9, listLength: 10, vendorField: 'Step' },
  { key: 'sqlLevelA',                       label: 'SQL Level(A)',                        cpsLabel: 'SQL Level(A)',                        group: 'Other',           offset: 0x009, max: 5, listLength: 6, vendorField: 'SQL1' },
  { key: 'sqlLevelB',                       label: 'SQL Level(B)',                        cpsLabel: 'SQL Level(B)',                        group: 'Other',           offset: 0x00a, max: 5, listLength: 6, vendorField: 'SQL2' },
  { key: 'powerSave',                       label: 'Power save',                          cpsLabel: 'Power save',                          group: 'Power Save',      offset: 0x00b, max: 2, listLength: 3, vendorField: 'PowerSave' },
  { key: 'voxDelay',                        label: 'VOX Delay',                           cpsLabel: 'VOX Delay',                           group: 'Vox/BT',          offset: 0x00d, max: 25, listLength: 26, vendorField: 'VOX_Delay', valueRule: { scale: 0.1, offset: 0.5, unit: 's', basis: 'two-point' } },
  { key: 'vfoScanType',                     label: 'VFO Scan Type',                       cpsLabel: 'VFO Scan Type',                       group: 'VFO Scan',        offset: 0x00e, max: 2, listLength: 3, options: ['TO', 'CO', 'SE'], vendorField: 'ScanType' },
  { key: 'dmrMicGain',                      label: 'DMR Mic Gain',                        cpsLabel: 'DMR Mic Gain',                        group: 'Volume/Audio',    offset: 0x00f, max: 5, listLength: 6, vendorField: 'MicLevel' },
  { key: 'pf1ShortKey',                     label: 'PF1 Short Key',                       cpsLabel: 'PFI Short Key',                       group: 'Key Function',    offset: 0x010, max: 66, listLength: 67 },
  { key: 'pf2ShortKey',                     label: 'PF2 Short Key',                       cpsLabel: 'PF2 Short Key',                       group: 'Key Function',    offset: 0x011, max: 66, listLength: 67 },
  { key: 'pf3ShortKey',                     label: 'PF3 Short Key',                       cpsLabel: 'PF3 Short Key',                       group: 'Key Function',    offset: 0x012, max: 66, listLength: 67 },
  { key: 'p1ShortKey',                      label: 'P1 Short Key',                        cpsLabel: 'Pl Short Key',                        group: 'Key Function',    offset: 0x013, max: 66, listLength: 67 },
  { key: 'p2ShortKey',                      label: 'P2 Short Key',                        cpsLabel: 'P2 Short Key',                        group: 'Key Function',    offset: 0x014, max: 66, listLength: 67 },
  { key: 'steTypeOfCtcss',                  label: 'STE Type Of CTCSS',                   cpsLabel: 'STE Type Of CTCSS',                   group: 'STE',             offset: 0x017, max: 4, listLength: 5, options: ['On', 'Silent', '120 Degree', '180 Degree', '240 Degree'], vendorField: 'STE_Type' },
  { key: 'groupCallHoldTime',               label: 'Group Call Hold Time',                cpsLabel: 'Group Call Hold Tme',                 group: 'Digital Func',    offset: 0x019, max: 31, listLength: 32, options: D890_CALL_HOLD_TIME, confidence: 'inferred', vendorField: 'GroupTalkHold' },
  { key: 'privateCallHoldTime',             label: 'Private Call Hold Time',              cpsLabel: 'Private Call Hold Tme',               group: 'Digital Func',    offset: 0x01a, max: 31, listLength: 32, options: D890_CALL_HOLD_TIME, confidence: 'inferred', vendorField: 'PersonTalkHold' },
  { key: 'txPreambleDuration',              label: 'TX preamble duration',                cpsLabel: 'TX preamble duration',                group: 'Digital Func',    offset: 0x01c, max: 40, listLength: 41, vendorField: 'Preamble', valueRule: { scale: 60, offset: 0, unit: 'ms', basis: 'two-point' } },
  { key: 'amFmFunction',                    label: 'AM/FM Function',                      cpsLabel: 'AM/FM Function',                      group: 'AM/FM',           offset: 0x021, max: 3, listLength: 4, vendorField: 'FM_En' },
  { key: 'autoBacklightDuration',           label: 'Auto Backlight Duration',             cpsLabel: 'Auto Backlight Duration',             group: 'Display',         offset: 0x027, max: 15, listLength: 16, vendorField: 'AutoBKLightTime' },
  { key: 'smsAlert',                        label: 'SMS Alert',                           cpsLabel: 'SMS Alert',                           group: 'Alert Tone',      offset: 0x029, max: 1, listLength: 2, options: ['None', 'Ring'], vendorField: 'MsgRing' },
  { key: 'tbst',                            label: 'TBST',                                cpsLabel: 'TBST',                                group: 'Other',           offset: 0x02e, max: 3, listLength: 4, vendorField: 'TBST' },
  { key: 'callAlert',                       label: 'Call Alert',                          cpsLabel: 'Call Alen',                           group: 'Alert Tone',      offset: 0x02f, max: 1, listLength: 2, options: ['None', 'Ring'], vendorField: 'CallRing' },
  { key: 'timeZone',                        label: 'Time Zone',                           cpsLabel: 'Tme Zone',                            group: 'GPS/Ranging',     offset: 0x030, max: 33, listLength: 34, vendorField: 'TmZone' },
  { key: 'talkPermit',                      label: 'Talk Permit',                         cpsLabel: 'Talk Permit',                         group: 'Alert Tone',      offset: 0x031, max: 3, listLength: 4, vendorField: 'TalkTips' },
  { key: 'voxDetection',                    label: 'VOX Detection',                       cpsLabel: 'VOX Detection',                       group: 'Vox/BT',          offset: 0x033, max: 2, listLength: 3, options: ['Built-in Microphone', 'External Microphone', 'Both'], vendorField: 'VoxHeadset' },
  { key: 'digitalIdleChannelTone',          label: 'Digital Idle Channel Tone',           cpsLabel: 'Digi Idle Channel Tone',              group: 'Alert Tone',      offset: 0x036, max: 3, listLength: 4, vendorField: 'SqOnVoice' },
  { key: 'menuExitTimeS',                   label: 'Menu Exit Time[s]',                   cpsLabel: 'Menu Exit Tme[s]',                    group: 'Display',         offset: 0x037, max: 11, listLength: 12, vendorField: 'IdleWait', valueRule: { scale: 5, offset: 5, unit: 's', basis: 'two-point' } },
  { key: 'filterOwnIdInMisscall',           label: 'Filter Own ID In MissCall',           cpsLabel: 'Filter Own ID In MissCall',           group: 'Digital Func',    offset: 0x038, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'MissCallFilter' },
  { key: 'startupSound',                    label: 'Startup Sound',                       cpsLabel: 'Startup Sound',                       group: 'Alert Tone',      offset: 0x039, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'Boot_Sound' },
  { key: 'callEndPromptBox',                label: 'Call End Prompt Box',                 cpsLabel: 'Call End Prompt Box',                 group: 'Display',         offset: 0x03a, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'TalkOverPoint' },
  { key: 'digitalRemoteKill',               label: 'Digital Remote Kill',                 cpsLabel: 'Digital Remote Kill',                 group: 'Digital Func',    offset: 0x03c, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'DigiStunKillEn' },
  { key: 'remoteMonitor',                   label: 'Remote Monitor',                      cpsLabel: 'Remote Monitor',                      group: 'Digital Func',    offset: 0x03e, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'RemoteMoniEn' },
  { key: 'getGpsPositioning',               label: 'Get GPS Positioning',                 cpsLabel: 'Get GPS Positioning',                 group: 'GPS/Ranging',     offset: 0x03f, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'GpsReplyEn' },
  { key: 'pf1LongKey',                      label: 'PF1 Long Key',                        cpsLabel: 'PFI Long Key',                        group: 'Key Function',    offset: 0x041, max: 66, listLength: 67 },
  { key: 'pf2LongKey',                      label: 'PF2 Long Key',                        cpsLabel: 'PF2 Long Key',                        group: 'Key Function',    offset: 0x042, max: 66, listLength: 67 },
  // PF3 Long Key never appeared in the CPS sweep — the automation could not
  // reach that control — so 0x043 sat in the unmapped table until the vendor
  // settings marshaller named it PF3_L, between PF2_L (0x042) and P1_L (0x044).
  // It shares the same 67-entry vocabulary as the other nine key controls.
  { key: 'pf3LongKey',                      label: 'PF3 Long Key',                        cpsLabel: 'PF3 Long Key',                        group: 'Key Function',    offset: 0x043, max: 66, listLength: 67 },
  { key: 'p1LongKey',                       label: 'P1 Long Key',                         cpsLabel: 'Pl Long Key',                         group: 'Key Function',    offset: 0x044, max: 66, listLength: 67 },
  { key: 'p2LongKey',                       label: 'P2 Long Key',                         cpsLabel: 'P2 Long Key',                         group: 'Key Function',    offset: 0x045, max: 66, listLength: 67 },
  { key: 'longKeyTimeS',                    label: 'Long Key Time[s]',                    cpsLabel: 'Long Key Tme[s]',                     group: 'Key Function',    offset: 0x046, max: 4, listLength: 5, vendorField: 'PfLongTime', valueRule: { scale: 1, offset: 1, unit: 's', basis: 'range-forced' } },
  { key: 'volumeBar',                       label: 'Volume Bar',                          cpsLabel: 'Volume Bar',                          group: 'Display',         offset: 0x047, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'VolNoteEn' },
  { key: 'autoRepeaterA',                   label: 'Auto Repeater A',                     cpsLabel: 'Auto Repeater A',                     group: 'Auto repeater',   offset: 0x048, max: 2, listLength: 3, vendorField: 'AutoRepeater' },
  { key: 'digitalMonitor',                  label: 'Digital Monitor',                     cpsLabel: 'Digital Monitor',                     group: 'Digital Func',    offset: 0x049, max: 2, listLength: 3, vendorField: 'DigiMoni' },
  { key: 'digitalMonitorCc',                label: 'Digital Monitor CC',                  cpsLabel: 'Digital Monitor CC',                  group: 'Digital Func',    offset: 0x04a, max: 1, listLength: 2, options: ['Any', 'Same'], vendorField: 'DigiMoniCc' },
  { key: 'digitalMonitorId',                label: 'Digital Monitor ID',                  cpsLabel: 'Digital Monitor ID',                  group: 'Digital Func',    offset: 0x04b, max: 1, listLength: 2, options: ['Any', 'Same'], vendorField: 'DigiMoniId' },
  { key: 'monitorSlotHold',                 label: 'Monitor Slot Hold',                   cpsLabel: 'Monitor Slot Hold',                   group: 'Digital Func',    offset: 0x04c, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'DigiMoniSlot' },
  { key: 'lastCaller',                      label: 'Last Caller',                         cpsLabel: 'Last Caller',                         group: 'Display',         offset: 0x04d, max: 3, listLength: 4, vendorField: 'LastCallDis' },
  { key: 'analogCallHoldTimeS',             label: 'Analog Call Hold Time[s]',            cpsLabel: 'Analog Call Hold Tme[s]',             group: 'Other',           offset: 0x050, max: 30, listLength: 31, vendorField: 'AnaHoldTime', valueRule: { scale: 1, offset: 0, unit: 's', basis: 'range-forced' } },
  { key: 'timeDisplay',                     label: 'Time Display',                        cpsLabel: 'Tme Display',                         group: 'Display',         offset: 0x051, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'DateDisKind' },
  { key: 'maxHeadphoneVolume',              label: 'Max Headphone Volume',                cpsLabel: 'Max Headphone Volume',                group: 'Volume/Audio',    offset: 0x052, max: 8, listLength: 9, vendorField: 'EarMaxVol' },
  { key: 'enhancedSoundQuality',            label: 'Enhanced Sound Quality',              cpsLabel: 'Enhanced Sound Quality',              group: 'Volume/Audio',    offset: 0x057, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'EnSoundEffect' },
  { key: 'callChannelIsMaintained',         label: 'Call Channel is Maintained',          cpsLabel: 'Call Channel is Maintained',          group: 'Other',           offset: 0x06e, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'CurTalkPathHold' },
  { key: 'recordDelay',                     label: 'Record Delay',                        cpsLabel: 'Record Delay',                        group: 'Record',          offset: 0x0ae, max: 25, listLength: 26, vendorField: 'RecordDelay', valueRule: { scale: 0.2, offset: 0, unit: 's', basis: 'two-point' } },
  { key: 'displayCurrentContact',           label: 'Display Current Contact',             cpsLabel: 'Display Current Contact',             group: 'Display',         offset: 0x0b9, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'MenuDisWorkContact' },
  { key: 'autoRoamingAtFixedTime',          label: 'Auto Roaming at Fixed Time',          cpsLabel: 'Auto Roaming at Fixed Tme[',          group: 'Auto repeater',   offset: 0x0ba, max: 255, listLength: 256, vendorField: 'WanderPerod', valueRule: { scale: 1, offset: 1, unit: 'min', basis: 'range-forced' } },
  { key: 'callSignDisplayColor',            label: 'Call Sign Display Color',             cpsLabel: 'Call Sign Display Color',             group: 'Display',         offset: 0x0bc, max: 6, listLength: 7, options: ['Orange', 'Red', 'Yellow', 'Green', 'Turquoise', 'Blue', 'White'], vendorField: 'CallSignColour' },
  { key: 'roamingEffectWaitTimeS',          label: 'Roaming Effect Wait Time[s]',         cpsLabel: 'Roaming Effect Wait Tme[s]',          group: 'Auto repeater',   offset: 0x0bf, max: 30, listLength: 31, vendorField: 'WanderEffectWait', valueRule: { scale: 1, offset: 0, unit: 's', zeroLabel: 'None', basis: 'range-forced' } },
  { key: 'standbyCharColor',                label: 'Standby Char Color',                  cpsLabel: 'Standby Char Color',                  group: 'Display',         offset: 0x0c0, max: 7, listLength: 8, options: ['White', 'Black', 'Orange', 'Red', 'Yellow', 'Green', 'Turquoise', 'Blue'], vendorField: 'WorkCharDisColour' },
  { key: 'standbyBkPicture',                label: 'Standby BK Picture',                  cpsLabel: 'Standby BK Picture',                  group: 'Display',         offset: 0x0c1, max: 2, listLength: 3, vendorField: 'bkpic' },
  { key: 'showLastCallOnLaunch',            label: 'Show Last Call On Launch',            cpsLabel: 'Show Last Call On Launch',            group: 'Display',         offset: 0x0c2, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'Ext_Opt2' },
  { key: 'smsFormat',                       label: 'SMS Format',                          cpsLabel: 'SMS Format',                          group: 'Digital Func',    offset: 0x0c3, max: 2, listLength: 3, vendorField: 'SmsFormat' },
  { key: 'autoRepeaterB',                   label: 'Auto Repeater B',                     cpsLabel: 'Auto Repeater B',                     group: 'Auto repeater',   offset: 0x0d4, max: 2, listLength: 3, vendorField: 'AutoRepeaterB' },
  { key: 'addressBookIsSentWithIts',        label: 'Address Book Is Sent With Its',       cpsLabel: 'ddress Book Is Sent With Its',        group: 'Other',           offset: 0x0d5, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'BookOwnId' },
  { key: 'defaultStartupChannel',           label: 'Default Startup Channel',             cpsLabel: 'Default Startup Channel',             group: 'Power-on',        offset: 0x0d6, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'StartChUse' },
  { key: 'repeaterCheck',                   label: 'Repeater Check',                      cpsLabel: 'Repeater Check',                      group: 'Auto repeater',   offset: 0x0dc, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'BsModeCheck' },
  { key: 'repeaterCheckInterval',           label: 'Repeater Check Interval',             cpsLabel: 'Repeater Check Interval[:',           group: 'Auto repeater',   offset: 0x0dd, max: 9, listLength: 10, vendorField: 'TimeBsCheck' },
  { key: 'backlightDelayOf',                label: 'TX Backlight Delay[s]',                  cpsLabel: 'Backlight Delay Of',                  group: 'Display',         offset: 0x0e0, max: 30, listLength: 31, vendorField: 'TxDimWait', valueRule: { scale: 1, offset: 0, unit: 's', zeroLabel: 'Off', basis: 'two-point' } },
  { key: 'separateDisplay',                 label: 'Separate display',                    cpsLabel: 'Separate display',                    group: 'Display',         offset: 0x0e1, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'DiviDisEn' },
  { key: 'chSwitchingKeepsLast',            label: 'CH Switching Keeps Last',             cpsLabel: 'CH Switching Keeps Last',             group: 'Display',         offset: 0x0e2, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'LastHeardChanSet' },
  { key: 'aChannelNameColor',               label: 'A Channel Name Color',                cpsLabel: 'A Channel Name Color',                group: 'Display',         offset: 0x0e3, max: 6, listLength: 7, options: ['Orange', 'Red', 'Yellow', 'Green', 'Turquoise', 'Blue', 'White'], vendorField: 'ChanNameColour' },
  { key: 'receiveBacklightDelayS',          label: 'Receive Backlight Delay[s]',          cpsLabel: 'Receive Backlight Delay[s]',          group: 'Display',         offset: 0x0e5, max: 30, listLength: 31, vendorField: 'RxDimWait', valueRule: { scale: 1, offset: 0, unit: 's', zeroLabel: 'Always', basis: 'range-forced' } },
  { key: 'muteTiming',                      label: 'Out of Range Notify (times)',                         cpsLabel: 'Mute timing',                         group: 'Other',           offset: 0x0e8, max: 255, listLength: 256, vendorField: 'FixTimeMute' },
  { key: 'outOfRangeNotifyTime',            label: 'Out of Range Notify(time',            cpsLabel: 'Out of Range Notify(time:',           group: 'Auto repeater',   offset: 0x0e9, max: 9, listLength: 10, vendorField: 'OutNoteTimes', valueRule: { scale: 1, offset: 1, unit: '', basis: 'range-forced' } },
  { key: 'noaaAlert',                       label: 'NOAA Alert',                          cpsLabel: 'NOAA Alert',                          group: 'Other',           offset: 0x0ef, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'WxAlarmSign' },
  { key: 'gpsMode',                         label: 'Gps Mode',                            cpsLabel: 'Gps Mode',                            group: 'GPS/Ranging',     offset: 0x105, max: 6, listLength: 7, vendorField: 'GpsMode' },
  { key: 'steTime',                         label: 'Ste Time',                            cpsLabel: 'Ste Time',                            group: 'STE',             offset: 0x106, max: 100, listLength: 101, vendorField: 'SteTime', valueRule: { scale: 10, offset: 0, unit: 'ms', basis: 'two-point' } },
  { key: 'bChannelNameColor',               label: 'B Channel Name Color',                cpsLabel: 'B Channel Name Color',                group: 'Display',         offset: 0x109, max: 6, listLength: 7, options: ['Orange', 'Red', 'Yellow', 'Green', 'Turquoise', 'Blue', 'White'], vendorField: 'ChanNameColourB' },
  { key: 'totPredict',                      label: 'TOT Predict',                         cpsLabel: 'TOT Predict',                         group: 'Other',           offset: 0x10b, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'TotPreEn' },
  { key: 'txpowAgc',                        label: 'TxPow Agc',                           cpsLabel: 'TxPow Agc',                           group: 'Other',           offset: 0x10c, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'TxAgcCon' },
  { key: 'zoneNameColourA',                 label: 'Zone Name Colour A',                  cpsLabel: 'Zone Name Colour A',                  group: 'Display',         offset: 0x10d, max: 6, listLength: 7, options: ['Orange', 'Red', 'Yellow', 'Green', 'Turquoise', 'Blue', 'White'], vendorField: 'ZoneNameColourA' },
  { key: 'zoneNameColourB',                 label: 'Zone Name Colour B',                  cpsLabel: 'Zone Name Colour B',                  group: 'Display',         offset: 0x10e, max: 6, listLength: 7, options: ['Orange', 'Red', 'Yellow', 'Green', 'Turquoise', 'Blue', 'White'], vendorField: 'ZoneNameColourB' },
  { key: 'autoShutdownType',                label: 'Auto Shutdown Type',                  cpsLabel: 'Auto Shutdown Type',                  group: 'Power Save',      offset: 0x10f, max: 1, listLength: 2, options: ['is affected by call', 'is not affected by call'], vendorField: 'ApoKind' },
  { key: 'analogIdleChannelTone',           label: 'Analog Idle Channel Tone',            cpsLabel: 'Ana Idle Channel Tone',               group: 'Alert Tone',      offset: 0x111, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'AnaSqOnVoice' },
  { key: 'dateDisplayFormat',               label: 'Date Display Format',                 cpsLabel: 'Date Display Format',                 group: 'Display',         offset: 0x112, max: 1, listLength: 2, vendorField: 'DateDisFormat' },
  { key: 'analogMicGain',                   label: 'Analog Mic Gain',                     cpsLabel: 'Ana Mic Gain',                        group: 'Volume/Audio',    offset: 0x113, max: 5, listLength: 6, vendorField: 'AnaMic' },
  { key: 'noaaFrequency',                   label: 'NOAA Channel',                      cpsLabel: 'NOAA Frequency',                      group: 'Other',           offset: 0x13e, max: 9, listLength: 10, vendorField: 'CurWxChan' },
  { key: 'repeaterMode',                    label: 'Repeater Mode',                       cpsLabel: 'Repeater Mode',                       group: 'Auto repeater',   offset: 0x143, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'RepMode' },
  { key: 'repeaterColourCodeLimit',         label: 'Repeater Colour Code Limit',          cpsLabel: 'Rep Cc Limit',                        group: 'Auto repeater',   offset: 0x144, max: 2, listLength: 3, vendorField: 'RepCcLimit' },
  { key: 'drcDynamicRangeControlRxAgc',     label: 'DRC Dynamic Range Control(Rx AGC)',   cpsLabel: 'DRC Dynamic Ranagle Control(Rx AGC)', group: 'Volume/Audio',    offset: 0x147, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'Drc' },
  { key: 'rxNoiseReduction',                label: 'RX Noise Reduction',                  cpsLabel: 'RX Noise Reduction',                  group: 'Volume/Audio',    offset: 0x148, max: 5, listLength: 6, vendorField: 'RxNr' },
  { key: 'txNoiseReduction',                label: 'TX Noise Reduction',                  cpsLabel: 'TX Noise Reduction',                  group: 'Volume/Audio',    offset: 0x149, max: 5, listLength: 6, vendorField: 'TxNr' },
  { key: 'nightMode',                       label: 'Night Mode',                          cpsLabel: 'Night Mode',                          group: 'Display',         offset: 0x14d, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'NightMode' },
  { key: 'satelliteLocation',               label: 'Satellite Location',                  cpsLabel: 'Sate Location',                       group: 'Satellite',       offset: 0x14e, max: 8, listLength: 9, vendorField: 'SateLocalKind' },
  { key: 'satelliteAosLimit',               label: 'Satellite Aos Limit',                 cpsLabel: 'Sate Aos Limit',                      group: 'Satellite',       offset: 0x151, max: 30, listLength: 31, vendorField: 'SateAosLimit', valueRule: { scale: 1, offset: 0, unit: '', basis: 'range-forced' } },
  { key: 'powerOnVolumeType',               label: 'Power On Volume Type',                cpsLabel: 'Power On Volume Type',                group: 'Volume/Audio',    offset: 0x155, max: 1, listLength: 2, options: ['Preset', 'Minimum'], vendorField: 'VolType' },
  { key: 'powerOnVolume',                   label: 'Power On Volume',                     cpsLabel: 'Power On Volume',                     group: 'Volume/Audio',    offset: 0x156, max: 15, listLength: 16, vendorField: 'MinVolData' },
  { key: 'subSpkInTx',                      label: 'Sub Speaker in TX',                   cpsLabel: 'sub SpkInTx',                         group: 'Volume/Audio',    offset: 0x15b, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'SubSpkInTx' },
  { key: 'simpRepeater',                    label: 'Simp Repearter',                       cpsLabel: 'Simp Repearter',                      group: 'Auto repeater',   offset: 0x15c, max: 1, listLength: 2, options: ['Off', 'On'], vendorField: 'SimpRepter'},

  // ---------------------------------------------------------------------------
  // Recovered from the vendor CPS rather than from a radio (2026-08-30)
  // ---------------------------------------------------------------------------
  // Everything above was located by writing fingerprint codeplugs and diffing
  // dumps. Everything below was derived from the vendor's own artefacts — the
  // settings marshaller's name->address map, the CPS's captured before/after
  // sweep, its help file and its string table — and then put through an
  // adversarial audit whose default was to reject.
  //
  // That audit killed 35 of 118 candidates, including sixteen bytes that had
  // been presented as four "Auto Repeater 2" frequency fields: the u32 boundaries
  // are real, but the min/max and VHF/UHF assignment was not evidenced, and
  // twelve continuation bytes had been surfaced as standalone settings. Those
  // four now live in D890_SETTINGS_FREQUENCIES under neutral names.
  //
  // `confidence` on each entry says which artefact carried it. An option list is
  // present ONLY where the audit could not break it — a label is cheap to be
  // wrong about, an option list states what a value MEANS.

  { key: 'displayMode', label: 'Display Mode', cpsLabel: 'Display Mode', group: 'Work Mode', offset: 0x001, max: 1, options: ['Channel', 'Frequency'], listLength: 2, vendorField: 'DSP', confidence: 'swept' },
  { key: 'language', label: 'Language', cpsLabel: 'Language', group: 'Other', offset: 0x005, max: 255, vendorField: 'Language', confidence: 'swept' },
  { key: 'powerOnInterface', label: 'Power-on Interface', cpsLabel: 'Power-on Interface', group: 'Power-on', offset: 0x006, max: 2, options: ['Default Interface', 'Custom Char', 'Custom Picture'], listLength: 3, vendorField: 'StartDspSet', confidence: 'swept' },
  { key: 'powerOnPassword', label: 'Power-on Password', cpsLabel: 'Power-on Password', group: 'Power-on', offset: 0x007, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'Password', confidence: 'swept' },
  { key: 'voxOnOff', label: 'VOX On/Off', cpsLabel: 'VOX On/Off', group: 'Vox/BT', offset: 0x00c, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'VOX', confidence: 'swept' },
  { key: 'vfMrA', label: 'VF/MR(A)', cpsLabel: 'VF/MR(A)', group: 'Work Mode', offset: 0x015, max: 1, options: ['MEM', 'VFO'], listLength: 2, vendorField: 'RMV1', confidence: 'swept' },
  { key: 'vfMrB', label: 'VF/MR(B)', cpsLabel: 'VF/MR(B)', group: 'Work Mode', offset: 0x016, max: 1, options: ['MEM', 'VFO'], listLength: 2, vendorField: 'RMV2', confidence: 'swept' },
  { key: 'steWhenNoSignal', label: 'STE When No Signal', group: 'STE', offset: 0x018, max: 255, vendorField: 'STE_Freq', confidence: 'vendor-name' },
  { key: 'voiceHeaderRepetitions', label: 'Voice header repetitions', group: 'Digital Func', offset: 0x01b, max: 255, confidence: 'inferred', vendorField: 'VcallRpheader'},
  { key: 'fmWorkChannel', label: 'FM Work Channel', group: 'AM/FM', offset: 0x01d, max: 255, vendorField: 'Work_FMCH', confidence: 'vendor-name' },
  { key: 'fmVfoMem', label: 'FM VFO/MEM', group: 'AM/FM', offset: 0x01e, max: 1, options: ['MEM', 'VFO'], listLength: 2, vendorField: 'FM_VFO', confidence: 'vendor-name' },
  { key: 'memZoneA', label: 'MEM Zone(A)', group: 'Work Mode', offset: 0x01f, max: 255, vendorField: 'Work_Zone1', confidence: 'vendor-name' },
  { key: 'memZoneB', label: 'MEM Zone(B)', group: 'Work Mode', offset: 0x020, max: 255, vendorField: 'Work_Zone2', confidence: 'vendor-name' },
  { key: 'recordFunction', label: 'Record Function', cpsLabel: 'Record Function', group: 'Record', offset: 0x022, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'Record_En', confidence: 'swept' },
  { key: 'manDown', label: 'Man Down', group: 'Other', offset: 0x024, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'FailAlarm', confidence: 'vendor-name' },
  { key: 'monKeyFunction', label: 'MON Key Function', group: 'Key Function', offset: 0x025, max: 255, vendorField: 'MonType', confidence: 'vendor-name' },
  { key: 'brightness', label: 'Brightness', group: 'Display', offset: 0x026, max: 255, vendorField: 'Lightness', confidence: 'vendor-name' },
  // CONFIRMED on hardware 2026-08-30: switching GPS off on the radio moved this
  // byte 1 -> 0, and nothing else in the 256-byte settings region changed.
  { key: 'gps', label: 'GPS', group: 'GPS/Ranging', offset: 0x028, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'Gps', confidence: 'hardware' },
  { key: 'frequencyDisplay', label: 'Frequency Display', group: 'Display', offset: 0x02a, max: 255, vendorField: 'FreqDis', confidence: 'vendor-name' },
  { key: 'fmMonitor', label: 'FM Monitor', group: 'AM/FM', offset: 0x02b, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'FmMon', confidence: 'vendor-name' },
  { key: 'mainChannelSet', label: 'Main Channel Set', cpsLabel: 'Main Channel Set', group: 'Work Mode', offset: 0x02c, max: 1, options: ['A', 'B'], listLength: 2, vendorField: 'MainState', confidence: 'swept' },
  { key: 'subChannelMode', label: 'Sub-Channel Mode', cpsLabel: 'Sub-Channel Mode', group: 'Work Mode', offset: 0x02d, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'SubMode', confidence: 'swept' },
  { key: 'digiCallResetTone', label: 'Digi Call Reset Tone', cpsLabel: 'Digi Call Reset Tone', group: 'Alert Tone', offset: 0x032, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'OverVoice', confidence: 'swept' },
  { key: 'voiceBroadcast', label: 'Voice Broadcast', group: 'Alert Tone', offset: 0x035, max: 255, vendorField: 'Voice_Note', confidence: 'vendor-name' },
  { key: 'maximumVolume', label: 'Maximum Volume', group: 'Volume/Audio', offset: 0x03b, max: 255, vendorField: 'MaxVol', confidence: 'vendor-name' },
  { key: 'selectTxContact', label: 'Select TX Contact', group: 'Other', offset: 0x040, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'ContactOutSetEn', confidence: 'vendor-name' },
  { key: 'manDownDelayS', label: 'Man Down Delay[s]', group: 'Other', offset: 0x04f, max: 255, vendorField: 'ManDownWait', confidence: 'vendor-name' },
  { key: 'gpsTemplateInformation', label: 'GPS Template Information', group: 'GPS/Ranging', offset: 0x053, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'GpsTextUsed', confidence: 'vendor-name' },
  // ⚠️ Reads 255 where the vendor shows 0. Verified against a real radio image
  // 2026-08-31: this sits on an `ff ff` byte PAIR, so it is almost certainly a
  // u16 with 0xFFFF meaning "none" — read here as a single byte, which surfaces
  // 255 as though it were a real value. Do not write it until the width is
  // settled; a one-byte write would leave half a sentinel behind.
  { key: 'autoRepeater1Uhf', label: 'Auto Repeater1(UHF)', group: 'Auto repeater', offset: 0x068, max: 255, vendorField: 'UhfAutoRep', confidence: 'inferred' },
  // ⚠️ Reads 255 where the vendor shows 0. Verified against a real radio image
  // 2026-08-31: this sits on an `ff ff` byte PAIR, so it is almost certainly a
  // u16 with 0xFFFF meaning "none" — read here as a single byte, which surfaces
  // 255 as though it were a real value. Do not write it until the width is
  // settled; a one-byte write would leave half a sentinel behind.
  { key: 'autoRepeater1Vhf', label: 'Auto Repeater1(VHF)', group: 'Auto repeater', offset: 0x069, max: 255, vendorField: 'VhfAutoRep', confidence: 'inferred' },
  { key: 'priorityZoneA', label: 'Priority Zone A', group: 'Other', offset: 0x06f, max: 255, vendorField: 'PriZoneA', confidence: 'vendor-name' },
  { key: 'priorityZoneB', label: 'Priority Zone B', group: 'Other', offset: 0x070, max: 255, vendorField: 'PriZoneB', confidence: 'vendor-name' },
  { key: 'smsConfirmation', label: 'SMS Confirmation', group: 'Digital Func', offset: 0x071, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'MsgOacsuSet', confidence: 'vendor-name' },
  { key: 'callDisplayMode', label: 'Call Display Mode', cpsLabel: 'Call Display Mode', group: 'Display', offset: 0x0af, max: 2, options: ['Turn off Talker Alias', 'Call Sign Based', 'Name Based'], listLength: 3, vendorField: 'CallModeDisKind', confidence: 'swept' },
  { key: 'btOnOff', label: 'BT On/Off', group: 'Vox/BT', offset: 0x0b1, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'BlueToothOn', confidence: 'vendor-name' },
  { key: 'btInternalSpeaker', label: 'BT + int spk', group: 'Vox/BT', offset: 0x0b3, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'SpkInBlueTooth', confidence: 'vendor-name' },
  { key: 'plugInRecordingTone', label: 'Plug-in Recording Tone', group: 'Record', offset: 0x0b4, max: 255, vendorField: 'WtRecordNote', confidence: 'vendor-name' },
  { key: 'rangingIntervalS', label: 'Ranging Interval[s]', group: 'GPS/Ranging', offset: 0x0b5, max: 255, vendorField: 'MeasurePeriod', confidence: 'vendor-name' },
  { key: 'btMicGain', label: 'BT MIC Gain', group: 'Vox/BT', offset: 0x0b6, max: 255, vendorField: 'BhtMicGain', confidence: 'vendor-name' },
  { key: 'btSpkGain', label: 'BT Spk Gain', group: 'Vox/BT', offset: 0x0b7, max: 255, vendorField: 'BhtSpkGain', confidence: 'vendor-name' },
  { key: 'displayChannelNumber', label: 'Display Channel Number', cpsLabel: 'Display Channel Number', group: 'Display', offset: 0x0b8, max: 1, options: ['Actual Channel Number', 'Sequence Number In Zone'], listLength: 2, vendorField: 'ChanNumDisKind', confidence: 'swept' },
  { key: 'startupZoneA', label: 'Startup Zone A', group: 'Power-on', offset: 0x0d7, max: 255, vendorField: 'StartZone1', confidence: 'vendor-name' },
  { key: 'startupZoneB', label: 'Startup Zone B', group: 'Power-on', offset: 0x0d8, max: 255, vendorField: 'StartZone2', confidence: 'vendor-name' },
  // ⚠️ Reads 255 where the vendor shows 0. Verified against a real radio image
  // 2026-08-31: this sits on an `ff ff` byte PAIR, so it is almost certainly a
  // u16 with 0xFFFF meaning "none" — read here as a single byte, which surfaces
  // 255 as though it were a real value. Do not write it until the width is
  // settled; a one-byte write would leave half a sentinel behind.
  { key: 'startupChannelA', label: 'Startup Channel A', group: 'Power-on', offset: 0x0d9, max: 255, vendorField: 'StartCurChan1', confidence: 'inferred' },
  // ⚠️ Reads 255 where the vendor shows 0. Verified against a real radio image
  // 2026-08-31: this sits on an `ff ff` byte PAIR, so it is almost certainly a
  // u16 with 0xFFFF meaning "none" — read here as a single byte, which surfaces
  // 255 as though it were a real value. Do not write it until the width is
  // settled; a one-byte write would leave half a sentinel behind.
  { key: 'startupChannelB', label: 'Startup Channel B', group: 'Power-on', offset: 0x0da, max: 255, vendorField: 'StartCurChan2', confidence: 'inferred' },
  { key: 'roamingZone', label: 'Roaming Zone', group: 'Auto repeater', offset: 0x0db, max: 255, vendorField: 'CurRoamZone', confidence: 'vendor-name' },
  { key: 'repeaterCheckReconnections', label: 'Repeater Check Reconnections', cpsLabel: 'Repeater Check Reconnections', group: 'Auto repeater', offset: 0x0de, max: 255, vendorField: 'BsCheckTimes', confidence: 'swept' },
  { key: 'autoRoamingStartCondition', label: 'Auto Roaming start condition', cpsLabel: 'Auto Roaming start condition', group: 'Auto repeater', offset: 0x0df, max: 1, options: ['Fixed time', 'Out Of Range'], listLength: 2, vendorField: 'FixRomanStartOp', confidence: 'swept' },
  { key: 'repeaterOutOfRangeNotify', label: 'Repeater Out of Range Notify', cpsLabel: 'Repeater Out of Range Notify', group: 'Auto repeater', offset: 0x0e4, max: 2, options: ['Off', 'Bell', 'Voice'], listLength: 3, vendorField: 'OutRepNote', confidence: 'swept' },
  { key: 'autoRoaming', label: 'Auto Roaming', cpsLabel: 'Auto Roaming', group: 'Auto repeater', offset: 0x0e6, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'TimeRoamOn', confidence: 'swept' },
  { key: 'startupReset', label: 'Startup Reset', cpsLabel: 'Startup Reset', group: 'Power-on', offset: 0x0ea, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'StartResetEn', confidence: 'swept' },
  { key: 'btHoldTime', label: 'BT Hold Time', group: 'Vox/BT', offset: 0x0eb, max: 255, vendorField: 'BhtHoldTime', confidence: 'vendor-name' },
  { key: 'btRxDelay', label: 'BT RX Delay', group: 'Vox/BT', offset: 0x0ec, max: 255, vendorField: 'BhtHoldDelay', confidence: 'vendor-name' },
  { key: 'aliasDisplayPriority', label: 'Alias Display Priority', group: 'Digital Func', offset: 0x0ed, max: 2, options: ['Off', 'Contact Alias', 'Air Alias DMR/NX'], listLength: 3, vendorField: 'SctRxTalkAliasDis', confidence: 'vendor-name' },
  { key: 'aliasDataFormat', label: 'Alias Data Format', group: 'Digital Func', offset: 0x0ee, max: 2, options: ['ISO 8', 'ISO 7', 'Unicode'], listLength: 3, vendorField: 'SctTalkAliasForm', confidence: 'vendor-name' },
  { key: 'btPttHold', label: 'BT PTT Hold', group: 'Vox/BT', offset: 0x0f0, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'BhtPttHold', confidence: 'vendor-name' },
  { key: 'btSleepTime', label: 'Ptt Sleep Time', group: 'Vox/BT', offset: 0x104, max: 255, vendorField: 'PttSleepTime', confidence: 'vendor-name' },
  { key: 'manualDialGroupHoldTime', label: 'Manual Dial - Group TG Hold Time', group: 'Digital Func', offset: 0x107, max: 255, vendorField: 'DialGroupHold', confidence: 'vendor-name' },
  { key: 'manualDialPrivateHoldTime', label: 'Manual Dial - Private TG Hold Time', group: 'Digital Func', offset: 0x108, max: 255, vendorField: 'DialPrivateHold', confidence: 'vendor-name' },
  { key: 'digitalEmergencyKind', label: 'Digital Emergency Kind', group: 'Digital Func', offset: 0x10a, max: 255, vendorField: 'DigiEmgKind', confidence: 'vendor-name' },
  // The CPS labels this "GPS Roaming" on the GPS/Ranging tab — confirmed by
  // screenshot 2026-08-30. It is the enable for the geofence table at 0x3502000
  // (STR_ZONE_BARS), which switches the radio to a zone when it enters a circle
  // of a given radius around a position.
  { key: 'zoneBarsEnable', label: 'GPS Roaming', group: 'GPS/Ranging', offset: 0x114, max: 255, vendorField: 'ZoneBarsEn', confidence: 'vendor-name' },
  { key: 'amVfoMem', label: 'AM VFO/MEM', group: 'AM/FM', offset: 0x13f, max: 255, vendorField: 'AmChanVfo', confidence: 'vendor-name' },
  { key: 'amWorkZone', label: 'AM Work Zone', group: 'AM/FM', offset: 0x140, max: 255, vendorField: 'CurAmChan', confidence: 'vendor-name' },
  { key: 'amOffset', label: 'AM Offset', group: 'AM/FM', offset: 0x141, max: 255, vendorField: 'AmOffset', confidence: 'vendor-name' },
  { key: 'amSquelchLevel', label: 'AM Squelch Level', group: 'AM/FM', offset: 0x142, max: 255, vendorField: 'AmSqLevel', confidence: 'vendor-name' },
  { key: 'repeaterSlotPathA', label: 'Repeater Slot Path A', cpsLabel: 'Repeater Slot Path A', group: 'Auto repeater', offset: 0x145, max: 2, options: ['Off', 'Channel A Fixed Time Slot1', 'Channel A Fixed Time Slot2'], listLength: 3, vendorField: 'RepSlotPathA', confidence: 'swept' },
  { key: 'repeaterSlotPathB', label: 'Repeater Slot Path B', cpsLabel: 'Repeater Slot Path B', group: 'Auto repeater', offset: 0x146, max: 2, options: ['Off', 'Channel B Fixed Time Slot1', 'Channel B Fixed Time Slot2'], listLength: 3, vendorField: 'RepSlotPathB', confidence: 'swept' },
  { key: 'dcsSte', label: 'DCS STE', group: 'STE', offset: 0x14a, max: 255, vendorField: 'DcsSte', confidence: 'vendor-name' },
  { key: 'btNoiseReductionBefore', label: 'Bt Nr Before', group: 'Vox/BT', offset: 0x14b, max: 255, vendorField: 'BtNrBefore', confidence: 'vendor-name' },
  { key: 'btNoiseReductionAfter', label: 'Bt Nr After', group: 'Vox/BT', offset: 0x14c, max: 255, vendorField: 'BtNrAfter', confidence: 'vendor-name' },
  { key: 'satelliteTxPower', label: 'Satellite TX Power', cpsLabel: 'Satellite TX Power', group: 'Satellite', offset: 0x14f, max: 3, options: ['Low', 'Mid', 'High', 'Turbo'], listLength: 4, vendorField: 'SateTxPower', confidence: 'swept' },
  { key: 'satelliteAnalogSquelch', label: 'Satellite Analog Squelch', cpsLabel: 'Satellite Analog Squelch', group: 'Satellite', offset: 0x150, max: 255, vendorField: 'SateAnaSql', confidence: 'swept' },
  { key: 'digitalProtocol', label: 'Digital Protocol', group: 'Digital Func', offset: 0x152, max: 255, vendorField: 'DigiProtocal', confidence: 'vendor-name' },
  { key: 'nxdnMicGain', label: 'NXDN Mic Gain', cpsLabel: 'NXDN Mic Gain', group: 'Volume/Audio', offset: 0x153, max: 5, options: ['1', '2', '3', '4', '5', 'Auto'], listLength: 6, vendorField: 'NxdnMic', confidence: 'swept' },
  { key: 'resetDigitalProtocol', label: 'Reset Digital Protocol', cpsLabel: 'Reset Digital Protocol', group: 'Digital Func', offset: 0x154, max: 1, options: ['Off', 'DMR'], listLength: 2, vendorField: 'ResetDigiProtocal', confidence: 'swept' },
  { key: 'noaaMonitor', label: 'NOAA Moni', cpsLabel: 'NOAA Monitor', group: 'Other', offset: 0x157, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'WxMoni', confidence: 'swept' },
  { key: 'noaaScan', label: 'NOAA Scan', cpsLabel: 'NOAA Scan', group: 'Other', offset: 0x158, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'WxScan', confidence: 'swept' },
  { key: 'amFrequencyStep', label: 'Freq Step', group: 'AM/FM', offset: 0x159, max: 9, options: ['2.5K', '5K', '6.25K', '8.33K', '10K', '12.5K', '20K', '25K', '30K', '50K'], listLength: 10, vendorField: 'AmFreqStep', confidence: 'vendor-name' },
  { key: 'repeaterWhitelist', label: 'Repeater Whitelist', cpsLabel: 'Repeater Whitelist', group: 'Auto repeater', offset: 0x15a, max: 1, options: ['Off', 'On'], listLength: 2, vendorField: 'RepIdLimit', confidence: 'swept' },
  { key: 'simpRepeaterVoiceEnable', label: 'Simp Repearter VoiceEn', group: 'Auto repeater', offset: 0x15d, max: 1, confidence: 'inferred', vendorField: 'SimpRepterVoiceEn'},
  { key: 'simpRepeaterSlot', label: 'Simp Repearter Slot', group: 'Auto repeater', offset: 0x15e, max: 2, options: ['Slot 1', 'Slot 2', 'Current Slot'], listLength: 3, vendorField: 'SimpRepterSlot', confidence: 'vendor-name' },
] as const;

/**
 * Frequency fields: u32 little-endian, value = MHz x 100000.
 *
 * All eight verified by writing a distinct frequency through the vendor CPS and
 * reading the radio back — see DA7X2-RDT-TO-RADIO.md. Note this is NOT the
 * BCD-as-hex encoding the radio uses inside channel records; the settings block
 * stores plain integers.
 */
export interface D890FrequencyField {
  key: string;
  label: string;
  group: string;
  offset: number;
  vendorField: string;
}

export const D890_SETTINGS_FREQUENCIES: readonly D890FrequencyField[] = [
  { key: 'vfoScanStartUhf', label: 'VFO Scan Start (UHF)', group: 'VFO Scan',      offset: 0x058, vendorField: 'VfoScanFreq0' },
  { key: 'vfoScanEndUhf',   label: 'VFO Scan End (UHF)',   group: 'VFO Scan',      offset: 0x05c, vendorField: 'VfoScanFreq1' },
  { key: 'vfoScanStartVhf', label: 'VFO Scan Start (VHF)', group: 'VFO Scan',      offset: 0x060, vendorField: 'VfoScanFreq2' },
  { key: 'vfoScanEndVhf',   label: 'VFO Scan End (VHF)',   group: 'VFO Scan',      offset: 0x064, vendorField: 'VfoScanFreq3' },
  { key: 'autoRepMinVhf',   label: 'Auto Repeater Min (VHF)', group: 'Auto repeater', offset: 0x0c4, vendorField: 'AutoRepFreq0' },
  { key: 'autoRepMaxVhf',   label: 'Auto Repeater Max (VHF)', group: 'Auto repeater', offset: 0x0c8, vendorField: 'AutoRepFreq1' },
  { key: 'autoRepMinUhf',   label: 'Auto Repeater Min (UHF)', group: 'Auto repeater', offset: 0x0cc, vendorField: 'AutoRepFreq2' },
  { key: 'autoRepMaxUhf',   label: 'Auto Repeater Max (UHF)', group: 'Auto repeater', offset: 0x0d0, vendorField: 'AutoRepFreq3' },
  // A second four-u32 run at 0x0f4-0x103, found by the same `for i = 0 to 3`
  // loop signature as the two above. Deliberately named by position and not by
  // meaning: the store sites are verified, but which is min and which is max,
  // and which band each belongs to, is NOT evidenced — an audit rejected the
  // Auto-Repeater-2 reading for exactly that reason. Naming them here rather
  // than leaving sixteen loose bytes keeps them out of the unmapped table
  // without claiming to know what they do.
  { key: 'autoRep2Freq0',   label: 'Auto Repeater 2 frequency 0', group: 'Auto repeater', offset: 0x0f4, vendorField: 'AutoRepFreq2_0' },
  { key: 'autoRep2Freq1',   label: 'Auto Repeater 2 frequency 1', group: 'Auto repeater', offset: 0x0f8, vendorField: 'AutoRepFreq2_1' },
  { key: 'autoRep2Freq2',   label: 'Auto Repeater 2 frequency 2', group: 'Auto repeater', offset: 0x0fc, vendorField: 'AutoRepFreq2_2' },
  { key: 'autoRep2Freq3',   label: 'Auto Repeater 2 frequency 3', group: 'Auto repeater', offset: 0x100, vendorField: 'AutoRepFreq2_3' },
] as const;

/** Frequency fields are stored as MHz x this factor. */
export const D890_FREQUENCY_SCALE = 100000;

/**
 * Bytes inside the settings region that no known field claims.
 *
 * The region is read in full, so these ARE decoded off the radio — we simply do
 * not know what they mean. They are surfaced rather than hidden: a user
 * comparing NeonPlug against the vendor CPS can watch one of these move and
 * identify it, which is exactly how the named fields were found.
 *
 * `observedChanging` records whether the byte differed across the six codeplugs
 * written to a radio during the mapping work. A byte that moved is carrying
 * *something*; one that never moved may be padding, may be a setting nobody
 * touched, or may not be writable at all. Neither is proof either way.
 *
 * Read-only, and deliberately not editable — writing a byte whose meaning is
 * unknown is exactly the change that bricks a radio.
 */
export interface D890UnmappedByte {
  offset: number;
  observedChanging: boolean;
  /**
   * The vendor CPS's own internal name for this byte, where the settings
   * marshaller (`sub_005c10e0`) supplies one.
   *
   * A name is NOT a decode: the value range, the option list and the units are
   * all still unknown, which is why these stay in this table rather than
   * becoming fields. It is enough to look the setting up in the vendor CPS and
   * watch which control moves — the same loop that produced the mapped fields.
   */
  vendorName?: string;
}

export const D890_UNMAPPED_BYTES: readonly D890UnmappedByte[] = [
  { offset: 0x023, observedChanging: false, vendorName: 'DTMFSpeed' },
  { offset: 0x034, observedChanging: false, vendorName: 'comVersion' },
  { offset: 0x03d, observedChanging: false, vendorName: 'Reserved_DigiKillEn' },
  { offset: 0x04e, observedChanging: false },
  // Was mapped as "Distance Unit" (vendorField DisUnitSet) until the vendor CPS's
  // GPS/Ranging tab was screenshotted 2026-08-30: it carries exactly four
  // controls — Get GPS Positioning, Time Zone, Gps Mode, GPS Roaming — and no
  // distance unit anywhere in the UI. APRS was checked too; its only similar
  // label is APRSDisTime, a time. The feature does not exist on this radio.
  { offset: 0x0bd, observedChanging: false, vendorName: 'DisUnitSet' },
  { offset: 0x054, observedChanging: false },
  { offset: 0x055, observedChanging: false },
  { offset: 0x056, observedChanging: false },
  { offset: 0x06a, observedChanging: false },
  { offset: 0x06b, observedChanging: false },
  { offset: 0x06c, observedChanging: false },
  { offset: 0x06d, observedChanging: false },
  { offset: 0x0b0, observedChanging: false },
  { offset: 0x0b2, observedChanging: false },
  { offset: 0x0bb, observedChanging: false },
  { offset: 0x0e7, observedChanging: false, vendorName: 'RoamEffectChanDis' },
  { offset: 0x0f1, observedChanging: false },
  { offset: 0x0f2, observedChanging: false },
  { offset: 0x0f3, observedChanging: false },
  { offset: 0x115, observedChanging: false },
  { offset: 0x15f, observedChanging: false },
] as const;

/**
 * Vocabularies known only in part.
 *
 * `options` above is reserved for lists where every entry is accounted for.
 * These are lists where the vendor string table gave a verified alignment but
 * does not cover the whole range, so the gaps are shown as unknown rather than
 * filled in.
 *
 * The PF/P key assignment is the case that matters: nine controls share one
 * 67-entry vocabulary. Its base in `language/english.ini` is key 30049, which is
 * the ONLY base in the entire table matching all four measured anchors —
 * `Voltage` at +1, `V/M` at +8, `Monitor` at +18 and `Main Channel Switch` at
 * +19. (Windows OCR read `V/M` as "vnvl"; the glyphs are a close match and the
 * other three anchors are exact, so the alignment is not in doubt.)
 *
 * Coverage stops at index 19, the last anchored index. The string table does
 * continue past it, but by index 32 it is demonstrably a different vocabulary —
 * `None / Ring / Vibration` is the alert-tone list and `1000 / 1450 / 1750 /
 * 2100Hz` is TBST. Indices 20-31 read like key functions and probably are, but
 * "probably" is not the bar, so they are left unknown.
 *
 * Index 66 is measured directly, not taken from the table.
 */
export interface D890PartialOptions {
  /** Applies to every field carrying this vocabulary id. */
  id: string;
  keys: readonly string[];
  /** One entry per index; null where the label is not known. */
  labels: readonly (string | null)[];
}

export const D890_PARTIAL_OPTIONS: readonly D890PartialOptions[] = [] as const;

/**
 * The PF/P key-function vocabulary — all 67 entries.
 *
 * Nine controls share it (PF1/PF2/PF3/P1/P2 short press, PF1/PF2/P1/P2 long
 * press), so this single list resolves all of them.
 *
 * Recovered from the vendor CPS's own string table, which stores the list in two
 * runs — `english.ini` keys 30050-30079 for indices 1-30 and 39200-39235 for
 * indices 31-66, with index 0 ("Off") not in the table at all. That split is why
 * an earlier attempt here stopped at index 19: a single contiguous run does not
 * cover it, and the keys immediately after 30079 belong to unrelated
 * vocabularies.
 *
 * Verified at six independently measured points before being adopted — indices
 * 0, 1, 8, 18, 19 and 66 all match values read off a radio. The stored byte is
 * the index directly.
 */
export const D890_KEY_FUNCTIONS: readonly string[] = [
  'Off',
  'Voltage',
  'Power',
  'Talk Around',
  'Reverse',
  'Digital Encryption',
  'Call',
  'Vox',
  'V/M',
  'Sub PTT',
  'Scan',
  'AM/FM',
  'Alarm',
  'Record Switch',
  'Record',
  'SMS',
  'Dial',
  'GPS Information',
  'Monitor',
  'Main Channel Switch',
  'Hot Key 1',
  'Hot Key 2',
  'Hot Key 3',
  'Hot Key 4',
  'Hot Key 5',
  'Hot Key 6',
  'Work Alone',
  'Nuisance Delete',
  'Digital Monitor',
  'Sub CH Switch',
  'Priority Zone',
  'VFO Scan',
  'MIC Sound Quality',
  'LastCall Reply',
  'Channel Type Switch',
  'Ranging',
  'Roaming',
  'Channel Ranging',
  'Max Volume',
  'Slot Switch',
  'APRS Type Switch',
  'Zone Select',
  'Timed Roaming Set',
  'APRS Set',
  'Mute timing',
  'CTC/DCS Set',
  'TBST Send',
  'BT Wireless',
  'GPS',
  'Ch.Name',
  'CDT Scan',
  'APRS Send',
  'Ana APRS Info',
  'GPS Roaming',
  'Dim Shut',
  'Satellite Predicting',
  'Sq Level',
  'NOAA Moni',
  'CH Setting',
  'RX NR',
  'TX NR',
  'X-Repeater',
  'Digital Protocol',
  'Freq Sync',
  'Freq Step',
  'Simplex Repeater',
  'NOAA Alert'
] as const;

/** The nine controls that share D890_KEY_FUNCTIONS. */
export const D890_KEY_FUNCTION_FIELDS: readonly string[] = [
  'pf1ShortKey', 'pf2ShortKey', 'pf3ShortKey', 'p1ShortKey', 'p2ShortKey',
  'pf1LongKey', 'pf2LongKey', 'pf3LongKey', 'p1LongKey', 'p2LongKey',
] as const;

/**
 * Packed bitfields. Each of these bytes carries several independent settings, so
 * a read-modify-write is mandatory — writing the byte from one setting's value
 * clobbers its neighbours.
 *
 * The vendor `.rdt` and the radio do NOT agree on bit positions. The vendor CPS
 * sweep established the `.rdt` layout; the bit positions below are the *radio's*,
 * recovered by writing six codeplugs and correlating each bit column across the
 * seven resulting states.
 *
 * Bits whose value never differed across those seven states could not be placed
 * and are deliberately absent rather than guessed.
 */
export interface D890SettingsBitfield {
  key: string;
  label: string;
  group: string;
  offset: number;
  bits: readonly { bitIndex: number; label: string }[];
  /** Bit positions known to belong to this byte but not yet individually identified. */
  unresolvedBits?: readonly number[];
}

export const D890_SETTINGS_BITFIELDS: readonly D890SettingsBitfield[] = [
  {
    key: 'lockFlags',
    label: 'Lock',
    group: 'Key Function',
    offset: 0x0be,
    // rdt 0x0f4 -> radio 0x0be, but repacked: rdt bit 0 lands on radio bit 4 and
    // rdt bit 4 on radio bit 1. Knob Lock and Side Key Lock never changed value
    // across the six written codeplugs, so they are known to occupy radio bits 0
    // and 3 but cannot yet be told apart. Left unlabelled on purpose.
    bits: [
      { bitIndex: 4, label: 'Forced Lock Key' },
      { bitIndex: 1, label: 'Keyboard Lock' },
    ],
    unresolvedBits: [0, 3],
  },
  {
    key: 'displayFlags',
    label: 'Display Flags',
    group: 'Display',
    offset: 0x110,
    // Display Color Code confirmed at bit 2 on both sides. Display Channel Type
    // (rdt bit 0) and Display Time Slot (rdt bit 1) held the same value in every
    // state captured, so their radio positions are unconfirmed; bit 2 mapping
    // straight through makes identity the obvious guess, which is exactly why it
    // is not asserted here.
    bits: [{ bitIndex: 2, label: 'Display Color Code' }],
    unresolvedBits: [0, 1],
  },
] as const;

/** Fields whose only observed values are 0 and 1 — rendered as checkboxes. */
export const D890_SETTINGS_BOOLEAN = new Set<string>(
  D890_SETTINGS_FIELDS.filter((f) => f.max <= 1).map((f) => f.key),
);

/**
 * The alert-tone melody tables.
 *
 * The vendor `.rdt` interleaves `[u16 frequency][u8 duration]` at a 4-byte
 * stride; the radio splits each group of five steps into a u16 frequency array
 * followed by a u16 duration array. Durations are also rescaled: the `.rdt`
 * stores milliseconds, the radio stores units of 10 ms. All 25 steps were
 * confirmed on hardware.
 */
/**
 * `tab` is which of the vendor CPS's two alert-tone tabs owns each melody: the
 * Alert Tone tab carries three blocks and Alert Tone1 carries two, and the five
 * fall in that order. Recorded rather than rendered — nothing in NeonPlug edits
 * these yet.
 */
export const D890_ALERT_TONE_GROUPS = [
  { id: 'group0', frequencies: 0x072, durations: 0x07c, tab: 'Alert Tone' },
  { id: 'group1', frequencies: 0x086, durations: 0x090, tab: 'Alert Tone' },
  { id: 'group2', frequencies: 0x09a, durations: 0x0a4, tab: 'Alert Tone' },
  { id: 'group3', frequencies: 0x116, durations: 0x120, tab: 'Alert Tone1' },
  { id: 'group4', frequencies: 0x12a, durations: 0x134, tab: 'Alert Tone1' },
] as const;

/** Steps per alert-tone group. */
export const D890_ALERT_TONE_STEPS = 5;

/** Radio duration unit is 10 ms; the CPS shows milliseconds. */
export const D890_ALERT_TONE_DURATION_MS = 10;
