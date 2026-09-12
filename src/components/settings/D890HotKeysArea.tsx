import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { useQuickMessagesStore } from '../../store/quickMessagesStore';
import {
  D890_HOT_KEYS,
  HOT_KEY_CALL_TYPE,
  HOT_KEY_DIGI_CALL,
  HOT_KEY_MODE,
  hotKeyLabel,
  type D890HotKey,
} from '../../radios/d890uv/hotKeys';
import { FIELD, FIELD_INLINE } from '../ui/controlStyles';

/**
 * The 18 programmable key actions — 6 Hot Key rows and 12 Fun rows, exactly the
 * vendor CPS grid.
 *
 * ⚠️ Every entry is live. The mask at 0x3701510 marks which rows differ from the
 * CPS default, NOT which exist, so there is no "add" or "delete" here — only
 * editing what is already there.
 *
 * Two fields are deliberately shown as raw numbers rather than dropdowns:
 *
 *   - **Menu** (+0x01) reads 1 in every capture anyone has taken, so its
 *     vocabulary is unknown. A dropdown would be inventing one.
 *   - **Digi Call Type** offers only the two values that have been OBSERVED.
 *     0 is DMR Group and 3 is DMR Hot; 1 and 2 exist in the byte but nobody has
 *     enumerated the CPS dropdown, so they are not offered as if they were
 *     known. Do not assume they follow grid order.
 *
 * Content is a SLOT in the predefined SMS table, and that is confirmed rather
 * than assumed — the one row the vendor capture edited holds 0x03, and the
 * message in SLOT 3 is the exact string the CPS grid showed in that row.
 *
 * ⚠️ SLOT, not list position. `quickMessagesStore` renumbers `.index` to array
 * position, so it cannot resolve this byte: the first radio checked had slot 0
 * erased and its four messages in slots 1-4, which made every position sit one
 * below its slot. Resolving against the store displayed the wrong message and
 * would have WRITTEN the wrong one. `tables.predefinedSms` keeps the slots.
 */
const ROW_LABEL = hotKeyLabel;

export const D890HotKeysArea: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  const { messages, messagesLoaded } = useQuickMessagesStore();
  // By SLOT — Content is a text slot, and the store's `index` is a list
  // position. The CURRENT messages when they carry their slots, so an edited or
  // newly added message can be picked here; the read-time table only when they
  // do not (a list that came from somewhere other than this radio's read).
  const predefinedSms =
    messagesLoaded && messages.every((m) => m.slot !== undefined)
      ? messages.map((m) => ({ slot: m.slot!, text: m.text }))
      : tables.predefinedSms ?? [];
  const keys = tables.hotKeys;
  if (!keys) return null;

  const set = (slot: number, patch: Partial<D890HotKey>) =>
    setTable('hotKeys', keys.map((k) => (k.slot === slot ? { ...k, ...patch } : k)));

  const selectClass =
    `${FIELD} border rounded px-2 py-1 text-sm w-full`;

  return (
    <div className="mb-8">
      <div className="mb-4">
        <SectionTitle as="h3" size="xl">Hot Keys</SectionTitle>
        <p className="text-cool-gray text-sm">
          All {D890_HOT_KEYS.SLOTS} entries are live — the radio acts on every row,
          so there is nothing to add or remove. Content selects a pre-defined SMS
          by index.
        </p>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-28">Key</th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-28">Mode</th>
                <th
                  className="px-3 py-2 text-left text-neon-cyan font-bold w-20"
                  title="+0x01. Reads 1 in every capture, so its vocabulary is unknown — shown as the raw byte rather than an invented dropdown."
                >
                  Menu
                </th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-28">Call Type</th>
                <th
                  className="px-3 py-2 text-left text-neon-cyan font-bold w-32"
                  title="Only 0 (DMR Group) and 3 (DMR Hot) have been observed. 1 and 2 are legal bytes with unknown meanings."
                >
                  Digi Call Type
                </th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-32">Call Object</th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold">Content</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.slot} className="border-b border-neon-cyan border-opacity-20">
                  <td className="px-3 py-2 text-muted">{ROW_LABEL(k.slot)}</td>
                  <td className="px-3 py-2">
                    <select
                      value={k.mode}
                      onChange={(e) => set(k.slot, { mode: Number(e.target.value) })}
                      className={selectClass}
                    >
                      <option value={HOT_KEY_MODE.CALL}>Call</option>
                      <option value={HOT_KEY_MODE.MENU}>Menu</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 text-muted font-mono">{k.menu}</td>
                  <td className="px-3 py-2">
                    <select
                      value={k.callType}
                      onChange={(e) => set(k.slot, { callType: Number(e.target.value) })}
                      className={selectClass}
                    >
                      <option value={HOT_KEY_CALL_TYPE.ANALOG}>Analog</option>
                      <option value={HOT_KEY_CALL_TYPE.DIGITAL}>Digital</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={k.digiCallType}
                      onChange={(e) => set(k.slot, { digiCallType: Number(e.target.value) })}
                      className={selectClass}
                    >
                      <option value={HOT_KEY_DIGI_CALL.DMR_GROUP}>DMR Group</option>
                      <option value={HOT_KEY_DIGI_CALL.DMR_HOT}>DMR Hot</option>
                      {/* Shown only when the radio already holds it, so an
                          unknown value is never silently rewritten to a known
                          one just by rendering the row. */}
                      {k.digiCallType !== HOT_KEY_DIGI_CALL.DMR_GROUP &&
                        k.digiCallType !== HOT_KEY_DIGI_CALL.DMR_HOT && (
                          <option value={k.digiCallType}>
                            {k.digiCallType} (unknown)
                          </option>
                        )}
                    </select>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <input
                      key={`${k.slot}-obj-${String(k.callObject)}`}
                      defaultValue={k.callObject === null ? '' : String(k.callObject)}
                      placeholder="Off"
                      onBlur={(e) => {
                        const raw = e.target.value.trim();
                        if (raw === '') return set(k.slot, { callObject: null });
                        const v = Number.parseInt(raw, 10);
                        if (Number.isFinite(v) && v >= 0) set(k.slot, { callObject: v });
                        else e.target.value = k.callObject === null ? '' : String(k.callObject);
                      }}
                      className={`${FIELD_INLINE} rounded w-28`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={k.contentSmsIndex === null ? '' : k.contentSmsIndex}
                      onChange={(e) =>
                        set(k.slot, {
                          contentSmsIndex: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className={selectClass}
                    >
                      <option value="">Off</option>
                      {predefinedSms.map((m) => (
                        <option key={m.slot} value={m.slot}>
                          {m.slot}. {m.text.slice(0, 24) || '(empty)'}
                        </option>
                      ))}
                      {/* The radio can point at an index the message list does
                          not currently hold — keep it selectable rather than
                          silently resetting the row to Off on render. */}
                      {k.contentSmsIndex !== null &&
                        !predefinedSms.some((m) => m.slot === k.contentSmsIndex) && (
                          <option value={k.contentSmsIndex}>
                            {k.contentSmsIndex}. (no message in this slot)
                          </option>
                        )}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};
