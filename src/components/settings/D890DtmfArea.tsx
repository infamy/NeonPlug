import React from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { D890_DTMF, type D890DtmfSettings } from '../../radios/d890uv/dtmf';
import { FIELD, FIELD_INLINE } from '../ui/controlStyles';

/**
 * DTMF signalling — the settings block and the 16 encode entries.
 *
 * ⚠️ MIND THE UNITS. Three of these timings are stored as milliseconds ÷ 10 and
 * two as RAW seconds, in adjacent bytes of the same record: +0x03, +0x04 and
 * +0x0a are ms; +0x05 and +0x0b are seconds. That was measured, not assumed —
 * one write of 420/310/530 ms landed as 0x2A/0x1F/0x35, and a second write of
 * 9 s and 7 s landed as 0x09/0x07. Running a seconds field through the ms path
 * divides it by ten and sets Auto Reset to 0.
 *
 * The encode list is indexed, and the INDEX is what a channel references. So an
 * empty entry is written as an all-0xFF record and keeps its position rather
 * than being compacted away — compacting would repoint every channel using a
 * later entry.
 *
 * Three bytes (+0x01 group code aside, +0x0c and +0x0d) still have no meaning
 * and are not shown: they are carried through from the read untouched, because
 * writing a byte whose meaning is unknown is the change that breaks a radio.
 */
const NUMBER_FIELDS: {
  key: keyof Pick<
    D890DtmfSettings,
    'firstDigitMs' | 'pretimeMs' | 'timeLapseAfterEncodeMs' | 'autoResetTimeS'
  >;
  label: string;
  unit: string;
  max: number;
  title: string;
}[] = [
  { key: 'firstDigitMs', label: 'First Digit', unit: 'ms', max: 2550,
    title: '+0x04, stored as milliseconds ÷ 10' },
  { key: 'pretimeMs', label: 'Pretime', unit: 'ms', max: 2550,
    title: '+0x03, stored as milliseconds ÷ 10' },
  { key: 'timeLapseAfterEncodeMs', label: 'Time-Lapse After Encode', unit: 'ms', max: 2550,
    title: '+0x0a, stored as milliseconds ÷ 10' },
  { key: 'autoResetTimeS', label: 'Auto Reset Time', unit: 's', max: 255,
    title: '+0x05, stored as RAW seconds — not tenths' },
];

const inputClass =
  `${FIELD} border rounded px-2 py-1 text-sm w-24 font-mono`;

export const D890DtmfArea: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  const dtmf = tables.dtmf;
  if (!dtmf) return null;

  const setSettings = (patch: Partial<D890DtmfSettings>) =>
    setTable('dtmf', { ...dtmf, settings: { ...dtmf.settings, ...patch } });

  const setEntry = (index: number, value: string) => {
    const list = Array.from({ length: D890_DTMF.ENCODE_SLOTS }, (_, i) =>
      i === index ? value : (dtmf.encodeList[i] ?? '')
    );
    setTable('dtmf', { ...dtmf, encodeList: list });
  };

  return (
    <div className="mb-8">
      <div className="mb-4">
        <SectionTitle as="h3" size="xl">DTMF</SectionTitle>
        <p className="text-cool-gray text-sm">
          Signalling timings and the {D890_DTMF.ENCODE_SLOTS} encode entries. Digits
          are 0-9, A-D, <span className="font-mono">*</span> and{' '}
          <span className="font-mono">#</span>.
        </p>
      </div>

      <Card className="mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {NUMBER_FIELDS.map((f) => (
            <label key={f.key} className="block" title={f.title}>
              <span className="block text-cool-gray text-xs mb-1">
                {f.label} <span className="text-muted">[{f.unit}]</span>
              </span>
              <input
                key={`${f.key}-${dtmf.settings[f.key]}`}
                defaultValue={String(dtmf.settings[f.key])}
                onBlur={(e) => {
                  const v = Number.parseInt(e.target.value.trim(), 10);
                  if (Number.isFinite(v) && v >= 0 && v <= f.max) setSettings({ [f.key]: v });
                  else e.target.value = String(dtmf.settings[f.key]);
                }}
                className={inputClass}
              />
            </label>
          ))}
          <label className="block" title="+0x0b, RAW seconds. 0x00 is Off.">
            <span className="block text-cool-gray text-xs mb-1">
              PTT ID Pause <span className="text-muted">[s]</span>
            </span>
            <input
              key={`ptt-${String(dtmf.settings.pttIdPauseS)}`}
              defaultValue={dtmf.settings.pttIdPauseS === null
                ? ''
                : String(dtmf.settings.pttIdPauseS)}
              placeholder="Off"
              onBlur={(e) => {
                const raw = e.target.value.trim();
                if (raw === '') return setSettings({ pttIdPauseS: null });
                const v = Number.parseInt(raw, 10);
                if (Number.isFinite(v) && v >= 0 && v <= 255) setSettings({ pttIdPauseS: v });
                else e.target.value = String(dtmf.settings.pttIdPauseS ?? '');
              }}
              className={inputClass}
            />
          </label>
          <label className="block" title="Three digit codes at +0x06.">
            <span className="block text-cool-gray text-xs mb-1">Self ID</span>
            <input
              key={`self-${dtmf.settings.selfId}`}
              defaultValue={dtmf.settings.selfId}
              maxLength={3}
              onBlur={(e) => setSettings({ selfId: e.target.value.toUpperCase() })}
              className={inputClass}
            />
          </label>
          <label className="block" title="+0x02 — None / Beep / Beep and respond.">
            <span className="block text-cool-gray text-xs mb-1">Decoding Response</span>
            <select
              value={dtmf.settings.decodingResponse}
              onChange={(e) => setSettings({ decodingResponse: Number(e.target.value) })}
              className={`${FIELD} border rounded px-2 py-1 text-sm w-full`}
            >
              <option value={0}>None</option>
              <option value={1}>Beep</option>
              <option value={2}>Beep and respond</option>
            </select>
          </label>
        </div>
      </Card>

      <Card padding="none">
        <div className="px-3 py-2 border-b border-neon-cyan border-opacity-20">
          <span className="text-neon-cyan font-bold text-sm">Encode List</span>
          <span className="text-muted text-xs ml-2">
            A channel selects an entry by INDEX, so an empty row keeps its position
            rather than being removed.
          </span>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-dark-charcoal border-b border-neon-cyan">
              <th className="px-3 py-2 text-left text-neon-cyan font-bold w-20">Index</th>
              <th className="px-3 py-2 text-left text-neon-cyan font-bold">Digits</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: D890_DTMF.ENCODE_SLOTS }, (_, i) => {
              const value = dtmf.encodeList[i] ?? '';
              return (
                <tr key={i} className="border-b border-neon-cyan border-opacity-20">
                  <td className="px-3 py-2 text-muted font-mono">{i}</td>
                  <td className="px-3 py-2 font-mono">
                    <input
                      key={`${i}-${value}`}
                      defaultValue={value}
                      maxLength={D890_DTMF.ENCODE_STRIDE}
                      placeholder="(empty)"
                      onBlur={(e) => {
                        // Reject anything the encoder would throw on, rather
                        // than letting a stray character take down the write.
                        const cleaned = Array.from(e.target.value.toUpperCase())
                          .filter((ch) => D890_DTMF.DIGITS.includes(ch))
                          .join('')
                          .slice(0, D890_DTMF.ENCODE_STRIDE);
                        e.target.value = cleaned;
                        setEntry(i, cleaned);
                      }}
                      className={`${FIELD_INLINE} rounded w-full`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
};
