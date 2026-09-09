import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { D890_STATUS_MESSAGES } from '../../radios/d890uv/statusMessages';
import { formatPlural } from '../../utils/formatPlural';

/**
 * The canned texts a hot key can send.
 *
 * Presence is a BITMASK, not "does the slot have text" — that is the finding
 * the whole decode rests on. So deleting a message here clears its bit and
 * deliberately leaves the slot's bytes alone: the radio consults the mask, and
 * wiping the text as well would be a change to bytes the user never touched.
 *
 * The slot NUMBER is shown and never renumbered. Nothing has been found that
 * indexes a status message by slot, but the mask addresses slots directly, so
 * compaction would have to move bits as well as bytes — and there is no reason
 * to take that risk for cosmetics.
 */
export const D890StatusMessagesArea: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  const messages = tables.statusMessages;
  if (!messages) return null;

  const used = new Set(messages.map((m) => m.slot));
  const set = (slot: number, text: string) =>
    setTable('statusMessages', messages.map((m) => (m.slot === slot ? { ...m, text } : m)));

  const add = () => {
    let slot = 0;
    while (used.has(slot) && slot < D890_STATUS_MESSAGES.MAX_SLOTS) slot += 1;
    if (slot >= D890_STATUS_MESSAGES.MAX_SLOTS) return;
    setTable('statusMessages', [...messages, { slot, text: `Status ${slot + 1}` }]
      .sort((a, b) => a.slot - b.slot));
  };

  const remove = (slot: number) =>
    setTable('statusMessages', messages.filter((m) => m.slot !== slot));

  return (
    <div className="mb-8">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <SectionTitle as="h3" size="xl">Status Messages</SectionTitle>
          <p className="text-cool-gray text-sm">
            Canned texts a hot key can send. {messages.length} of{' '}
            {D890_STATUS_MESSAGES.MAX_SLOTS} {formatPlural(messages.length, 'slot')} in use,{' '}
            up to {D890_STATUS_MESSAGES.MAX_CHARS} characters each.
          </p>
        </div>
        <button
          onClick={add}
          disabled={messages.length >= D890_STATUS_MESSAGES.MAX_SLOTS}
          className="px-3 py-1.5 rounded border border-neon-cyan text-neon-cyan
                     hover:bg-neon-cyan hover:bg-opacity-10 disabled:opacity-40 text-sm"
        >
          + Add message
        </button>
      </div>

      <Card padding={messages.length === 0 ? undefined : 'none'}>
        {messages.length === 0 ? (
          <p className="text-muted text-sm">
            No status messages stored. The radio&apos;s presence mask is empty.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th
                  className="px-3 py-2 text-left text-neon-cyan font-bold w-20"
                  title="The slot the presence mask addresses. It never changes."
                >
                  Slot
                </th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold">Message</th>
                <th className="px-3 py-2 text-right text-neon-cyan font-bold w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {messages.map(({ slot, text }) => (
                <tr key={slot} className="border-b border-panel">
                  <td className="px-3 py-2 text-muted font-mono">{slot}</td>
                  <td className="px-3 py-2">
                    <input
                      key={`${slot}-${text}`}
                      defaultValue={text}
                      maxLength={D890_STATUS_MESSAGES.MAX_CHARS}
                      onBlur={(e) => set(slot, e.target.value)}
                      className="bg-transparent text-white border-none outline-none
                                 focus:bg-panel focus:px-1 rounded w-full"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => remove(slot)}
                      title="Clears this slot's presence bit. The text stays in flash — the mask is what the radio reads."
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
