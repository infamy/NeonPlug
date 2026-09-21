/**
 * How many CSV contacts the radio holds — decided here, and only here.
 *
 * Settings and the Contacts tab each worked this out for themselves, and
 * disagreed. Settings tested `caps.supportsContacts` for truthiness; the DA-7X2
 * never sets it (absent means supported, everywhere else in the app), so
 * Settings reported "CSV Contacts 7183 / 0 (0%)". The Contacts tab used the
 * capacity from the last read, or 50,000 without one — so a DA-7X2 picked at
 * startup, with nothing read or opened, had a RadioID.net download cut to
 * 50,000 of its 500,000.
 *
 * The number lives in the per-radio limits table now, `caps.maxContacts`,
 * beside the channel, zone and talk group maxima. A read that reports its own
 * capacity wins, because some radios vary by firmware: a DM-32 holds 50,000, or
 * 150,000 on L01 firmware, and only the read can tell which.
 */

import type { RadioCapabilities } from '../types/radioCapabilities';
import type { RadioInfo } from '../types/radio';

/** Only for a radio NeonPlug doesn't know; every registered radio with contacts declares its own. */
const UNKNOWN_RADIO_CONTACTS = 50000;

export function resolveContactCapacity(
  caps: Pick<RadioCapabilities, 'supportsContacts' | 'maxContacts'> | null | undefined,
  radioInfo?: Pick<RadioInfo, 'maxContacts'> | null
): number {
  if (caps?.supportsContacts === false) return 0;
  return radioInfo?.maxContacts ?? caps?.maxContacts ?? UNKNOWN_RADIO_CONTACTS;
}
