/**
 * The list editors take their maxima from the radio's limits, not from literals.
 *
 * Scan Lists and RX Groups computed the right maximum for their subtitle and
 * their add handler — 100 and 250 on the DA-7X2 — then disabled the Add button
 * at a literal 32, so the 33rd could never be added. Zones printed and enforced
 * a literal 250. The values themselves are pinned in radioLimits.test.ts; this
 * pins that the editors use them.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const EDITORS = ['zones/ZonesList.tsx', 'scanlists/ScanListsList.tsx', 'rxgroups/RXGroupsList.tsx'];

describe.each(EDITORS)('%s', (file) => {
  const text = readFileSync(resolve(process.cwd(), 'src/components', file), 'utf8');

  it("disables Add at the radio's limit, not at a number", () => {
    const addDisabled = /addDisabled=\{([^}]*)\}/.exec(text)?.[1];
    expect(addDisabled, 'no addDisabled prop found').toBeDefined();
    expect(addDisabled).not.toMatch(/>=\s*\d+\s*$/);
  });

  it('prints the limit it enforces, not a number', () => {
    const subtitle = /listSubtitle=\{`([^`]*)`\}/.exec(text)?.[1];
    expect(subtitle, 'no listSubtitle found').toBeDefined();
    expect(subtitle).not.toMatch(/\/\d+ /);
  });
});
