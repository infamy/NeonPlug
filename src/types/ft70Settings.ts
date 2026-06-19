/**
 * FT-70D settings (stored in RadioSettings.radioSpecific). Select fields use 0-based index.
 * Layout from CHIRP chirp/drivers/ft70.py. Banks, DTMF memories, and programmable keys
 * (prog_key1/prog_key2) are not yet implemented — see ADDING_A_RADIO.md gotchas.
 */
export interface Ft70Settings {
  // Display / opening message
  openingMessageMode: number; // 0=Off, 1=DC, 2=Message
  openingMessageText: string; // up to 6 chars
  lcdDimmer: number;          // 0-5

  // Squelch / volume
  squelch: number;            // 0-15
  volume: number;              // 0-31

  // Power management
  apo: number;                  // 0=Off, 1-24 = 0.5h to 12h (0.5h steps)
  rxSave: number;                // 0-36 (Off, 0.2s..60s — see _RX_SAVE table)

  // Scan
  scanResume: number;            // 0-18 (2.0s..10.0s step 0.5s, then Busy, Hold)
  scanRestart: number;           // 0-27 (0.1s..2.0s step 0.1s, then 2.0s..10.0s step 0.5s)
  scanLamp: boolean;
  ars: boolean;                  // Automatic Repeater Shift

  // Dual watch
  dwResumeInterval: number;      // 0-18, same table as scanResume
  dwInterval: number;            // 0-27, same table as scanRestart
  dwRt: boolean;                 // priority channel revert during dual watch
  homeVfo: boolean;               // transfer VFO to home channel

  // Beep
  beepLevel: number;             // 0-6
  beepSelect: number;            // 0=Key+Scan, 1=Key, 2=Off
  beepEdge: boolean;

  // Lock / keys
  lock: number;                  // 0=Key,1=Dial,2=Key+Dial,3=PTT,4=Key+PTT,5=Dial+PTT,6=All
  lamp: number;                  // 0-10 (2-10 sec, Continuous, Off)
  homeRev: boolean;
  moni: boolean;                 // false=Monitor, true=Tone-Call

  // Misc radio behavior
  bclo: boolean;                 // Busy Channel Lockout
  busyLed: boolean;
  micGain: number;                // 0-8
  pttDelay: number;                // 0-4
  tot: number;                     // 0-20 (Off, 0.5min steps)
  vfoMode: boolean;                 // false=All, true=Band

  // DTMF
  dtmfMode: boolean;                // false=Manual, true=Auto
  dtmfDelay: number;                 // 0-4
  dtmfSpeed: boolean;                 // false=50ms, true=100ms

  // Group Monitor (C4FM)
  gmRing: number;                      // 0=Off, 1=In Range, 2=Always
  gmInterval: number;                   // 0=Long, 1=Normal, 2=Off

  // Digital (C4FM)
  myCall: string;                        // up to 10 chars
  amsTxMode: number;                      // 0=Auto, 1=Digital, 2=FM
  standbyBeep: boolean;
  rxDgId: number;                          // 0-99
  txDgId: number;                          // 0-99
  vwMode: boolean;
  digitalPopup: number;                     // 0-9 (Off, 2s..60s, Continuous)
}
