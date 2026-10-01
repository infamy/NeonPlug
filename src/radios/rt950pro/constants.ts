/**
 * Radtel RT-950 Pro: the clone protocol, and where things sit in the image.
 *
 * The protocol is the UV17Pro family's, the UV5R-Mini's sibling: an ident the
 * radio acknowledges, two probes, a `SEND` frame that picks the scrambling key,
 * then 0x80-byte blocks requested by address. What differs is the ident, the
 * block size, the model probe's reply and the regions.
 *
 * Sources: the notes of the RT-950 Pro CHIRP driver
 * (github.com/NathanBarguss/Chirp_Radtel-RT-950-Pro), worked out from the
 * vendor CPS — that repository carries no licence, so only facts are taken from
 * it, none of its code — and the RT-950 Pro Bluetooth bridge
 * (github.com/nivingoonesekera/Radtel-RT-950Pro-BLE-bridge-for-CHIRP-and-CPS,
 * MIT), which confirmed the APRS write command and the write timings on a
 * radio. Where the two disagree, the one tested on hardware wins.
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

/**
 * Bluetooth: an HM-10-style module. Data goes both ways on ffe1 (writes, and
 * notifications back); the radio ignores it until a one-time unlock is written
 * to ff31. The unlock is replayed as the Bluetooth bridge captured it from the
 * radio's phone app — the radio accepts the replay.
 *
 * ff31's service isn't recorded anywhere; ff30 is the conventional home for
 * it, and the connection looks through every service it is allowed to see.
 */
export const RT950PRO_BLE_DATA_SERVICE = '0000ffe0-0000-1000-8000-00805f9b34fb';
export const RT950PRO_BLE_DATA_CHAR = '0000ffe1-0000-1000-8000-00805f9b34fb';
export const RT950PRO_BLE_UNLOCK_SERVICES = ['0000ff30-0000-1000-8000-00805f9b34fb'];
export const RT950PRO_BLE_UNLOCK_CHAR = '0000ff31-0000-1000-8000-00805f9b34fb';
export const RT950PRO_BLE_UNLOCK = Uint8Array.of(
  0x3f, 0x3f, 0x3f, 0x3f, 0x02, 0x2e, 0x17, 0x1d, 0x5e, 0x57, 0x25, 0x2f, 0x57, 0x13, 0x62, 0x56, 0x04, 0x4b, 0x23, 0x42
);
/** The radio's link carries 20 bytes per write (its MTU is pinned at 23). */
export const RT950PRO_BLE_CHUNK = 20;

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
  /** How long a written block may take to be acknowledged — a flash commit can stall for seconds. */
  ackTimeoutMs: number;
  /** A pause after each acknowledged block, so the radio's flash keeps up. */
  pauseAfterBlockMs: number;
  /**
   * Writing this region commits the session to flash. The radio may drop a
   * Bluetooth link straight after acknowledging it, so the 'E' that follows is
   * sent on a best-effort basis.
   */
  commits?: boolean;
}

/**
 * The regions the vendor CPS reads and writes, in its order. Nothing else is
 * ever written: the 2 KB at 0x7800 and everything from 0xE000 up read back but
 * hold what looks like calibration — writing there changed one owner's TX
 * behaviour — and the CPS never touches them.
 *
 * APRS lives in a separate address space with its own commands: read 0x54,
 * write 0x58. The CHIRP driver's notes had 0x55 for the write; the Bluetooth
 * project found the radio answers 0x55 with an error frame (54 5A …) and
 * accepts 0x58, and read the change back. The pacing is that project's too:
 * channels acknowledge quickly, the small regions and APRS commit to flash.
 */
export const RT950PRO_SEGMENTS: readonly Rt950Segment[] = [
  { label: 'Channels', readCommand: 0x52, writeCommand: 0x57, address: 0x0000, length: 0x7800, ackTimeoutMs: 8000, pauseAfterBlockMs: 0 },
  { label: 'VFO', readCommand: 0x52, writeCommand: 0x57, address: 0x8000, length: 0x0100, ackTimeoutMs: 10000, pauseAfterBlockMs: 50 },
  { label: 'Function settings', readCommand: 0x52, writeCommand: 0x57, address: 0x9000, length: 0x0100, ackTimeoutMs: 10000, pauseAfterBlockMs: 50 },
  { label: 'DTMF', readCommand: 0x52, writeCommand: 0x57, address: 0xa000, length: 0x0200, ackTimeoutMs: 10000, pauseAfterBlockMs: 50 },
  { label: 'Modulation parameters', readCommand: 0x52, writeCommand: 0x57, address: 0xb000, length: 0x0200, ackTimeoutMs: 10000, pauseAfterBlockMs: 50 },
  { label: 'Modulation names', readCommand: 0x52, writeCommand: 0x57, address: 0xd000, length: 0x0300, ackTimeoutMs: 10000, pauseAfterBlockMs: 50 },
  { label: 'APRS', readCommand: 0x54, writeCommand: 0x58, address: 0x0000, length: 0x0080, ackTimeoutMs: 30000, pauseAfterBlockMs: 100, commits: true },
];

/** How long to let the APRS commit settle before ending the session. */
export const RT950PRO_COMMIT_SETTLE_MS = 500;

/** Where each segment starts in the image: the segments laid end to end, in order. */
export const RT950PRO_SEGMENT_OFFSETS: readonly number[] = RT950PRO_SEGMENTS.reduce<number[]>(
  (offsets, _segment, i) => [...offsets, i === 0 ? 0 : offsets[i - 1] + RT950PRO_SEGMENTS[i - 1].length],
  []
);

export const RT950PRO_IMAGE_SIZE = RT950PRO_SEGMENTS.reduce((sum, s) => sum + s.length, 0);
