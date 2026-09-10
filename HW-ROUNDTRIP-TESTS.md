# DA-7X2 hardware round-trip tests

Every core region is now read (**56/56**) and every region we may write is
written (**55/55** — `Local info` is the radio identifying itself and is flagged
`neverWrite`, so it is excluded from the write and round-trip denominators).

**What most of it still lacks is proof that a change survives the trip**: Core HW
round-trip is **20/55** — 9 on 2026-09-03, the whole Tier-1 table on 2026-09-09,
and **radio IDs + scan lists on 2026-09-10**, the first two established by the
radio's own menu and the vendor CPS rather than by our own read-back.

That gap is the whole point. Our encoders **patch** the original record, so a
write-back reproduces the input by construction — including for every field we
never write. A clean dry run proves no corruption; it never proves write
coverage. Only a **changed-field** round trip does: edit one thing, write, read
back in a **later session**, confirm the change and confirm nothing else moved.

---

## The RX-group gate — worked around, not solved

Until 2026-09-09 **no test below could run**: every write was refused before a
frame was planned, because `readRXGroups()` returned nothing while 79 channels
pointed at lists 1 and 2, and `findDanglingReferences` throws on that.

The cause is that `D890_ADDR.RX_GROUP_SET` is `0x3701510` — the address
`D890_HOT_KEYS.MASK` also claims — and it reads 32 zero bytes on a radio that
demonstrably holds two receive group lists.

**What was done:** `readRXGroups` now falls back to scanning the records when the
mask reads empty (a record is present when its head is not erased flash). It is
bounded, stops after 8 empty records, and logs a warning. Receive groups remain
**deliberately absent from the write** — `buildD890CodeplugTables` does not pass
them, so the records and whatever the real mask is ride out verbatim.

**What is still unknown: where the presence mask actually lives.** Candidates
checked and rejected: `0x3482c20` (the unclaimed gap where zones / radio IDs /
scan lists sit at `0x3482c00/c40/c60`) reads zero, and scanning every span of a
full read for a "0x03 then 31 zero bytes" signature found only the scan-list mask
and hot key 1's content byte. The likeliest answer is that receive groups have no
mask at all and are present-by-record, as GPS roaming is — but that is a
hypothesis.

**To settle it:** add a third receive group in the vendor CPS, write, re-read,
diff. Whatever byte goes `0x03 → 0x07` is the mask. If nothing moves, presence is
by record and `readRXGroups` should drive off the records outright rather than as
a fallback.

⚠️ **Do not add receive groups to the write until that is answered.** Writing a
presence mask to an unproven address is how a neighbouring table gets destroyed —
and `0x3701510` sits inside the hot-key span, which is why that span is planned as
`0x1510` rather than the full `0x1530` it reads.

---

## The protocol, every time

1. **Read** the radio in NeonPlug. This is the baseline the encoders patch.
2. **Change exactly one thing**, to a value that could not be a coincidence —
   see "choosing values" below.
3. **Write.**
4. **Wait 60 seconds.** The radio reboots and drops off USB for ~45 s. Reading
   into that window fails in a way that looks like a different bug.
5. **Read back in a NEW session** and confirm.

> ⚠️ **Never read mid-write, and never verify inside the writing session.** The
> encoders patch what the current session read, so an in-session read-back is
> comparing against pre-write contents.

**Choosing the value matters as much as the test.** A palindrome or a 0/1 proves
nothing — MDC unit ID `1111` was consistent with four different encodings at
once, while the very next value settled it. Use digits that differ, avoid
position 0 and the last position, and prefer a value that is impossible under a
rival reading.

---

## Tier 1 — ✅ COMPLETE 2026-09-09

All eight cleared in one session across three writes. No write refused, corrupted
a neighbour, or needed a retry. Kept here because the "Confirms" column is now a
record of what is PROVEN, not what was hoped for.

