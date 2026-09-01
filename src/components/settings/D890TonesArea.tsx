import React from 'react';
import { useRadioStore } from '../../store/radioStore';
import { SectionTitle } from '../ui/SectionTitle';
import { D890_TONES } from '../../radios/d890uv/tones';

/**
 * 5-Tone and 2-Tone signalling code lists, in that order — the heading follows
 * the order the tables are shown in, not the numeric one.
 *
 * Read-only. Both layouts were recovered by adding one entry in the vendor CPS,
 * writing it, and diffing the same 16 KB span — so the fields shown are the
 * bytes that changed, not a reading of the vendor schema.
 *
 * The 2-Tone frequencies carry a caveat and it is shown: the name is directly
 * observed, but the tenths-of-a-hertz scaling is inferred from two samples
 * landing on plausible values. A different divisor would decode just as
 * cleanly, so the numbers are labelled unconfirmed rather than presented as
 * settled.
 */
export const D890TonesArea: React.FC = () => {
  const { d890Tones } = useRadioStore();

  if (!d890Tones) {
    return (
      <div>
        <SectionTitle size="lg" underline>5-Tone &amp; 2-Tone</SectionTitle>
        <p className="text-sm text-muted">Read the radio to see its tone lists.</p>
      </div>
    );
  }

  const { fiveTone, twoTone } = d890Tones;

  return (
    <div>
      <SectionTitle size="lg" underline>5-Tone &amp; 2-Tone</SectionTitle>
      <p className="text-cool-gray text-sm mb-6">
        Analog selective-calling codes. Read-only.
      </p>

      <div className="flex flex-col gap-6">
        <div>
          <h4 className="text-sm font-semibold text-neon-cyan mb-2">
            5-Tone ({fiveTone.length} of {D890_TONES.fiveTone.slots})
          </h4>
          {fiveTone.length === 0 ? (
            <p className="text-xs text-muted">No 5-Tone codes stored.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-dark-charcoal border-b border-neon-cyan">
                    <th className="px-2 py-2 text-left text-neon-cyan font-bold w-12">#</th>
                    <th className="px-2 py-2 text-left text-neon-cyan font-bold w-16">Digits</th>
                    <th className="px-2 py-2 text-left text-neon-cyan font-bold">Code</th>
                  </tr>
                </thead>
                <tbody>
                  {fiveTone.map((t) => (
                    <tr key={t.index} className="border-b border-panel">
                      <td className="px-2 py-1 text-muted">{t.index + 1}</td>
                      <td className="px-2 py-1 text-muted">{t.digits.length}</td>
                      <td className="px-2 py-1 text-white font-mono">{t.digits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div>
          <h4 className="text-sm font-semibold text-neon-cyan mb-1">
            2-Tone ({twoTone.length} of {D890_TONES.twoTone.slots})
          </h4>
          <p className="text-xs text-amber-400 mb-2">
            Frequency scaling is inferred, not confirmed on hardware — treat the values as
            approximate until one is set to a known pair.
          </p>
          {twoTone.length === 0 ? (
            <p className="text-xs text-muted">No 2-Tone codes stored.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-dark-charcoal border-b border-neon-cyan">
                    <th className="px-2 py-2 text-left text-neon-cyan font-bold w-12">#</th>
                    <th className="px-2 py-2 text-left text-neon-cyan font-bold">Name</th>
                    <th className="px-2 py-2 text-left text-neon-cyan font-bold">Tone 1</th>
                    <th className="px-2 py-2 text-left text-neon-cyan font-bold">Tone 2</th>
                  </tr>
                </thead>
                <tbody>
                  {twoTone.map((t) => (
                    <tr key={t.index} className="border-b border-panel">
                      <td className="px-2 py-1 text-muted">{t.index + 1}</td>
                      <td className="px-2 py-1 text-white">
                        {t.name || <span className="text-muted">—</span>}
                      </td>
                      <td className="px-2 py-1 text-white font-mono">
                        {t.firstTone.toFixed(1)} Hz
                      </td>
                      <td className="px-2 py-1 text-white font-mono">
                        {t.secondTone.toFixed(1)} Hz
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
