/**
 * DA-7X2 emergency / alarm — the vendor's "Emergency Information", including
 * the man-down (Lone Worker) feature.
 *
 * TWO regions, both 0x30 bytes, and NEITHER is an array — one record each:
 *
 *   0x3483000  the alarm settings (analog block, then its digital mirror,
 *              then Lone Worker)
 *   0x3482e00  the emergency CONTACT it calls
 *
 * Layout traced from the vendor's write marshaller `Proc_12_57_5DEDF0` and its
 * reader `Proc_12_58_5DFC80`, both live in the normal read/write cycle.
 *
 * ⚠️ This is NOT the DM-32's "Digital Emergency Systems". That radio keeps them
 * in metadata block 0x10 with a different shape; this radio has no block 0x10.
 * `supportsDigitalEmergency` is false here for exactly that reason.
 *
 * Independently corroborated by hardware: a dump of 0x3483000 showed `0a 0a 3c`
 * appearing twice at matching relative offsets, which is Time/Tx_Time/Rx_Time at
 * +0x03 and their digital twins at +0x0B — 10 s, 10 s, 60 s, twice. And
 * 0x3482e00 read `01 00 12 34 56 78`, decoding as Call_Type 1, Ring 0,
 * Code 12345678.
 */

export const D890_EMERGENCY = {
  SETTINGS: 0x3483000,
  CONTACT: 0x3482e00,
  SIZE: 0x30,
} as const;

export interface D890EmergencySettings {
  /** Analog alarm kind. Raw: the label table lives in the CPS form, not the marshaller. */
  analogKind: number;
  toneType: number;
  toneId: number;
  /** Seconds. */
  alarmTime: number;
  txDuration: number;
  rxDuration: number;
  /** Channel to send the alarm on, or null when unset. */
  analogChannel: number | null;
  analogSend: number;
  analogCycle: number;

  digitalKind: number;
  digitalAlarmTime: number;
  digitalTxDuration: number;
  digitalRxDuration: number;
  digitalChannel: number | null;
  digitalSend: number;
  digitalCycle: number;

  /** Lone Worker — the "man down" feature. Seconds / minutes per the CPS labels. */
  loneWorkerResponseTime: number;
  loneWorkerWarningTime: number;
  loneWorkerAck: number;
  /** Vendor `DigiAlarmRevEn` — CPS "Receive Alarm". */
  receiveAlarm: boolean;
}

export interface D890EmergencyContact {
  callType: number;
  /** Vendor masks this to the low nibble. */
  ring: number;
  /** 8 BCD digits. Null when the field is not decimal (erased or unset). */
  code: number | null;
}

/**
 * A channel reference the vendor clamps on read: a high byte above 0x80 means
 * "no channel" rather than a channel above 32768.
 */
function channelRef(bytes: Uint8Array, offset: number): number | null {
  const lo = bytes[offset] ?? 0;
  const hi = bytes[offset + 1] ?? 0;
  if (hi > 0x80) return null;
  const value = lo | (hi << 8);
  return value === 0 ? null : value;
}

export function parseEmergencySettings(bytes: Uint8Array): D890EmergencySettings | null {
  if (bytes.length < 0x16) return null;
  const at = (o: number) => bytes[o] ?? 0;
  return {
    analogKind: at(0x00),
    toneType: at(0x01),
    toneId: at(0x02),
    alarmTime: at(0x03),
    txDuration: at(0x04),
    rxDuration: at(0x05),
    analogChannel: channelRef(bytes, 0x06),
    analogSend: at(0x08),
    analogCycle: at(0x09),

    digitalKind: at(0x0a),
    digitalAlarmTime: at(0x0b),
    digitalTxDuration: at(0x0c),
    digitalRxDuration: at(0x0d),
    digitalChannel: channelRef(bytes, 0x0e),
    digitalSend: at(0x10),
    digitalCycle: at(0x11),

    loneWorkerResponseTime: at(0x12),
    loneWorkerWarningTime: at(0x13),
    loneWorkerAck: at(0x14),
    receiveAlarm: at(0x15) !== 0,
  };
}

/** 8 BCD digits at +0x02. Returns null on any non-decimal nibble. */
export function parseEmergencyContact(bytes: Uint8Array): D890EmergencyContact | null {
  if (bytes.length < 0x06) return null;
  let code: number | null = 0;
  for (let i = 0; i < 4; i += 1) {
    const b = bytes[0x02 + i] ?? 0xff;
    const hi = b >> 4;
    const lo = b & 0x0f;
    if (hi > 9 || lo > 9) { code = null; break; }
    code = (code as number) * 100 + hi * 10 + lo;
  }
  return {
    callType: bytes[0x00] ?? 0,
    // The vendor masks this to the low nibble; the high nibble is not ours.
    ring: (bytes[0x01] ?? 0) & 0x0f,
    code,
  };
}

/**
 * Bytes the vendor's writer never touches, recorded so a future write path
 * preserves them rather than sending zeros.
 *
 * +0x16 is skipped outright; +0x17 is READ but never written; +0x18..+0x20 are
 * driven by CPS globals that have zero references anywhere in the binary, so
 * this CPS always sends zeros for them. What the radio itself puts there is
 * unknown — configure the alarm menu on the handset and re-read to find out.
 */
export const D890_EMERGENCY_UNWRITTEN = [0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20] as const;
