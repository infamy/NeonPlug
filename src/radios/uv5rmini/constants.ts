/**
 * UV5R-Mini protocol constants (from CHIRP baofeng_uv17Pro / uv5minitest).
 */

/** 16-byte ident magic (MSTRING_UV17PROGPS). */
export const BAOFENG_IDENT = new TextEncoder().encode('PROGRAMCOLORPROU');

/** Expected ACK byte after ident. */
export const BAOFENG_ACK = 0x06;

/** Block size for read/write. */
export const BAOFENG_BLOCK_SIZE = 0x40;

/** Read response = 4-byte header + BLOCK_SIZE payload. */
export const BAOFENG_READ_RESPONSE_LEN = 4 + BAOFENG_BLOCK_SIZE;

/** Memory regions: [start addr, size]. Full clone. */
export const BAOFENG_MEM_STARTS = [0x0000, 0x9000, 0xa000];
export const BAOFENG_MEM_SIZES = [0x8040, 0x0040, 0x01c0];
export const BAOFENG_MEM_TOTAL = 0x8240;

/** Number of 64-byte blocks for full clone. */
export const BAOFENG_CLONE_BLOCK_COUNT = BAOFENG_MEM_SIZES.reduce(
  (s, n) => s + n / BAOFENG_BLOCK_SIZE,
  0
);

export const BAOFENG_CHANNEL_COUNT = 999;
export const BAOFENG_CHANNEL_SIZE = 32;

/**
 * Serial baud rate for UV5R-Mini, as CHIRP uses: its UV5RMini sets no rate of its own
 * and inherits UV17Pro.BAUD_RATE = 115200, the only rate in baofeng_uv17Pro.py.
 * This was 38400, and the radio did not answer the ident at that speed (2026-09-12).
 * BLE has no baud rate, so BLE reads never showed it.
 */
export const UV5RMINI_BAUD_RATE = 115200;

/** Firmware version string offset in clone image (CHIRP baofeng_uv17Pro _fw_ver_start). */
export const BAOFENG_FW_VER_OFFSET = 0x1ef0;
