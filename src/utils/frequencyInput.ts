/**
 * Reading a frequency someone typed.
 *
 * The channel editors used `parseFloat`, so "145,500" saved as 145.0000 MHz,
 * "146520" as 146520 MHz, and text that did not parse quietly went back to the
 * old value. This takes a decimal comma, reads a number too big to be MHz as kHz
 * or Hz, and says what is wrong instead of reverting.
 */

export type FrequencyParse = { ok: true; mhz: number } | { ok: false; error: string };

const UNIT_SCALE: Record<string, number> = { mhz: 1, khz: 1e-3, hz: 1e-6 };

export function parseFrequencyInput(text: string): FrequencyParse {
  const typed = text.trim();
  let s = typed.replace(/\s+/g, '');
  if (s === '') return { ok: false, error: 'Enter a frequency in MHz.' };

  let scale: number | null = null;
  const unit = s.match(/(mhz|khz|hz)$/i);
  if (unit) {
    scale = UNIT_SCALE[unit[1].toLowerCase()];
    s = s.slice(0, -unit[1].length);
  }

  // One comma and no point is a decimal comma ("145,500"). Otherwise commas
  // group thousands ("146,520,000", "1,296.5").
  const commas = s.split(',').length - 1;
  s = commas === 1 && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '');

  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: `"${typed}" is not a frequency.` };
  const value = Number(s);
  // No unit: MHz as typed, or kHz or Hz when the number is too big to be MHz.
  scale ??= value < 1_000 ? 1 : value < 1_000_000 ? 1e-3 : 1e-6;

  const mhz = Math.round(value * scale * 1e6) / 1e6;
  if (!(mhz > 0)) return { ok: false, error: 'A frequency must be above 0.' };
  if (mhz >= 1_000) return { ok: false, error: `${typed} is 1000 MHz or more, which no radio here stores.` };
  return { ok: true, mhz };
}
