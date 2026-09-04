import type { EncryptionKey } from '../models/EncryptionKey';

/**
 * Encryption-key editing rules.
 *
 * ONE INVARIANT: a key's type is chosen when the key is created and never
 * changes. Create with a type, delete, create again — but never retype in place.
 *
 * The reason is storage, and it differs by radio in a way the UI must not paper
 * over. On the DM-32 the type is a field inside the key's own record, so
 * changing it rewrites one byte and every channel pointing at that key still
 * points at it. On the DA-7X2 the type IS the table the key lives in — there are
 * four (`EncryptionCode`, `AESEncryptionCode`, `ARC4EncryptionCode`,
 * `NXEncryptionCode`) with different columns each — so the same edit is a MOVE:
 * the key leaves one table's slot 3 and becomes another table's slot N, and
 * every channel referencing slot 3 now points at whatever else is there.
 *
 * A writer cannot fix that up silently, so the edit is refused at the model
 * layer rather than merely disabled in the UI. Disabling a control is a
 * suggestion; this is the rule.
 *
 * Applied uniformly rather than per-radio on purpose. A rule that holds
 * everywhere is one users can learn, and one code path is one thing to get
 * right — the DM-32 loses nothing but a convenience it never advertised.
 */

/** Type index → label. Index 0 means the slot holds no key. */
export const ENCRYPTION_TYPES = ['None', 'Custom', 'ARC4', 'AES128', 'AES256'] as const;

export const ENCRYPTION_TYPE_NONE = 0;

export function encryptionTypeLabel(type: number | undefined): string {
  return ENCRYPTION_TYPES[type ?? ENCRYPTION_TYPE_NONE] ?? `Unknown (${type})`;
}

/**
 * True once a slot holds a key, i.e. its type is fixed for the key's lifetime.
 *
 * An empty slot is not a key yet, so picking a type there is creation, not a
 * change — which is why this is the one moment the type is settable.
 */
export function isEncryptionTypeLocked(key: Pick<EncryptionKey, 'encryptionType'>): boolean {
  return (key.encryptionType ?? ENCRYPTION_TYPE_NONE) !== ENCRYPTION_TYPE_NONE;
}

export interface KeyEditRejected {
  ok: false;
  reason: string;
}
export interface KeyEditAccepted {
  ok: true;
  updates: Partial<EncryptionKey>;
}
export type KeyEditResult = KeyEditAccepted | KeyEditRejected;

/**
 * Validate one field edit against the invariant.
 *
 * Returns a result rather than throwing: the caller is a UI that should explain
 * the refusal, and rejecting an edit is an ordinary outcome here, not an error.
 */
export function editEncryptionKey(
  key: EncryptionKey,
  field: keyof EncryptionKey,
  value: EncryptionKey[keyof EncryptionKey]
): KeyEditResult {
  if (field !== 'encryptionType') return { ok: true, updates: { [field]: value } };

  const next = typeof value === 'number' ? value : ENCRYPTION_TYPE_NONE;
  if (!isEncryptionTypeLocked(key)) return { ok: true, updates: { encryptionType: next } };
  if (next === (key.encryptionType ?? ENCRYPTION_TYPE_NONE)) return { ok: true, updates: {} };

  return {
    ok: false,
    reason:
      `A key's type cannot be changed once it is set. On radios that store keys in a ` +
      `separate table per type, retyping moves the key to a different slot and silently ` +
      `redirects every channel that referenced the old one. Clear the slot and create a ` +
      `new key instead.`,
  };
}

/**
 * Empty a slot: the "delete" half of create-and-delete.
 *
 * Clears the payload as well as the type, because leaving a key's material in a
 * slot marked None is how a "deleted" key gets written back to a radio.
 */
export function clearEncryptionKey(): Partial<EncryptionKey> {
  return { encryptionType: ENCRYPTION_TYPE_NONE, name: '', key: '' };
}
