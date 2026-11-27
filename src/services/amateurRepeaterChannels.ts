/**
 * Analog FM amateur repeaters near a place, from data.ferritefw.dev (HearHam's
 * listings, rebuilt daily), and the channels they make: each repeater's output
 * to listen on, its input to transmit on, and the tones to open it.
 */
import type { Channel, CTCSSDCS, Zone } from '../models';
import { createDefaultChannel } from '../utils/channelHelpers';
import { generateZoneId } from '../utils/zoneHelpers';
import { findFerriteRowsNear, type FerriteRowNear } from './ferrite/client';
import type { FerriteTone } from './ferrite/tile';
import type { ProgressCallback } from './jsonLoader';

export type AmateurRepeater = FerriteRowNear;

/** Repeaters within `radius` miles of a point, nearest first. */
export function findNearbyAmateurRepeaters(
  latitude: number,
  longitude: number,
  radius: number,
  onProgress?: ProgressCallback
): Promise<AmateurRepeater[]> {
  return findFerriteRowsNear('repeaters', latitude, longitude, radius, onProgress);
}

const NO_TONE: CTCSSDCS = { type: 'None' };

function toChannelTone(tone: FerriteTone | undefined): CTCSSDCS {
  if (!tone) return NO_TONE;
  if (tone.type === 'CTCSS') return { type: 'CTCSS', value: tone.hz };
  return { type: 'DCS', value: tone.code, polarity: tone.inverted ? 'P' : 'N' };
}

/** "147.090+ 131.8" style text for the list. */
export function describeRepeater(r: AmateurRepeater): string {
  const offset = r.offsetMhz ?? 0;
  const shift = offset === 0 ? ' simplex' : `${offset > 0 ? '+' : '-'}${Math.abs(offset).toFixed(3)}`;
  const tone = r.encodeTone
    ? r.encodeTone.type === 'CTCSS'
      ? ` · ${r.encodeTone.hz.toFixed(1)}`
      : ` · D${String(r.encodeTone.code).padStart(3, '0')}${r.encodeTone.inverted ? 'I' : 'N'}`
    : '';
  return `${r.mhz.toFixed(4)} MHz${shift}${tone}`;
}

/**
 * One channel per repeater, in one zone. The repeater's tone to open it goes
 * out on transmit; the tone it sends, where HearHam lists one, is the receive
 * tone. Width is narrow where HearHam says NFM, wide otherwise: its FM does not
 * say how wide.
 */
export function generateAmateurRepeaterChannels(
  startChannelNumber: number,
  repeaters: AmateurRepeater[],
  zoneName = 'Repeaters'
): { channels: Channel[]; zones: Zone[] } {
  const channels = repeaters.map((r, i) =>
    createDefaultChannel({
      number: startChannelNumber + i,
      name: r.name.slice(0, 16),
      rxFrequency: r.mhz,
      txFrequency: Math.round((r.mhz + (r.offsetMhz ?? 0)) * 100000) / 100000,
      mode: 'Analog',
      bandwidth: r.bandwidth ?? '25kHz',
      power: 'High',
      scanAdd: true,
      txCtcssDcs: toChannelTone(r.encodeTone),
      rxCtcssDcs: toChannelTone(r.decodeTone),
    })
  );
  const zones: Zone[] =
    channels.length > 0 ? [{ id: generateZoneId(), name: zoneName, channels: channels.map((c) => c.number) }] : [];
  return { channels, zones };
}
