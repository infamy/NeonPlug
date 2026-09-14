import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import { D890_SMS_STORE } from '../../radios/d890uv/smsStore';
import { formatPlural } from '../../utils/formatPlural';

/**
 * The SMS message store — a LINKED LIST, not an array — shown as it was READ.
 *
 * READ-ONLY since quick messages were wired (2026-09-11). This chain IS the
 * radio's list of pre-defined messages, and a write now builds it from Digital
 * → Quick Text Messages together with the texts it points at: editing either
 * alone leaves a message the radio cannot list, or a deleted one still listed.
 * The delete this area used to offer retired an envelope and left its text
 * behind; deleting the message under Quick Text Messages does both.
 *
 * It does NOT compact. A deleted message retires its own slot and every
 * survivor stays where it was — the radio's own delete, measured 2026-09-08.
 * The two address books do the opposite.
 *
 * The TEXT is not in the envelope: `textSlot` is an index into the predefined
 * SMS table, and the reader must follow it rather than assume it equals the
 * record's own slot. They have agreed in every capture, but the CPS
 * dereferences the byte, so they are free to differ.
 */
export const D890SmsStoreArea: React.FC = () => {
  const { tables } = useRadioStore();
  const { messages, messagesLoaded } = useQuickMessagesStore();
  // By SLOT — `textSlot` names a text slot, and the store's `index` is a list
  // position. The current texts when the list carries its slots; the read-time
  // table when it does not.
  const bySlot =
    messagesLoaded && messages.every((m) => m.slot !== undefined)
      ? messages.map((m) => ({ slot: m.slot!, text: m.text }))
      : tables.predefinedSms ?? [];
  const store = tables.smsStore;
  if (!store) return null;

  const textFor = (textSlot: number) =>
    bySlot.find((m) => m.slot === textSlot)?.text ?? '(no message in this slot)';

  return (
    <div className="mb-8">
      <div className="mb-4">
        <SectionTitle as="h3" size="xl">SMS Store</SectionTitle>
        <p className="text-cool-gray text-sm">
          {store.length} of {D890_SMS_STORE.SLOTS} {formatPlural(store.length, 'slot')} in use
          when the radio was read, in the radio&apos;s own chain order. This is the list the
          radio shows. Edit the messages under{' '}
          <span className="text-white">Digital → Quick Text Messages</span> and a write
          rebuilds this chain from them, keeping every survivor on its own slot.
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
              </tr>
            </thead>
            <tbody>
              {store.map((e) => (
                <tr key={e.slot} className="border-b border-neon-cyan border-opacity-20">
                  <td className="px-3 py-2 text-muted font-mono">{e.slot}</td>
                  <td className="px-3 py-2 text-muted font-mono">
                    {e.next === null ? '—' : e.next}
                  </td>
                  <td className="px-3 py-2 text-muted font-mono">{e.textSlot}</td>
                  <td className="px-3 py-2 text-white truncate max-w-md">
                    {textFor(e.textSlot)}
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
