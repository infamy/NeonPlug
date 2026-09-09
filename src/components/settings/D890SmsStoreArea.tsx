import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { D890_SMS_STORE } from '../../radios/d890uv/smsStore';
import { formatPlural } from '../../utils/formatPlural';

/**
 * The SMS message store — a LINKED LIST, not an array.
 *
 * ⚠️ This does NOT compact. Deleting a message retires its own slot to 0xFF and
 * repoints the previous envelope's `next` past the hole; every survivor stays
 * exactly where it was. The two address books do the opposite, and having the
 * pair backwards is the bug the round-trip tests exist to catch.
 *
 * Only deletion is offered. Composing a message means allocating a slot AND a
 * predefined-SMS text slot and splicing the chain, and nothing has confirmed
 * what the radio does with an envelope whose `attr` is not 0 — every capture so
 * far shows 0, which is one value, not a vocabulary.
 *
 * The TEXT is not in the envelope: `textSlot` is an index into the predefined
 * SMS table, and the reader must follow it rather than assume it equals the
 * record's own slot. They have agreed in every capture, but the CPS
 * dereferences the byte, so they are free to differ.
 */
export const D890SmsStoreArea: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  // By SLOT — `textSlot` dereferences the predefined table, and the store's
  // position-renumbered copy cannot answer that. See `tables.predefinedSms`.
  const predefinedSms = tables.predefinedSms ?? [];
  const store = tables.smsStore;
  if (!store) return null;

  const textFor = (textSlot: number) =>
    predefinedSms.find((m) => m.slot === textSlot)?.text ?? '(no message in this slot)';

  const remove = (slot: number) =>
    setTable('smsStore', store.filter((e) => e.slot !== slot));

  return (
    <div className="mb-8">
      <div className="mb-4">
        <SectionTitle as="h3" size="xl">SMS Store</SectionTitle>
        <p className="text-cool-gray text-sm">
          {store.length} of {D890_SMS_STORE.SLOTS} {formatPlural(store.length, 'slot')} in use,
          shown in the radio&apos;s own chain order. Deleting one{' '}
          <span className="text-white">leaves the others where they are</span> — this
          is a linked list, not a list that renumbers.
        </p>
      </div>

      <Card padding={store.length === 0 ? undefined : 'none'}>
        {store.length === 0 ? (
          <p className="text-muted text-sm">
            The store is empty — the head byte reads 0x{D890_SMS_STORE.END.toString(16)}.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-16" title="This slot keeps its number when an earlier message is deleted">Slot</th>
                <th
                  className="px-3 py-2 text-left text-neon-cyan font-bold w-20"
                  title="The next slot in the chain — this is what makes the store a linked list"
                >
                  Next
                </th>
                <th
                  className="px-3 py-2 text-left text-neon-cyan font-bold w-20"
                  title="Index into the predefined SMS table. Not necessarily the same as Slot."
                >
                  Text
                </th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold">Message</th>
                <th className="px-3 py-2 text-right text-neon-cyan font-bold w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {store.map((e) => (
                <tr key={e.slot} className="border-b border-panel">
                  <td className="px-3 py-2 text-muted font-mono">{e.slot}</td>
                  <td className="px-3 py-2 text-muted font-mono">
                    {e.next === null ? '—' : e.next}
                  </td>
                  <td className="px-3 py-2 text-muted font-mono">{e.textSlot}</td>
                  <td className="px-3 py-2 text-white truncate max-w-md">
                    {textFor(e.textSlot)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(e.slot)}
                      title="Retires this slot and repoints the chain past it. Every other message keeps its slot."
                      className="text-muted hover:text-red-400 px-2"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
};