| | Region | Edit made | MEASURED on read-back |
|---|---|---|---|
| ☑ | **Status messages** | Added slot **3** = `RT test 2026` | Text at `0x37001C0` = `52 00 54 00 20 00 …`, and the bitmask at `0x3701500` went **`0x07` → `0x0F`**. The mask was the real test: presence is the bit, not the text. |
| ☑ | **Hot keys** | Hot Key 3 Content → SMS slot 4 | `0x3701068` = `04`. Entry 2 still `03`, entry 4 still `ff`, all 18 intact — the patch-not-rebuild proof, since they share `0x3700000` with the status messages. |
| ☑ | **Analog address book** | Added `7654321` / `RT Analog` | `0x3801080` = `76 54 32 10`, count `07` at `+0x07`, name from `+0x08`. Slot table `00 01 02 ff`, high half `00 00 00 ff` — `0x00` for a present slot, not `0xFF`. Also proved a record **built from zeros** for an unread slot is safe. |
| ☑ | **Analog address book — delete** | Deleted the first entry | **COMPACTS.** `Contact3` → slot 0 (`33 33 30 00`), `RT Analog` → slot 1 (`76 54 32 10`, count `07`), table `00 01 ff ff`. 20 bytes moved across two rewritten records. The delisted record at slot 2 is no longer even READ — the slot table is the authority. |
| ☑ | **MDC1200 address book** | Added Private, ID **4321** | `0x4A00106` = **`e1 10`** — little-endian u16, from our own encoder, with a non-palindrome. Group pair at `+0x04` correctly left `00 00`. Slot tables `…04 ff` / `…00 ff`. |
| ☑ | **SMS store — delete** | Deleted slot **2** of chain 1→2→3→4 | **DOES NOT COMPACT.** Exactly **2 bytes**: slot 1's `next` `02 → 03`, and `valid[2] → ff`. Slots 3 and 4 kept their numbers, head stayed `01`. Chain now 1→3→4. |
| ☑ | **DTMF settings** | First Digit `250`, Pretime `360`, Time-Lapse `470` | `+0x04` = `19`, `+0x03` = `24`, `+0x0a` = `2f`. **`+0x05` (Auto Reset) still read `9`** — the units check: raw seconds were not run through the ms÷10 path. |
| ☑ | **DTMF encode list** | Entry **2** → `4567` | `0x3500820` = `04 05 06 07 ff`. Entry 0 came back `01 02 03 01 02` — a **built** table reconstructing real flash byte-identically, which is the riskiest encoder class. |

**The talk group edit was predicted to the byte before it ran too:** 12 bytes in
2 frames — 4 for the BCD id, 8 for the name's low bytes (its UTF-16 high bytes
were already `00`) — and the dry run reported exactly that, in a region labelled
`talkgroups 1001-1010`. That label is itself the bank arithmetic showing its
work before a frame went out.

**What the three earlier dry runs predicted, and got right to the byte:** 13 bytes for
the status message (12 ASCII low bytes plus the mask — the UTF-16 high bytes were
already zero), 10 for the four-region write, 22 for the two deletes. Every
prediction reconciled by hand before the write went out. The dry run is now the
gate: run it, account for every changed byte, then write.

## What has earned a round trip so far

**Earned 2026-09-03 (9):** channels (name), zone membership, zone present mask,
AM zone A channel, AM zone scan, master radio ID, GPS roaming / zone bars, AM
airband VFO, auto-repeater offsets. The master ID is the only one also validated
independently in the vendor CPS.

**Earned 2026-09-09 (9)** — the whole Tier-1 table, in one session, across three
writes. Every one had an encoder and a parser for days and zero hardware
evidence; see `HW-ROUNDTRIP-TESTS.md` for the per-row detail.

| Region | What the round trip proved |
|---|---|
| Hot key / one-key | Status-message presence is the **bitmask** at `0x3701500`, not "does the slot have text" — and all 18 hot keys survived a write to the same span, which is the patch-not-rebuild proof |
| Analog / DTMF address book | BCD digits, the load-bearing count at `+0x07`, and **deletion COMPACTS** |
| Analog address book masks | Both halves; the high half is `0x00` for a present slot, not `0xFF` |
| SMS-associated block | **Deletion does NOT compact** — deleting a middle message moved exactly 2 bytes: one chain link and one valid byte |
| MDC1200 contacts | `4321` → `e1 10`: little-endian u16, from our own encoder, with a non-palindrome |
| MDC1200 contacts slot table / second table | Both halves, same shape as the analog book |
| DTMF | `+0x03/+0x04/+0x0a` are ms÷10 while `+0x05` is RAW seconds — Auto Reset stayed at 9 through a write that changed all three timings |
| DTMF encode list | A **built** table (not patched) reconstructed real flash byte-identically |

**Earned 2026-09-10 (2)** — DMR radio IDs and scan lists, in one write of 84
bytes inside a whole-codeplug write of 22,051 frames. Both are unusual in this
file for being confirmed WITHOUT relying on our own read-back.

| Region | What the round trip proved |
|---|---|
| DMR radio IDs | **The radio's own menu** showed four IDs with `RID Zulu` LAST after slot 3 was renamed and a new ID was written into the slot-2 hole. Records do NOT compact, an add reuses a hole, and a record built over erased flash is valid once its unmodelled tail is zeroed the way every vendor write does |
| Scan lists | The **vendor CPS**, reading the radio, returned `dwellTime = 55`, `pri1 = 0x3e` (62) and `pri2 = 0x3f` (63) — exactly what we wrote — while look-back A/B, dropout and revert came back untouched at 20/31/37/6. Hang time is invisible on the radio's own menu, so the CPS is the only independent check available for it |

