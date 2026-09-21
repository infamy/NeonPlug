/**
 * The raw region dump asks a protocol what it can do, not which class it is.
 *
 * That is only safe while the capability and the protocol agree: a radio whose
 * capabilities include `supportsRawRegionDump` gets the Diagnostics panel, so
 * its driver has to be able to read memory by address. This holds every
 * registered radio to that — and catches a renamed method, which the structural
 * check would otherwise only discover when someone clicks Dump.
 */

import { describe, it, expect } from 'vitest';
import { RADIO_DESCRIPTORS, createProtocolForModel } from '../../src/radios';
import { isRawRegionReader } from '../../src/radios/shared/rawRegionReader';

const declaring = RADIO_DESCRIPTORS.filter((d) => d.capabilities.supportsRawRegionDump);

describe('raw region dump: capability and protocol agree', () => {
  it('is declared by at least one radio, so the check below is not vacuous', () => {
    expect(declaring.length).toBeGreaterThan(0);
  });

  it.each(declaring.flatMap((d) => [...d.modelIds]))('%s can read memory by address', (model) => {
    expect(isRawRegionReader(createProtocolForModel(model))).toBe(true);
  });

  it('rejects no protocol, and one without the read methods', () => {
    expect(isRawRegionReader(null)).toBe(false);
    expect(isRawRegionReader({ connect: async () => {}, disconnect: async () => {} })).toBe(false);
  });
});
