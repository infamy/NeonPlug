import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { D890_ANALOG_ADDRESS_BOOK } from '../../radios/d890uv/analogAddressBook';
import { D890_MDC1200, MDC_CALL_TYPE } from '../../radios/d890uv/mdc1200';
import { formatPlural } from '../../utils/formatPlural';
import { BUTTON, FIELD, FIELD_INLINE } from '../ui/controlStyles';

/**
 * The two signalling address books — analog (DTMF) and MDC1200 (vendor: QDC).
 *
 * ⚠️ BOTH COMPACT. Deleting an entry renumbers the survivors, so a slot number
 * is NOT a stable identifier and nothing may remember "the contact in slot 3".
 * That is measured on the analog book (2026-09-08) and the same shape on MDC.
 *
 * The SMS store, which looks similar, does the OPPOSITE — a survivor keeps its
 * own slot and the deleted one is retired. Getting these backwards is the bug
 * the round-trip tests for these three regions exist to catch, which is why the
 * two behaviours are spelled out in the UI rather than only in the encoders.
 *
 * Because they compact, the slot column shows the position the entry WILL be
 * written to, recomputed on every render — not the slot it was read from.
 */
const inputClass =
  `${FIELD_INLINE} rounded`;
const selectClass =
  `${FIELD} border rounded px-2 py-1 text-sm w-full`;

export const D890AddressBooksArea: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  const analog = tables.analogAddressBook;
  const mdc = tables.mdc1200Contacts;
  if (!analog && !mdc) return null;

  return (
    <div className="mb-8">
      <div className="mb-4">
        <SectionTitle as="h3" size="xl">Signalling Address Books</SectionTitle>
        <p className="text-cool-gray text-sm">
          Analog (DTMF) and MDC1200 contacts. Deleting an entry from either book{' '}
          <span className="text-white">renumbers the ones below it</span> — unlike
          the SMS store, where a survivor keeps its own slot.
        </p>
      </div>

      {analog && <AnalogBook contacts={analog} setTable={setTable} />}
      {mdc && <MdcBook contacts={mdc} setTable={setTable} />}
    </div>
  );
};

type SetTable = ReturnType<typeof useRadioStore.getState>['setTable'];