Three write-path bugs were found BEFORE sending, by planning against a real read
and diffing every frame: the occupied-slot set never reached the reference gate
(every write refused), the BASIC encryption key record was copied into a frame a
quarter its size (planner aborted), and every encryption key was written one slot
too high because the parsers return 1-based ids. **The last of those is the case
for diffing rather than reading back** — the shifted keys are exactly what the
radio would then hold, so a read-back would have agreed with itself.

**Extra, 3 of 6: all three pictures** — boot, background 1, background 2, all
2026-09-03. Still the strongest evidence on this radio, because the proof is the
radio's own screen rather than a read-back: a wrong pixel or byte order writes
cleanly, reads back cleanly, and displays as noise. Background 2 also promoted
its address from `marshaller` to `hardware`.

**The analog address book joined that class on 2026-09-09** — after the write,
the book displayed correctly in the radio's own menu. That is worth more than a
read-back: it proves the RADIO'S FIRMWARE parses what we wrote, where a
read-back only proves our decoder agrees with our encoder. Prefer this check
wherever a region is visible on the radio.

Three extras remain: the **satellite table**, the **digital contact database**
and its **header**.

---

## Tier 2 — regions with encoders that carry rather than model

| | Region | Test | Note |
|---|---|---|---|
| ☑ | **Talk group — EDIT** | `TG1005` → `RTTG1005`, DMR ID `2345678`. **MEASURED:** `0x3A80322` = `02 34 56 78` (BCD), name `RTTG1005`. Slot 1004 landed in **bank 1**, proving the WRITER's bank arithmetic — the reader's was confirmed 2026-09-08, the writer's never had been, and a flat writer puts slot 1000 at `0x3A30D40`, which reads `0xFF` on hardware. Neighbours 1003/1005 untouched, and **all 1,009 other records byte-perfect** — the whole bank goes out as one span, so this is also the proof that record offsets inside a span are right. |
| ☐ | **Zone roam mask** | Read, write unchanged, read | It is carried **verbatim** and zero on every radio anyone has seen. The test is that a write does not disturb it. If it comes back changed, our write is wrong. |
| ⛔ | **Talk group locator / delete** | **The question it existed to answer is SOLVED, without a round trip.** The vendor CPS capture pair shows talk groups COMPACT: clearing a row shifts every later record down and frees the LAST slot. The locator is an identity table because slot always equals position — so `V = slot` was true and vacuous, and the hole this test wrote is a structure the radio cannot represent, which is why it crashed. Delete is refused until channel and receive-group references are renumbered; that is what needs a round trip, not this. |

## Tier 3 — the Extra regions

| | Region | Test |
|---|---|---|
| ☐ | **Satellite table** | Edit one TLE field, write, read back. The last Extra without a round trip — its encode/decode currently prove only that they are inverses of each other, which a matched pair of *wrong* functions satisfies equally well. |
| ☐ | **Digital contact database** | Not started. Needs the write path first; the header at `0x07000000` (count + end pointer) has never been written by anything. |

---

## What a pass and a fail each mean

**Pass** = the edited field reads back changed, **and** a full diff of the
codeplug shows nothing else moved. Both halves matter. A region can round-trip
its own field perfectly while corrupting a neighbour, and that is precisely what
a patch encoder is supposed to make impossible — so a neighbour moving is a real
finding about the encoder, not noise.

**Two bytes will move that you did not touch**, and they are not failures:
`0x01f` (current zone) and `0x02c` (active VFO) are live operator state and
follow the knob. They are flagged in `settingsMap.ts` for this reason.

**Fail** is worth as much as a pass, provided the value was discriminating. Three
findings this week came from a byte that did not move.

## Order to work in

Tier 1 is done. What is left, in the order it is worth doing:

1. **Zone roam mask** (Tier 2) — a "did anything disturb this" check, so it can
   ride along with any other write at no extra cost.
2. **The RX-group mask** — not a round trip but the thing blocking the most:
   add a third receive group in the vendor CPS, write, re-read, diff. See the
   section at the top of this file.
3. **Talk group locator** (Tier 2) — needs talk group writing first, which needs
   the banking fix. See `TODO-DA7X2.md`.
4. **Satellite table** (Tier 3) — the last Extra without a round trip.

### What the Tier-1 session established about method

- **The dry run is the gate.** Run it, then account for EVERY changed byte
  against a prediction before writing. All three writes were predicted to the
  byte beforehand; a discrepancy would have been a bug found for free.
- **Batching is fine when regions are disjoint.** Four Tier-1 rows went out in
  one write. "Change exactly one thing" is about DISCRIMINATING VALUES, not one
  edit per write — two changes in different regions cannot be confused.
- **Prefer the radio's own screen where a region is visible.** The analog
  address book displayed correctly in the radio's menu after its write, which
  proves the firmware parses what we wrote. A read-back only proves our decoder
  agrees with our encoder.
