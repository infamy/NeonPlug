import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';

/**
 * The radio's own DMR ID — the vendor CPS calls it "MastID".
 *
 * Sits beside the Radio ID list because it is the same kind of thing, but it is
 * NOT one of them: it lives in its own record at `MASTER_ID_DATA` and carries a
 * field the Radio IDs do not.
 *
 * That field is the point of this card. The CPS labels its checkbox "Used",
 * which says nothing about what it does — with it on, this ID replaces the TX
 * ID of EVERY channel rather than each channel using its own. Labelled here for
 * the behaviour, with the vendor's word kept in the hint so the two can be
 * matched up.
 */
export const MasterRadioIdCard: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  const master = tables.masterRadioId;

  // Absent means the record was never read, or read as all zeros — which is how
  // the radio stores "no master ID at all". Nothing to show and nothing to edit.
  if (master === undefined) return null;

  const set = (patch: Partial<NonNullable<typeof master>>) => {
    if (!master) return;
    setTable('masterRadioId', { ...master, ...patch });
  };

  return (
    <div className="mb-8">
      <div className="mb-4">
        <SectionTitle as="h3" size="xl">Master Radio ID</SectionTitle>
        <p className="text-cool-gray text-sm">
          The radio&apos;s own ID. Shown as <span className="text-muted">MastID</span> in the
          vendor CPS.
        </p>
      </div>

      {master === null ? (
        <Card variant="subdued">
          <p className="text-muted text-sm">
            No master radio ID stored on this radio.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="flex flex-wrap items-end gap-6">
            <label className="flex flex-col gap-1">
              <span className="text-cool-gray text-xs">Name</span>
              <input
                value={master.id.name ?? ''}
                onChange={(e) => set({ id: { ...master.id, name: e.target.value } })}
                maxLength={16}
                className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-sm w-48 focus:outline-none focus:border-neon-cyan"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-cool-gray text-xs">DMR ID</span>
              <input
                value={master.id.dmrId ?? ''}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '');
                  set({
                    id: { ...master.id, dmrId: digits, dmrIdValue: Number(digits) || 0 },
                  });
                }}
                inputMode="numeric"
                className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white text-sm w-40 font-mono focus:outline-none focus:border-neon-cyan"
              />
            </label>

            <label className="flex items-center gap-2 pb-1">
              <input
                type="checkbox"
                checked={master.overrideAllTxIds}
                onChange={(e) => set({ overrideAllTxIds: e.target.checked })}
              />
              <span className="text-white text-sm">Override All TX IDs</span>
            </label>
          </div>

          <p className="text-muted text-xs mt-3">
            With <span className="text-white">Override All TX IDs</span> on, this ID is used to
            transmit on every channel, instead of each channel using the Radio ID assigned to
            it. The vendor CPS calls this checkbox <span className="text-white">Used</span>.
          </p>
        </Card>
      )}
    </div>
  );
};
