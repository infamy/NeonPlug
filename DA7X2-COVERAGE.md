# DA-7X2 — region coverage

> **GENERATED. Do not edit.** Run `node tools/d890-coverage.mjs --write`.
> The numbers come from the flags in `src/radios/d890uv/recordLayout.ts`;
> editing them here changes nothing and creates a second, wrong answer.

## Overall progress

`█████████████████████████████████░░░░░░░`

### 84% — 154 of 184 milestones

Every region can earn up to three: **read**, **write** (parse → encode
reproducing vendor bytes) and a **hardware round trip**. This is the sum of
the six rows below, so it can never disagree with them.

Reading and re-encoding this radio are **done**. The 30 still open are
almost entirely the third kind — proof on real hardware that a change
survives the trip — which costs a radio, a write and a later read each.

| | Coverage | |
|---|---|---|
| **Core read** | `████████████████████` | **100%** — 56 of 56 |
| **Core write** | `████████████████████` | **100%** — 55 of 55 |
| **Core HW round-trip** | `█████████░░░░░░░░░░░` | **47%** — 26 of 55 |
| **Extra read** | `████████████████████` | **100%** — 6 of 6 |
| **Extra write** | `████████████████████` | **100%** — 6 of 6 |
| **Extra HW round-trip** | `█████████████████░░░` | **83%** — 5 of 6 |

Core regions: 56. Extra regions: 6.

Excluded from the write and round-trip denominators (`neverWrite`): `Local info` — the radio identifying itself.

## Readable but not encodable

_None._

## What each dimension means

- **read** — the region is fetched and parsed.
- **write** — the OFFLINE round trip: `parse` → `encode` reproduces captured
  vendor bytes exactly. Provable with no radio.
- **HW round-trip** — read from a radio, **one field changed**, written, read
  back in a SEPARATE session, change confirmed and nothing else moved.

The offline round trip cannot catch an encoder aimed at the wrong ADDRESS:
this radio ACKs a write without echoing it, so perfect bytes sent to the wrong
place look exactly like success. And because encoders PATCH rather than
rebuild, a region whose fields are never written round-trips a no-op
perfectly — which is why **write-back evidence never promotes a region.**

What earned each round trip is recorded in `HW-ROUNDTRIP-TESTS.md`.
