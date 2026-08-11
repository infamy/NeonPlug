/**
 * BrandMeister "Halligan" API client — read-only, unauthenticated endpoints only.
 * Spec: https://api.brandmeister.network/api-docs (OpenAPI 3.0, "Halligan API").
 *
 * Only covers static talk groups for a repeater and talk group name lookup — the pieces
 * needed to import a repeater's static talk group list into the MMDVM/repeater channel
 * builder. Both endpoints used here are public GETs with no security requirement in the
 * spec (only write operations like POST /device/{id}/talkgroup require an API key).
 */

const BASE_URL = 'https://api.brandmeister.network/v2';

export interface BrandmeisterStaticTalkgroup {
  talkgroup: number;
  slot: 1 | 2;
}

/**
 * Fetch a repeater's static talk groups by its BrandMeister repeater/device ID (the same
 * 6-digit ID used throughout the DMR ecosystem, e.g. RptrData.id).
 * Returns an empty array if the repeater has none configured — that's a valid, common result.
 */
export async function fetchBrandmeisterStaticTalkgroups(repeaterId: number): Promise<BrandmeisterStaticTalkgroup[]> {
  const response = await fetch(`${BASE_URL}/device/${repeaterId}/talkgroup`);
  if (!response.ok) {
    throw new Error(`BrandMeister API returned ${response.status} for repeater ${repeaterId}`);
  }
  const data: Array<{ talkgroup: string | number; slot: string | number }> = await response.json();
  return data
    .map(entry => ({
      talkgroup: typeof entry.talkgroup === 'string' ? parseInt(entry.talkgroup, 10) : entry.talkgroup,
      slot: (typeof entry.slot === 'string' ? parseInt(entry.slot, 10) : entry.slot) as 1 | 2,
    }))
    .filter(entry => !isNaN(entry.talkgroup) && (entry.slot === 1 || entry.slot === 2));
}

/** In-memory cache — the same talk group (e.g. 3100 "USA Bridge") comes up across many repeaters. */
const talkgroupNameCache = new Map<number, string | null>();

/**
 * Look up a talk group's display name (e.g. 3100 -> "USA Bridge"). Returns null if the
 * lookup fails or the talk group isn't in BrandMeister's directory — callers should fall
 * back to a generic "TG <id>" label rather than surfacing an error for this.
 */
export async function fetchBrandmeisterTalkgroupName(talkgroupId: number): Promise<string | null> {
  if (talkgroupNameCache.has(talkgroupId)) {
    return talkgroupNameCache.get(talkgroupId)!;
  }
  try {
    const response = await fetch(`${BASE_URL}/talkgroup/${talkgroupId}`);
    if (!response.ok) {
      talkgroupNameCache.set(talkgroupId, null);
      return null;
    }
    const data: { ID?: number; Name?: string } = await response.json();
    const name = data.Name ?? null;
    talkgroupNameCache.set(talkgroupId, name);
    return name;
  } catch {
    talkgroupNameCache.set(talkgroupId, null);
    return null;
  }
}
