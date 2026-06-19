/** FT-65 / FT-4 / FT-25R settings (stored in RadioSettings.ft65Settings). Select fields use 0-based index. */
export interface Ft65Settings {
  apo: number;        // 0=off, 1-24 = 0.5h to 12h
  artsBeep: number;   // 0=off, 1=inrange, 2=always
  artsIntv: number;   // 0=25sec, 1=15sec
  battSave: number;   // 0=off, 1-5 = 200/300/500/1s/2s
  bclo: boolean;
  beep: number;       // 0=key+scan, 1=key, 2=off
  bell: number;       // 0=off, 1=1T, 2=3T, 3=5T, 4=8T, 5=continuous
  cwId: string;       // up to 6 chars A-Z 0-9 space
  useCwid: boolean;
  compander: boolean; // FT-65 / FT-25R only; byte present on FT-4 but no hardware effect
  dtmfMode: number;   // 0=manual, 1=auto
  dtmfDelay: number;  // 0-4 = 50/250/450/750/1000ms
  dtmfSpeed: number;  // 0=50ms, 1=100ms
  edgBeep: boolean;
  keyLock: number;    // 0=key, 1=ptt, 2=key+ptt
  lamp: number;       // 0=5sec, 1=10sec, 2=30sec, 3=key, 4=off
  txLed: boolean;
  bsyLed: boolean;
  moniTcall: number;  // 0=mon, 1=1750Hz, 2=2100Hz, 3=1000Hz, 4=1450Hz
  priRvt: boolean;
  scanResume: number; // 0=busy, 1=hold, 2=time
  rfSquelch: number;  // 0=off, 1-7=S1-S7, 8=S-full
  scanLamp: boolean;
  txSave: boolean;
  vfoSpl: boolean;
  vox: boolean;
  wfmRcv: boolean;
  wxAlert: boolean;
  tot: number;        // 0=off, 1-30 = 1min to 30min
  usePasswd: boolean;
  passwd: string;     // 4 ASCII digit string
}
