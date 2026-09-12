# DA-7X2 hardware round-trip tests

Every core region is now read (**56/56**) and every region we may write is
written (**55/55** — `Local info` is the radio identifying itself and is flagged
`neverWrite`, so it is excluded from the write and round-trip denominators).

**What most of it still lacks is proof that a change survives the trip**: Core HW
round-trip is **34/55** — 9 on 2026-09-03, the whole Tier-1 table on 2026-09-09,
six on 2026-09-10 (**radio IDs, the radio ID mask, scan lists, zone names, the
scan-list mask and RX group lists**) and eight on 2026-09-11: **pre-defined SMS**
(quick messages), the **talk group locator** (talk group add and delete), and the
six of Write A below. Not one of those leans on our own read-back: twelve were
confirmed on the radio's own screen and two by the vendor CPS reading the
radio.

The radio ID mask is the one that also gained an OWNER: it was `Unclaimed mask`
in `recordLayout.ts`, a 32-byte gap no vendor marshaller touches, named from a
live read alone. Writing `0x0b` -> `0x0f` while adding an ID into a hole, and
seeing the radio list four, is what a presence mask does and nothing else.

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

**Second write, same day (2):** `Z1 Single` -> `Z1 Zulu` and a third scan list
added, 40 bytes across 6 frames. The radio showed the new zone name when
switching zones and three lists in its scan menu. `SL Echo` is the first scan
list this driver BUILT rather than patched — its four unshowable fields came
from a vendor-created list captured hours earlier — so the blank is validated
too.

That write also carried the first bytes NeonPlug has ever sent to the RECEIVE
GROUP table, whose presence mask address was pinned down hours earlier the same
day. The radio does not expose receive groups in its own menu, so the vendor CPS
was the check — and it read back `RXG Zulu` **at index 0**, by name, with the
empty contact list it was sent.

That single row confirms three separate things: the record was written, the
presence mask moved `0x02` -> `0x03`, and the add REUSED THE HOLE a CPS delete
had left rather than appending past it. `lowestFreeSlot` choosing slot 0 over
slot 2 had been true only in tests until then.

Three write-path bugs were found BEFORE sending, by planning against a real read
and diffing every frame: the occupied-slot set never reached the reference gate
(every write refused), the BASIC encryption key record was copied into a frame a
quarter its size (planner aborted), and every encryption key was written one slot
too high because the parsers return 1-based ids. **The last of those is the case
for diffing rather than reading back** — the shifted keys are exactly what the
radio would then hold, so a read-back would have agreed with itself.

**Earned 2026-09-11 (2): pre-defined SMS — quick messages.** On a radio holding
*Welcome!*, *Good bye!* and *Happy every day!* in slots 0-2, ONE write added
*RT Zulu 42*, deleted *Good bye!* and edited *Welcome!* to *Welcome Zulu* —
1,048 bytes in 70 frames, exactly what the dry run predicted. The radio's own
quick-text list then read *Welcome Zulu, Happy every day!, RT Zulu 42*.

That one screen confirms three things we had only from captures: the radio
follows the SMS store CHAIN (0→2→3, stepping over the hole at slot 1), it takes
each text from the slot its envelope names, and it accepts an envelope built
from zeros the way the vendor builds them. The reader follows that chain now
too — the vendor CPS dropped a text whose envelope had been retired, and a slot
scan would have shown it.

**And the talk group locator — talk group add and delete.** After a vendor-CPS
shrink to TG0001-TG0020, one NeonPlug write deleted TG0005 and TG0010 and added
*RT Zulu TG*. The radio listed 19, the new one last, and scrolled to the end of
the list without crashing — the same place the 2026-09-10 delete crashed it. That
delete had left the freed record populated; this one wrote the tail the way the
vendor does, a zero tail where the freed slot shares a frame and the rest erased.
The same write moved channel 56's TX contact 15 → 13 to follow TG0015, and the
radio showed that channel's group call as TG0015's ID. Reference renumbering is
confirmed too: without it the channel would have shown TG0017.

**Channel ADD, 2026-09-11 — records the radio had never held.**

Two channels were added in NeonPlug and written: **202 `ZULU SIM`** (147.000
simplex) and **203 `ZULU MNS`** (RX 146.940, TX 146.340 — a real −0.600 repeater
offset), both also appended to zone `Z1 Single`. Neither slot had ever held a
record, so neither had an original to patch: they were BUILT, from the blank
derived from the vendor's own two fresh records earlier the same day.

The vendor CPS read the radio afterwards and confirmed all three things asked of
it: 202 simplex at 147.000, **203 with TX 146.340**, and channel 200 `ZULU ANA`
unchanged at 146.000/146.600. The operator also saw both new channels in zone
`Z1 Single` on the radio itself.

