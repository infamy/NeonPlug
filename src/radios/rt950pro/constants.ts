/**
 * Radtel RT-950 Pro: the clone protocol, and where things sit in the image.
 *
 * The protocol is the UV17Pro family's, the UV5R-Mini's sibling: an ident the
 * radio acknowledges, two probes, a `SEND` frame that picks the scrambling key,
 * then 0x80-byte blocks requested by address. What differs is the ident, the
 * block size, the model probe's reply and the regions.
 *
 * Source: the notes and code of the RT-950 Pro CHIRP driver
 * (github.com/NathanBarguss/Chirp_Radtel-RT-950-Pro), worked out from the
 * vendor CPS. That repository carries no licence, so only facts are taken from
 * it — commands, addresses, byte layouts — and none of its code.
 *
 * ⚠️ None of this has been on a radio yet.
 */

export const RT950PRO_BAUD_RATE = 115200;

/** Sent first; the radio acknowledges it with RT950PRO_ACK. */
export const RT950PRO_IDENT = new TextEncoder().encode('PROGRAMBT9000U');
export const RT950PRO_ACK = 0x06;

/** 'F' — the radio answers with 16 bytes nobody has decoded yet. */
export const RT950PRO_PROBE = 0x46;
export const RT950PRO_PROBE_REPLY_LEN = 16;

/** 'M' — the radio answers with its model name, padded to 12 bytes. */
export const RT950PRO_MODEL_QUERY = 0x4d;
export const RT950PRO_MODEL_REPLY_LEN = 12;
/** What that name starts with on this radio. */
export const RT950PRO_MODEL_PREFIX = 'RT-950';

/**
 * The frame that picks the scrambling key, acknowledged with RT950PRO_ACK. The
 * vendor CPS fills it with random bytes; this is the fixed frame CHIRP sends the
 * UV5R-Mini, which asks for key 1 by the same rule (see negotiatedKeyIndex).
 */
export const RT950PRO_KEY_FRAME = Uint8Array.of(
  0x53, 0x45, 0x4e, 0x44, 0x21, 0x05, 0x0d, 0x01, 0x01, 0x01, 0x04, 0x11,
  0x08, 0x05, 0x0d, 0x0d, 0x01, 0x11, 0x0f, 0x09, 0x12, 0x09, 0x10, 0x04, 0x00
);

/** 'E' — ends a read or write session. */
export const RT950PRO_END = 0x45;

/** Every block is 0x80 bytes, read and write, after a 4-byte header. */
export const RT950PRO_BLOCK_SIZE = 0x80;
export const RT950PRO_HEADER_LEN = 4;

export const RT950PRO_CHANNEL_COUNT = 960;
export const RT950PRO_CHANNEL_SIZE = 32;
export const RT950PRO_NAME_LENGTH = 12;

/** One region the vendor CPS reads and writes, block by block. */
export interface Rt950Segment {
  label: string;
  readCommand: number;
  writeCommand: number;
  /** Address in the radio's own address space for that command pair. */
  address: number;
  length: number;
}

/**
 * The regions the vendor CPS reads and writes, in its order. Nothing else is
 * ever written: the 2 KB at 0x7800 and everything from 0xE000 up read back but
 * hold what looks like calibration — writing there changed one owner's TX
 * behaviour — and the CPS never touches them.
 *
 * APRS lives in a separate address space with its own command pair.
 */
export const RT950PRO_SEGMENTS: readonly Rt950Segment[] = [
  { label: 'Channels', readCommand: 0x52, writeCommand: 0x57, address: 0x0000, length: 0x7800 },
  { label: 'VFO', readCommand: 0x52, writeCommand: 0x57, address: 0x8000, length: 0x0100 },
  { label: 'Function settings', readCommand: 0x52, writeCommand: 0x57, address: 0x9000, length: 0x0100 },
  { label: 'DTMF', readCommand: 0x52, writeCommand: 0x57, address: 0xa000, length: 0x0200 },
  { label: 'Modulation parameters', readCommand: 0x52, writeCommand: 0x57, address: 0xb000, length: 0x0200 },
  { label: 'Modulation names', readCommand: 0x52, writeCommand: 0x57, address: 0xd000, length: 0x0300 },
  { label: 'APRS', readCommand: 0x54, writeCommand: 0x55, address: 0x0000, length: 0x0080 },
];

/** Where each segment starts in the image: the segments laid end to end, in order. */
export const RT950PRO_SEGMENT_OFFSETS: readonly number[] = RT950PRO_SEGMENTS.reduce<number[]>(
  (offsets, _segment, i) => [...offsets, i === 0 ? 0 : offsets[i - 1] + RT950PRO_SEGMENTS[i - 1].length],
  []
);

export const RT950PRO_IMAGE_SIZE = RT950PRO_SEGMENTS.reduce((sum, s) => sum + s.length, 0);
