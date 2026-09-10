/**
 * Encryption keys reaching the write plan.
 *
 * They were the last table in the 2026-09-10 audit whose edits were silently
 * discarded — a working emitter, editable in the UI, and never passed to
 * `planCodeplugWrite`.
 *
 * They are also the ONLY one of the five that needed no slot map and no
 * refusal. Identity is genuinely stable: `id` IS the hardware slot,
 * `encryptionType` picks which of the four tables it lives in, and
 * `encryptionKeysStore` renumbers on neither add nor delete. Every other table
 * loses its slots the moment the list is edited.
 *
 * ⚠️ `entryNumber` is a position in the flattened list and must never place a
 * key: slot 1 exists in three tables at once.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planCodeplugWrite } from '../../src/radios/d890uv/codeplugWrite';
import { D890_ADDR, D890_ENCRYPTION_TYPE } from '../../src/radios/d890uv/constants';
import { parseChannel, parseZone } from '../../src/radios/d890uv/structures';
import type { Channel } from '../../src/models/Channel';
import type { EncryptionKey } from '../../src/models/EncryptionKey';

const DIR = join(__dirname, '../fixtures/d890uv');
const REAL_MASK = new Uint8Array(readFileSync(join(DIR, 'channel-mask-512.bin')));
const rec = (i: number) => new Uint8Array(readFileSync(join(DIR, `channel-${i}.bin`)));

/** AES_KEY_BYTES is 32, so the encoder demands 64 hex characters. */
const AES_HEX = '00112233445566778899AABBCCDDEEFF'.repeat(2);

const aesKey = (id: number, hex: string): EncryptionKey => ({
  entryNumber: 99, id, name: `K${id}`,
  encryptionType: D890_ENCRYPTION_TYPE.AES128, key: hex,
} as EncryptionKey);

function setup(tables: Parameters<typeof planCodeplugWrite>[0]['tables']) {
  const channels: Channel[] = [];
  const originals = new Map<number, Uint8Array>();
  for (let i = 0; i < 4; i += 1) {
    const bytes = rec(i);
    channels.push(parseChannel(bytes, i).channel);
    originals.set(i + 1, bytes);
  }
  const readLog = new Map<number, Uint8Array>();
  const zoneMask = new Uint8Array(D890_ADDR.ZONE_SET_SIZE);
  zoneMask[0] |= 1;
  readLog.set(D890_ADDR.ZONE_SET, zoneMask);
  const members = new Uint8Array(D890_ADDR.ZONE_CHANNELS_STRIDE);
  members[2] = 0xff; members[3] = 0xff;
  const name = new Uint8Array(D890_ADDR.ZONE_NAME_STRIDE);
  name[0] = 0x5a; name[2] = 0x31;
  readLog.set(D890_ADDR.ZONE_CHANNELS, members);
  readLog.set(D890_ADDR.ZONE_NAMES, name);
  // Two AES slots, both holding a recognisable key.
  for (const slot of [0, 1]) {
    const r = new Uint8Array(D890_ADDR.AES_KEY_STRIDE);
    r.fill(0xaa, D890_ADDR.AES_KEY_OFFSET, D890_ADDR.AES_KEY_OFFSET + D890_ADDR.AES_KEY_BYTES);
    readLog.set(D890_ADDR.AES_KEY_TABLE + slot * D890_ADDR.AES_KEY_STRIDE, r);
  }
  return {
    channels, zones: [parseZone(name, members, 0)], zoneSlots: [0], readLog,
    writeUnmodelledVerbatim: false as const,
    channelInput: {
      originals, originalMask: REAL_MASK,
      counts: { DMRTalkGroups: 6, ScanList: 2, DMRReceiveGroupCallList: 1,
        RadioIDList: 4, AESEncryptionCode: 2 },
      referencingTables: [],
    },
    tables,
  };
}

const keyBytesAt = (plan: ReturnType<typeof planCodeplugWrite>, slot: number) => {
  const at = D890_ADDR.AES_KEY_TABLE + slot * D890_ADDR.AES_KEY_STRIDE
    + D890_ADDR.AES_KEY_OFFSET;
  const frameAt = at - (at % 0x10);
  const frame = plan.frames.find((f) => f.address === frameAt);
  return frame ? Array.from(frame.data.subarray(at - frameAt, at - frameAt + 4)) : null;
};

describe('encryption keys reach the plan', () => {
  it('writes an edited key to the slot its id names', () => {
    const plan = planCodeplugWrite(setup({
      encryptionKeys: [aesKey(1, AES_HEX)],
    }));
    // Slot 1, not entryNumber 99 — entryNumber is a list position.
    expect(keyBytesAt(plan, 1)).toEqual([0x00, 0x11, 0x22, 0x33]);
    // Slot 0 is untouched, because nothing asked for it.
    expect(keyBytesAt(plan, 0)).toBeNull();
  });

  it('CLEARS a deleted key rather than leaving it on the radio', () => {
    // Writing only the surviving keys is a silent no-op: the removed key's
    // record stays exactly where it was and the deletion never happens.
    const plan = planCodeplugWrite(setup({
      encryptionKeys: [aesKey(0, AES_HEX)],
      clearedEncryptionKeys: [{ encryptionType: D890_ENCRYPTION_TYPE.AES128, id: 1 }],
    }));
    expect(keyBytesAt(plan, 1)).toEqual([0, 0, 0, 0]);
  });

  it('plans the clear even when every key was deleted', () => {
    // The emitter used to be gated on the key list being non-empty, so removing
    // the last key wrote nothing at all.
    const plan = planCodeplugWrite(setup({
      encryptionKeys: [],
      clearedEncryptionKeys: [{ encryptionType: D890_ENCRYPTION_TYPE.AES128, id: 1 }],
    }));
    expect(keyBytesAt(plan, 1)).toEqual([0, 0, 0, 0]);
  });

  it('skips a slot the session never read rather than inventing one', () => {
    const plan = planCodeplugWrite(setup({
      encryptionKeys: [aesKey(7, AES_HEX)],
    }));
    expect(keyBytesAt(plan, 7)).toBeNull();
  });
});