The offset one is the test that mattered. `applyChannelToRecord` reads duplex OUT
of the record and refuses to change it — right for an edit, and fatal for an add,
because a blank reads as duplex 0 and the channel would have been stored simplex
and TRANSMITTED ON ITS INPUT. The bytes the radio kept are the vendor's own
encoding: `14 69 40 00 | 00 06 00 00 | 90` — RX, magnitude 0.600, direction bit 7.
Channel 202 is the other half: `14 70 00 00 | 14 70 00 00 | 10`, RX repeated at
0x04, which is what the CPS does for every one of its 110 simplex records.

No coverage milestone moves — `Channels` and `Zone membership` were already
round-tripped — but the capability did: NeonPlug can now program a channel that
was not already on the radio, not merely edit one.

**Write A, 2026-09-11 — six regions in one write, all checked on the radio.**
One write of 41 bytes in 12 frames, exactly the dry run, against a radio read
3.5 s earlier:

| Region | Edit | Seen on the radio |
|---|---|---|
| Zone hidden mask | Hid `Z5 Tones` of six zones | The zone menu listed five |
| VFO A / VFO B | VFO A 435.06250 → 438.73750 | The VFO display, before the dial was touched |
| FM broadcast channels | `FM-001` 108.0 → `ZULU FM` 101.9 | FM channel list, name and frequency |
| FM VFO | 108.0 → 99.5 | FM VFO tuned there |
| AM airband channels | index 0 `CZBB TWR` 118.100 → `ZULU AM` 119.300 | First channel of airband zone CZBB |
| AM airband zones | zone 2 `VYVR` → `ZULU ZONE` | Airband zone list |

Three more regions went out in the same write and could not be checked ON the
radio — channel 102 belongs to no zone and this radio browses channels through
zones; the boot screen draws the image while `powerOnInterface` is 2. A vendor
CPS read of the radio settled them, and it did NOT settle them all the same way:

| Region | CPS read after the write | Verdict |
|---|---|---|
| Channel presence mask | 102 gone, 101 `Sixteen Chars XY` still there | ✅ confirmed |
| Power-on display | line 1 `ZULU ONE`, line 2 still `ANYTONE` | ✅ confirmed |
| FM scan mask | first FM channel still shows **Add** | ❌ the write did not stick |

⚠️ **RESOLVED 2026-09-11, and the answer is that the write did not stick.** The
staged edit was `scanAdd: false` on FM index 0 (read back as `true` beforehand),
the dry run showed one byte at `0x3402050`, and the write sent 12 frames with no
refusal — yet the CPS still read that channel as `Add`. Reading `0x3402050` back
through NeonPlug settled it: `01 00 00 …`, the ORIGINAL value. The radio never
took our `00`.

So this is not a decode, polarity or address error. The vendor's own read capture
(`7x2_read_new.txt`) holds `01` at the same address, and our read and write both
take set = scanned; six regions in the very same 12-frame write landed and were
confirmed on the radio, and two more in the CPS. One address in that batch simply
did not change.

The leading explanation is that the radio OWNS this byte at runtime: FM scan
state is live state, the operator was in FM mode between the write and the read,
and firmware flushing its own copy over ours would look exactly like this. That
is a hypothesis, not a finding. What IS established: a planned, ACKed frame is
not by itself proof the radio kept the bytes — only a read-back is. Nothing else
in the batch behaved this way, so this is about this region, not the write path.

⚠️ **Two regions never reached the plan at all**: zone current channel A and B.
`buildD890CodeplugTables` prefers the READ-TIME `zoneCurrentById` over the table
the Zones tab edits, so the edit is silently dropped — found because the staged
edit produced no region in the dry-run diff. See `TODO-DA7X2.md`.

**Extra, 5 of 6: three pictures, the DMR CONTACT DATABASE and its HEADER.**

The contact database earned its round trip on 2026-09-10, written BY NEONPLUG
and read back by the VENDOR CPS, which listed all 200 contacts with every field
in its own column.

**Corrected 2026-09-11:** this paragraph said that one read confirmed all three
of the database's regions, the INDEX at `0x07080000` included. It could not
have. The CPS's contact read is a probe, the header and the record banks
(`7x2_read_contacts.txt`, 85 runs) — it never reads the index, so no CPS
read-back can vouch for it. What the 200 confirmed is the records and the
header count. The index is covered below.

It took TWO attempts, and the first is the more useful entry. The writer was
built deliberately NOT to truncate fields, on the reasoning that the vendor's
CSV-import truncation was a quirk — this radio's own database holds a
16-character province while the import cut to 15. Writing 200 contacts with a
16-character city produced a database the CPS read as **137** contacts with
every field sliding one column right from the first overlong record on. The
reader takes at most N characters and continues from THERE rather than from the
NUL, so an overrun field desynchronises everything after it.

