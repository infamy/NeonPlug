/**
 * Constants for the Yaesu FT-70D (ADMS-10 / generic Yaesu clone protocol).
 * Layout derived from CHIRP chirp/drivers/ft70.py.
 *
 * Unlike the FT-65/FT-4 family (SCU-35, PROGRAM/QX handshake), the FT-70 uses
 * Yaesu's generic block-clone protocol (see chirp/drivers/yaesu_clone.py):
 * the radio is put into clone mode manually by the user (AMS+power, then
 * BAND for download / MODE for upload); software just streams an ID block
 * followed by the full memory image.
 */

export const FT70_BAUD_RATE = 38400;

/** Image is split into two clone blocks: a 10-byte ID block, then the rest. */
export const FT70_ID_BLOCK_SIZE = 10;
export const FT70_DATA_BLOCK_SIZE = 65217;
export const FT70_MEM_SIZE = FT70_ID_BLOCK_SIZE + FT70_DATA_BLOCK_SIZE; // 65227 bytes

/** Chunk size used when streaming the (large) data block, for pacing + progress. */
export const FT70_CHUNK_SIZE = 1024;

/** First 5 bytes of the ID block — radio model identifier. */
export const FT70_MODEL_ID = 'AH51G';

export const FT70_MAX_CHANNELS = 900;
export const FT70_CHANNEL_SIZE = 32; // bytes per memory entry

/** Memory region offsets (absolute, within the full 65227-byte image). */
export const FT70_ADDR_FLAGS    = 0x280a; // flag[900], 1 byte/channel
export const FT70_ADDR_CHANNELS = 0x2d4a; // memory[900], 32 bytes/channel
export const FT70_ADDR_MYCALL   = 0xced0; // callsign[10] + u16 charset
export const FT70_ADDR_CHECKSUM = 0xfeca; // u8, sum of bytes [0x0000, 0xfec9] mod 256

/** Settings block offsets. */
export const FT70_ADDR_OPENING_MESSAGE = 0x047e; // unknown1(1) flag(1) unknown2(2) message[6]
export const FT70_ADDR_SQUELCH         = 0x049a; // u8: unknown:4, squelch:4
export const FT70_ADDR_FIRST_SETTINGS  = 0x04ba; // 6 bytes
export const FT70_ADDR_BEEP_SETTINGS   = 0x04c0; // 2 bytes
export const FT70_ADDR_SCAN_SETTINGS   = 0x04ce; // 47 bytes
export const FT70_ADDR_SCAN_SETTINGS_2 = 0x06b6; // 1 byte: unknown:3, volume:5
export const FT70_ADDR_DIGITAL_SETTINGS_MORE = 0xcf30; // 8 bytes
export const FT70_ADDR_DIGITAL_SETTINGS      = 0xcf7c; // 10 bytes

/** Channel memory[] field offsets (within the 32-byte slot). */
export const MEM = {
  FLAGS1:      0,  // display_tag:1, unknown0:1, deviation:1, clock_shift:1, unknown1:4
  MODE_DUPLEX: 1,  // mode:2, duplex:2, tune_step:4
  FREQ:        2,  // bbcd[3], kHz
  FLAGS2:      5,  // power:2, unknown2:1, ams:1, tone_mode:4
  CHARSETBITS: 6,  // [2]
  LABEL:       8,  // char[6]
  // unknown7[10] at 14..23
  OFFSET:      24, // bbcd[3], kHz
  TONE:        27, // unknown:2, tone:6
  DCS:         28, // unknown:1, dcs:7
  // unknown9 at 29
  FLAGS3:      30, // ams_on_dn_vw_fm:2, unknown8_3:1, unknown8_4:1, smeter:4
  FLAGS4:      31, // unknown10:2, att:1, auto_step:1, auto_mode:1, unknown11:2, bell:1
} as const;

/** mode field values (memory.mode, 2 bits). */
export const FT70_MODES = ['FM', 'AM', 'NFM'] as const;

/** duplex field values (memory.duplex, 2 bits). */
export const FT70_DUPLEX = ['', '-', '+', 'split'] as const;

/** tune_step field values, in kHz (0 = "auto"). */
export const FT70_STEPS: readonly number[] = [5, 6.25, 0, 10, 12.5, 15, 20, 25, 50, 100];

/** tone_mode field values (memory.tone_mode, 4 bits). */
export const FT70_TMODES = ['', 'Tone', 'TSQL', 'DTCS'] as const;

/**
 * CTCSS tone table: index -> Hz (0 = off). Matches CHIRP's chirp_common.TONES.
 * Same table as the FT-65; kept local so ft70 has no cross-radio import.
 */
export const FT70_CTCSS_TONES: readonly number[] = [
  67.0, 69.3, 71.9, 74.4, 77.0, 79.7, 82.5, 85.4, 88.5, 91.5, 94.8, 97.4,
  100.0, 103.5, 107.2, 110.9, 114.8, 118.8, 123.0, 127.3, 131.8, 136.5,
  141.3, 146.2, 151.4, 156.7, 159.8, 162.2, 165.5, 167.9, 171.3, 173.8,
  177.3, 179.9, 183.5, 186.2, 189.9, 192.8, 196.6, 199.5, 203.5, 206.5,
  210.7, 218.1, 225.7, 229.1, 233.6, 241.8, 250.3, 254.1,
];

/**
 * DCS code table: index -> code number. Matches CHIRP's chirp_common.DTCS_CODES.
 */
export const FT70_DCS_CODES: readonly number[] = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74, 114, 115,
  116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174,
  205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265,
  266, 271, 274, 306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365,
  371, 411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464, 465,
  466, 503, 506, 516, 523, 526, 532, 546, 565, 606, 612, 624, 627, 631, 632,
  654, 662, 664, 703, 712, 723, 731, 732, 734, 743, 754,
];

/** power field values (memory.power, 2 bits): 3=Hi, 2=Mid, 1=Low. */
export const FT70_POWER_LEVELS: Record<number, 'High' | 'Medium' | 'Low'> = {
  3: 'High', 2: 'Medium', 1: 'Low',
};
