/**
 * Constants for the Yaesu FT-65 / FT-4 / FT-25 family (SCU-35 cable).
 * Protocol derived from CHIRP chirp/drivers/ft4.py.
 */

export const FT65_BAUD_RATE = 9600;

/** Total number of 16-byte blocks in memory image. */
export const FT65_NUM_BLOCKS = 0x215;
export const FT65_BLOCK_SIZE = 16;
export const FT65_MEM_SIZE = FT65_NUM_BLOCKS * FT65_BLOCK_SIZE; // 8528 bytes

export const FT65_MAX_CHANNELS = 200;
export const FT65_CHANNEL_SIZE = 16; // bytes per channel slot

/** Memory region offsets. */
export const FT65_ADDR_CHANNELS = 0x0010; // channel slot memory[200]
export const FT65_ADDR_ENABLE   = 0x0E50; // enable bitmap (32 bytes, 1 bit/channel)
export const FT65_ADDR_SCAN     = 0x0E70; // scan bitmap (32 bytes, 1 bit/channel)
export const FT65_ADDR_NAMES    = 0x1000; // name array (8 bytes/entry, 220 entries)
export const FT65_ADDR_TXFREQS  = 0x1700; // TX freq array (4 bytes/entry, 220 entries)
export const FT65_ADDR_SETTINGS = 0x2000; // misc settings (64 bytes)

/** Channel slot field offsets (within the 16-byte slot). */
export const SLOT = {
  TX_PWR:   0,  // u8: 0=lo, 1=med, 2=hi
  FREQ:     1,  // bbcd[4]: Hz/10, big-endian BCD
  TX_CTCSS: 5,  // u8: 0=off, 1-50 = CTCSS_TONES index
  RX_CTCSS: 6,
  TX_DCS:   7,  // u8: 0=off, 1-104 = DCS_CODES index
  RX_DCS:   8,
  DUPLEX:   9,  // u8 low 3 bits: 0=+, 2=-, 4=off/simplex, 5=auto, 6=split
  OFFSET:   10, // ul16 little-endian: multiply by freq_offset_factor
  TX_WIDTH: 12, // u8 bit 0: 0=wide(FM), 1=narrow(NFM)
  STEP:     13,
  SQL_TYPE: 14, // 0=off,1=r-tone,2=t-tone,3=tsql,4=rev tn,5=dcs,6=pager
} as const;

/** sql_type values. */
export const SQL = { OFF: 0, R_TONE: 1, T_TONE: 2, TSQL: 3, REV_TN: 4, DCS: 5, PAGER: 6 } as const;

/** duplex field values. */
export const DUPLEX = { PLUS: 0, MINUS: 2, OFF: 4, AUTO: 5, SPLIT: 6 } as const;

/**
 * CTCSS tone table: index → Hz (0 = off).
 * Matches CHIRP TONE_MAP; radio encodes as index+0 (0=off, 1=67.0, …).
 */
export const CTCSS_TONES: readonly (number | null)[] = [
  null, 67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5,
  85.4, 88.5, 91.5, 94.8, 97.4, 100.0, 103.5,
  107.2, 110.9, 114.8, 118.8, 123.0, 127.3,
  131.8, 136.5, 141.3, 146.2, 151.4, 156.7,
  159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
  177.3, 179.9, 183.5, 186.2, 189.9, 192.8,
  196.6, 199.5, 203.5, 206.5, 210.7, 218.1,
  225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
];

/**
 * DCS code table: index → code number (0 = off).
 * Matches CHIRP DTCS_MAP.
 */
export const DCS_CODES: readonly (number | null)[] = [
  null, 23,  25,  26,  31,  32,  36,  43,  47,  51,  53,  54,
  65,   71,  72,  73,  74,  114, 115, 116, 122, 125, 131,
  132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174,
  205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252,
  255, 261, 263, 265, 266, 271, 274, 306, 311, 315, 325,
  331, 332, 343, 346, 351, 356, 364, 365, 371, 411, 412,
  413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464,
  465, 466, 503, 506, 516, 523, 526, 532, 546, 565, 606,
  612, 624, 627, 631, 632, 654, 662, 664, 703, 712, 723,
  731, 732, 734, 743, 754,
];

/**
 * Frequency offset scale factor per radio family.
 * FT-65 uses 50 kHz steps; FT-4 uses 25 kHz steps.
 */
export const OFFSET_FACTOR_FT65 = 50_000; // Hz per offset unit
export const OFFSET_FACTOR_FT4  = 25_000;

/**
 * Max displayable name characters per family.
 * Physical slot is always 8 bytes; FT-4 front panel only shows 6.
 */
export const MAX_NAME_LEN_FT65 = 8;
export const MAX_NAME_LEN_FT4  = 6;

/**
 * Radio id_str values (matched after stripping trailing null/variant byte).
 * Used to validate the radio identity during connect.
 */
export const ID_PREFIX_FT65 = 'IH-420';
export const ID_PREFIX_FT4X = 'IFT-35R';
export const ID_PREFIX_FT4V = 'IFT-15R';
export const ID_PREFIX_FT25 = 'IFT-25R';