const AnalogBook: React.FC<{
  contacts: NonNullable<ReturnType<typeof useRadioStore.getState>['tables']['analogAddressBook']>;
  setTable: SetTable;
}> = ({ contacts, setTable }) => {
  const set = (index: number, patch: Partial<(typeof contacts)[number]>) =>
    setTable('analogAddressBook', contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <Card padding="none" className="mb-4">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neon-cyan border-opacity-20">
        <span className="text-neon-cyan font-bold text-sm">
          Analog (DTMF) — {contacts.length} {formatPlural(contacts.length, 'entry', 'entries')}
        </span>
        <button
          onClick={() =>
            setTable('analogAddressBook', [
              ...contacts,
              { slot: contacts.length, digits: '', name: '' },
            ])
          }
          className={`${BUTTON.outline} px-3 py-1 rounded border text-sm`}
        >
          + Add
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-muted text-sm p-4">No analog contacts stored.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-dark-charcoal border-b border-neon-cyan">
              <th className="px-3 py-2 text-left text-neon-cyan font-bold w-16" title="Where this entry will be written. It moves when an earlier entry is deleted.">Slot</th>
              <th className="px-3 py-2 text-left text-neon-cyan font-bold w-40">
                Digits
              </th>
              <th className="px-3 py-2 text-left text-neon-cyan font-bold">Name</th>
              <th className="px-3 py-2 text-right text-neon-cyan font-bold w-20">Actions</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map((c, i) => (
              <tr key={`${c.slot}-${i}`} className="border-b border-neon-cyan border-opacity-20">
                <td className="px-3 py-2 text-muted font-mono">{i}</td>
                <td className="px-3 py-2 font-mono">
                  <input
                    key={`${i}-d-${c.digits}`}
                    defaultValue={c.digits}
                    maxLength={D890_ANALOG_ADDRESS_BOOK.MAX_DIGITS}
                    onBlur={(e) => {
                      // Digits only — the record packs them as BCD nibbles, so a
                      // letter has no representation at all.
                      const digits = e.target.value.replace(/\D/g, '')
                        .slice(0, D890_ANALOG_ADDRESS_BOOK.MAX_DIGITS);
                      e.target.value = digits;
                      set(i, { digits });
                    }}
                    className={`${inputClass} w-32`}
                  />
                </td>
                <td className="px-3 py-2">
                  <input
                    key={`${i}-n-${c.name}`}
                    defaultValue={c.name}
                    maxLength={D890_ANALOG_ADDRESS_BOOK.MAX_NAME_CHARS}
                    onBlur={(e) => set(i, { name: e.target.value })}
                    className={`${inputClass} w-full`}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={() =>
                      setTable('analogAddressBook', contacts.filter((_, j) => j !== i))
                    }
                    title="Deletes and renumbers — every entry below this one moves up a slot"
                    className={`${BUTTON.dangerQuiet} px-2`}
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
  );
};

const MdcBook: React.FC<{
  contacts: NonNullable<ReturnType<typeof useRadioStore.getState>['tables']['mdc1200Contacts']>;
  setTable: SetTable;
}> = ({ contacts, setTable }) => {
  const set = (index: number, patch: Partial<(typeof contacts)[number]>) =>
    setTable('mdc1200Contacts', contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  return (
    <Card padding="none">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neon-cyan border-opacity-20">
        <span className="text-neon-cyan font-bold text-sm">
          MDC1200 / QDC — {contacts.length} {formatPlural(contacts.length, 'entry', 'entries')}
        </span>
        <button
          onClick={() =>
            setTable('mdc1200Contacts', [
              ...contacts,
              {
                slot: contacts.length,
                callType: MDC_CALL_TYPE.PRIVATE,
                type: 0,
                ack: 0,
                id: 0,
                name: '',
              },
            ])
          }
          disabled={contacts.length >= D890_MDC1200.SLOTS}
          className={`${BUTTON.outline} px-3 py-1 rounded border text-sm`}
        >
          + Add
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-muted text-sm p-4">No MDC1200 contacts stored.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-dark-charcoal border-b border-neon-cyan">
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-16">Slot</th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-32">Call Type</th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-28">ID</th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold">Name</th>
                <th
                  className="px-3 py-2 text-left text-neon-cyan font-bold w-20"
                  title="+0x00. 5 is ALARM, the 6th entry of the vendor's Type list — the rest of the list has never been enumerated, so this is the raw byte."
                >
                  Type
                </th>
                <th className="px-3 py-2 text-left text-neon-cyan font-bold w-16">ACK</th>
                <th className="px-3 py-2 text-right text-neon-cyan font-bold w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c, i) => (
                <tr key={`${c.slot}-${i}`} className="border-b border-neon-cyan border-opacity-20">
                  <td className="px-3 py-2 text-muted font-mono">{i}</td>
                  <td className="px-3 py-2">
                    <select
                      value={c.callType}
                      onChange={(e) => set(i, { callType: Number(e.target.value) })}
                      className={selectClass}
                    >
                      <option value={MDC_CALL_TYPE.PRIVATE}>Private</option>
                      <option value={MDC_CALL_TYPE.GROUP}>Group</option>
                      {/* OBSERVED ON HARDWARE 2026-09-09: a radio held a slot
                          with callType 2 named "MDCALL", so this is no longer
                          just a column in the vendor CSV. */}
                      <option value={MDC_CALL_TYPE.ALL}>All Call</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 font-mono">
                    <input
                      key={`${i}-id-${c.id}`}
                      defaultValue={String(c.id)}
                      onBlur={(e) => {
                        // A u16, little-endian. Proven by writing 1234 and
                        // reading back d2 04 — an earlier byte-swapped-BCD
                        // reading survived only because 1111 is a palindrome.
                        const v = Number.parseInt(e.target.value.trim(), 10);
                        if (Number.isFinite(v) && v >= 0 && v <= 0xffff) set(i, { id: v });
                        else e.target.value = String(c.id);
                      }}
                      className={`${inputClass} w-24`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      key={`${i}-n-${c.name}`}
                      defaultValue={c.name}
                      maxLength={(D890_MDC1200.BODY - 0x08) / 2 - 1}
                      onBlur={(e) => set(i, { name: e.target.value })}
                      className={`${inputClass} w-full`}
                    />
                  </td>
                  <td className="px-3 py-2 text-muted font-mono">
                    <input
                      key={`${i}-t-${c.type}`}
                      defaultValue={String(c.type)}
                      onBlur={(e) => {
                        const v = Number.parseInt(e.target.value.trim(), 10);
                        if (Number.isFinite(v) && v >= 0 && v <= 255) set(i, { type: v });
                        else e.target.value = String(c.type);
                      }}
                      className={`${inputClass} w-12`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={c.ack === 1}
                      onChange={(e) => set(i, { ack: e.target.checked ? 1 : 0 })}
                      className="accent-neon-cyan"
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() =>
                        setTable('mdc1200Contacts', contacts.filter((_, j) => j !== i))
                      }
                      title="Deletes and renumbers — every entry below this one moves up a slot"
                      className={`${BUTTON.dangerQuiet} px-2`}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