That is a failure mode no offline test could have found: our encoder and decoder
agreed with each other perfectly, and the bytes matched the vendor's own for
every record the vendor had written — because the vendor never wrote an overlong
one. Only a radio could say otherwise.

Bank chopping is now settled — offline, against the vendor. A capture of the
CPS uploading 500,000 contacts (1.13 GB, run to `END`) matches NeonPlug's
planner in every one of its 3,719,974 frames: the header, all 250,000 index
frames, and 3,469,973 record frames across 277 bank boundaries. It showed the
index is banked like the records (256,000 bytes per `0x80000`), that records go
in INPUT order with only the index sorted, and that the region runs to at least
bank 277.

That proves our bytes are the vendor's. It is NOT a hardware round trip of our
own multi-bank write, which needs a NeonPlug restore read back by the CPS. Our
32,637-contact write (17 banks) was read back as "32k+ entries" and then
overwritten by the 500,000 upload before its records could be checked.

**The multi-bank round trip, 2026-09-11.** NeonPlug restored the owner's
133,699 contacts — 68 record banks with 66 records split across a seam, 5 index
banks, 914,862 frames in 386 s. The vendor CPS, reading the radio, listed
**133,699** with the last record written (`9990001`) in slot 133,699, and the
owner browsed the whole list. That round-trips the multi-bank records and the
**header**, whose count and end address the CPS read is sized by.

The index needed a different check, because the CPS never reads it. One
NeonPlug read session took the header, both sides of all 4 index-bank seams,
the index's final entry and its `0xFF` pad, both sides of all 67 record-bank
seams, and 25 lookups done the radio's way — index entry, then offset, then
record. **34,864 bytes, zero differences** from the plan. An independent Python
encoder that shares no code with the planner agrees, and rebuilds all 66 split
records from the radio's two halves.

That is a NeonPlug read-back, so it proves the index is ON the radio as planned,
not that the firmware searches it the way we believe. The check still owed is
the radio's own: a received call from someone in the list showing their name.

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

One extra remains: the **satellite table**.

---

## Tier 2 — regions with encoders that carry rather than model

| | Region | Test | Note |
|---|---|---|---|
| ☑ | **Talk group — EDIT** | `TG1005` → `RTTG1005`, DMR ID `2345678`. **MEASURED:** `0x3A80322` = `02 34 56 78` (BCD), name `RTTG1005`. Slot 1004 landed in **bank 1**, proving the WRITER's bank arithmetic — the reader's was confirmed 2026-09-08, the writer's never had been, and a flat writer puts slot 1000 at `0x3A30D40`, which reads `0xFF` on hardware. Neighbours 1003/1005 untouched, and **all 1,009 other records byte-perfect** — the whole bank goes out as one span, so this is also the proof that record offsets inside a span are right. |
| ☐ | **Zone roam mask** | Read, write unchanged, read | It is carried **verbatim** and zero on every radio anyone has seen. The test is that a write does not disturb it. If it comes back changed, our write is wrong. |
| ☑ | **Talk group add / delete + locator** | **ROUND-TRIPPED 2026-09-11** on a radio holding TG0001-TG0020: one write deleted TG0005 and TG0010 and added `RT Zulu TG`, 246 bytes and exactly the dry run. The radio listed 19 with the new one last, and did not crash at the end of the list. What made it work is laying the tail out as the vendor does (`7x2_onecleared.txt`): the table compacts, the bytes of the freed slot that share the last frame are zero, and the rest of the freed record is erased. The 2026-09-10 hole test left that record populated while the mask and locator said absent — the crash. |

## Tier 3 — the Extra regions

| | Region | Test |
|---|---|---|
| ☐ | **Satellite table** | Edit one TLE field, write, read back. The last Extra without a round trip — its encode/decode currently prove only that they are inverses of each other, which a matched pair of *wrong* functions satisfies equally well. |
| ☑ | **Digital contact database + header** | 2026-09-11: 133,699 contacts restored by NeonPlug and read back by the vendor CPS (count, last record, a full browse). The index, which the CPS never reads, verified by a NeonPlug seam read. |

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

1. ~~**Quick messages**~~ (pre-defined SMS) — ROUND-TRIPPED 2026-09-11; see
   "What has earned a round trip so far".
2. **Zone roam mask** (Tier 2) — a "did anything disturb this" check, so it can
   ride along with any other write at no extra cost.
3. ~~**The RX-group mask**~~ — SETTLED 2026-09-10: `0x3701510`, confirmed by two
   vendor captures; receive groups are wired and round-tripped.
4. ~~**Talk group locator**~~ — ROUND-TRIPPED 2026-09-11 with talk group add and
   delete.
5. **Satellite table** (Tier 3) — the last Extra without a round trip.

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
