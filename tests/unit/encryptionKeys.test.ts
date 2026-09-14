import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ENCRYPTION_TYPES,
  clearEncryptionKey,
  editEncryptionKey,
  encryptionTypeLabel,
  isEncryptionTypeLocked,
} from '../../src/utils/encryptionKeys';
import type { EncryptionKey } from '../../src/models/EncryptionKey';

const key = (patch: Partial<EncryptionKey> = {}): EncryptionKey => ({
  entryNumber: 1,
  id: 1,
  name: 'K1',
  encryptionType: 3,
  key: 'AABB',
  ...patch,
});

describe('a key’s type is fixed once set', () => {
  it('refuses to retype an existing key', () => {
    // The invariant. On a radio that keeps a separate table per type, retyping
    // moves the key to a different table and slot, and every channel that
    // referenced the old slot silently points at whatever else is there.
    const result = editEncryptionKey(key({ encryptionType: 3 }), 'encryptionType', 4);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/cannot be changed/i);
  });

  it('allows choosing a type for an empty slot, because that is creation', () => {
    const result = editEncryptionKey(key({ encryptionType: 0, name: '', key: '' }), 'encryptionType', 2);
    expect(result).toEqual({ ok: true, updates: { encryptionType: 2 } });
  });

  it('treats setting the same type as a no-op rather than a violation', () => {
    // Controls re-emit their current value; refusing that would surface an alert
    // for an edit the user did not make.
    const result = editEncryptionKey(key({ encryptionType: 3 }), 'encryptionType', 3);
    expect(result).toEqual({ ok: true, updates: {} });
  });

  it('leaves every other field freely editable', () => {
    for (const [field, value] of [['name', 'NEW'], ['key', 'FFEE']] as const) {
      const result = editEncryptionKey(key(), field, value);
      expect(result).toEqual({ ok: true, updates: { [field]: value } });
    }
  });

  it('clears the key material along with the type', () => {
    // Leaving key material in a slot marked None is how a "deleted" key gets
    // written back to a radio.
    expect(clearEncryptionKey()).toEqual({ encryptionType: 0, name: '', key: '' });
  });

  it('locks only once a type is actually set', () => {
    expect(isEncryptionTypeLocked({ encryptionType: 0 })).toBe(false);
    expect(isEncryptionTypeLocked({ encryptionType: undefined })).toBe(false);
    expect(isEncryptionTypeLocked({ encryptionType: 1 })).toBe(true);
  });

  it('names every type, and says so plainly for one it does not know', () => {
    expect(ENCRYPTION_TYPES[0]).toBe('None');
    expect(encryptionTypeLabel(4)).toBe('AES256');
    expect(encryptionTypeLabel(99)).toBe('Unknown (99)');
  });
});

describe('the UI cannot bypass the rule', () => {
  const TAB = readFileSync(
    join(__dirname, '../../src/components/digital/DigitalTab.tsx'),
    'utf8',
  );

  it('routes key edits through the validator instead of straight to the store', () => {
    // The control being hidden is not the guard — the handler is. A future
    // change that re-adds an editable select must still hit this.
    expect(TAB).toContain('editEncryptionKey(');
    const handler = TAB.slice(TAB.indexOf('const handleKeyChange'), TAB.indexOf('const handleContactChange'));
    expect(handler).toContain('editEncryptionKey');
    expect(handler).toContain('showAlert');
  });

  it('offers Clear as the way out, so a slot can be retyped by deleting first', () => {
    expect(TAB).toContain('clearEncryptionKey()');
  });
});
