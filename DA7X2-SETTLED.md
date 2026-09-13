# DA-7X2 — settled findings

Questions that are **closed**. Moved out of `TODO-DA7X2.md` on 2026-09-09, which
had grown past 1,100 lines with most of it being history rather than work.

Kept rather than deleted for one reason: several of these were settled by
disproving something this project believed for a while, and the reasoning is what
stops it being re-litigated. Do not re-open one without new evidence — and if you
do, the standard is the same one that closed it.

---

### Done, validated offline against bytes a real radio ACKed

| | |
|---|---|
| ☑ | `buildWriteCommand` reproduces vendor frames byte for byte, incl. the wrapping checksum cases |
| ☑ | Seven encoders round-trip real vendor records, each also proved surgical |
| ☑ | `dryRunWrite()` / `renderWriteLog()` build the whole frame sequence with no port open |
| ☑ | Session layer: `writeMemory()`, per-frame ACK, `runWriteSession()` validating every frame before sending the first |
| ☑ | A failed write **poisons the connection** so `sendEnd()` cannot commit it |
| ☑ | Our address guards refuse **nothing** the vendor CPS does — 0 hits across 8,389 frames |

---

### 1. Channel write — DONE and VERIFIED 2026-09-01

- ☑ `writeChannels()` wired to `planChannelWrite()` -> `runWriteSession()`.
- ☑ **What a write must include: only what changed.** Answered on hardware, not
  by reasoning — see the partial-write item below.
- ☑ The Write confirmation now shows the plan: frames, wire bytes, estimated
  time, which channels change, and — in bold — which channels it would REMOVE.
  Built from the SAME inputs as the write via one shared function, because a
  preview built from different inputs shows one plan and sends another.
- ☑ VFO A/B no longer need excluding. The encoder rewrites the name field only
  when the name actually changed, so the radio's `0xFF` padding is left alone
  instead of being rewritten as `0x00`.
- ☐ **The Write BUTTON path has not been exercised on hardware.** The verified
  write was driven from the console. Same protocol code, but the button also
  goes through the hook's restore step and the confirmation.

---

### 3. Masks — DONE

`planMaskedTableWrite()` recomputes the presence mask for any records-plus-mask
table, keeping both of `planChannelWrite`'s hard rules: records are patched not
built, and **the mask is patched not rebuilt** — only bits for slots the table
actually has are touched. A mask read is 16-byte aligned and routinely wider
than its table (128 bits for 100 5-Tone slots), so rebuilding would zero bits
nobody has ever looked at; on the channel table that same rule is what keeps
VFO A/B registered at slots 4000-4001.

Specs in `D890_MASKED_TABLES` take every address from the read path rather than
repeating it — a write that disagrees with the read about where a table lives
would survive a read-back while the radio held something else.

☑ talkgroups (**inverted** mask) · AM airband · FM broadcast · AM zones ·
5-Tone · 2-Tone. Slots being cleared are reported, never cleared silently.

---

### 4. The partial-write question — ANSWERED 2026-09-03, on hardware

Recorded as answered on 2026-09-01, correctly reopened when a sparse write left
the radio in a bad state. **Now genuinely settled, by a whole-codeplug write and
a cross-session read-back.**

**The rule stands and is now evidence-backed: write what we read.**
`onlyChangedRecords` stays false, matching the vendor CPS.

- ☑ **A NeonPlug write produces a complete codeplug.** `planCodeplugWrite` is
  wired through `D890UVProtocol.writeCodeplug` to the Write button. 8,635 frames
  / 138,160 bytes / 131 read spans / **0 regions skipped** — 103% of the vendor's
  own byte count.
- ☑ **Full write verified on hardware 2026-09-03.** Read 05:59 -> write 06:00 ->
  read 06:01. Parsed codeplug **identical across 210,376 characters**: 120
  channels, 8 zones, 2 scan lists, 6 talkgroups, 4 radio IDs, 2 RX groups, 6
  encryption keys, 5 SMS, 219 settings. The only diffs were `zone.id`, which is
  `generateZoneId()` — client-side, regenerated per read, never from the radio.
- ☑ **Single-field edit verified on hardware 2026-09-03.** Channel 11 name
  `"CT dec 67.0"` -> `"NEWCT dec 67.0"`. The plan contained that one field and
  nothing else; the read-back matched what was sent; the radio's own screen
  showed it.
- ☑ **Zone membership edit — FIXED 2026-09-03 after failing on hardware.**
  Removing a channel from zone 5 staged correctly (write snapshot held 12
  members, read-back showed 13). `readLog` is keyed by ADDRESS, so a wider read
  landing on `ZONE_CHANNELS` replaced slot 0's 512-byte entry with a 4096-byte
  span covering all eight zones; `readLog.get()` handed that back as zone 1's
  "record", so writing zone 1 also rewrote zones 2-8 with their PRE-EDIT bytes
  and the edited zone received **two conflicting writes for one address**. The
  radio kept the first. Fixed by slicing originals to the record stride
  (`sliceFromReadLog`, not `.get`), plus a hard guard: `planCodeplugWrite` now
  REFUSES if any address appears twice. Pinned by
  `tests/unit/d890ZoneEditSurvives.test.ts`.
  **Verified on hardware 2026-09-03**: read 06:34:21 -> write 06:34:53 -> read
  06:35:52. Z5 Tones `[9,10,11..21]` -> `[9,11,12..21]`, channel 10 removed,
  every other zone byte-identical, and what was sent equals what landed with no
  diff at all. This is the first NeonPlug write that CHANGED a table rather than
  writing it back.
  > A second bug shipped inside the first fix and refused every write:
  > `ZONE_NAME_STRIDE` (0x40) is record SPACING, while the read only fetches
  > `ZONE_NAME_READ` (`alignRead(0x22)`). Slicing originals to the stride
  > demanded bytes that were never read. Slice to what the READ fetches, not to
  > the stride — they are different numbers for names and the same for members,
  > which is exactly why it was easy to miss.
  > **Why every earlier write looked clean:** a write-back sends identical bytes
  > in both frames, so a duplicate is invisible. Only a real edit exposes it.
  > This is the concrete case of the rule in 5a — a no-op write proves far less
  > than it appears to.
- ☐ **Still untested: a mask whose bits actually CHANGE.** Both verified writes
  rewrote masks identically. Adding or deleting a channel or zone is the
  untested path, and it is the destructive one.

**A caveat that is not a bug.** The settings region is written back verbatim
when settings are unedited, and it contains Work Mode (`displayMode`, `vfMrA`,
`memZoneA`). So a write restores the radio's current zone / channel / display
mode to whatever they were at READ time. Vendor-equivalent — `0x3500000` is in
`VENDOR_WRITE_RUNS` — but surprising, invisible, and it makes every
read->write->read comparison look dirty. Decide whether to exclude it.

---

### GPS roaming position — WRONG OFFSETS, fixed 2026-09-03

A latent corruption bug, found by putting an agent on the region after a user
set real values in the vendor CPS.

`parseGpsRoamingEntry` read position with the axes INTERLEAVED (both degrees and
both hemispheres, then both sets of minutes). The real layout is PER AXIS, the
same as APRS at `0x3501000`:

    +0x02 lat deg   +0x03 lat min   +0x04 lat hundredths   +0x05 N/S
    +0x06 lon deg   +0x07 lon min   +0x08 lon hundredths   +0x09 E/W

- ☑ Offsets corrected; `d890uvGpsRoaming` and `d890TableRoundTrip` updated,
  including a test asserting the encoder reproduces the vendor's exact bytes.
- ☑ Provenance promoted `marshaller` -> `hardware`.
- ☑ **CHANGED-FIELD HARDWARE ROUND TRIP 2026-09-03.** An existing fence edited
  (latitude 44.11' -> 43.80') and two further fences ADDED on previously blank
  slots, written by NeonPlug and read back correctly. The first records this
  driver has written into EMPTY slots of this table — the edit alone would not
  have tested that path.
- ☑ UI: coordinates editable as decimal OR `ddd mm.mm` (a toggle matching the
  CPS's own two tabs), with both notations accepted on input either way.
- ☑ Zone picker stores the HARDWARE SLOT, not the array position — it stored
  the index before, so on a codeplug with a deleted zone it would have retargeted
  a fence at whichever zone happened to sit at that position. Names are shown
  bare, with the slot appended only where two zones share a name (a real radio
  came back with two "Z3 Boundary" and two "Zone Eight Long").

**The old offsets were impossible, not merely unverified.** On the captured
record `01 05 31 2c 0b 00 77 21 16 01 00 00 f4 01 00 00`, byte `0x03` (44) was
read as the SOUTH boolean and `0x06` (119) as latitude MINUTES, which only run
0-59. Two of ten bytes were outside the range of the field they were assigned to,
and a geofence in British Columbia rendered as a point in the South Atlantic.

**Three things worth carrying forward:**

1. **The record map contradicted itself and the code followed the wrong half.**
   The note said "Position is NOT grouped per axis the way APRS is" and, a few
   sentences later, "almost certainly the SAME layout confirmed for APRS — four
   fields per axis, matching exactly". Its own `contents` string said per axis.
2. **The interleaving came from `GPSRoaming.CSV` COLUMN order** — presentation
   order, not storage order. For APRS the two happen to coincide, which is what
   made the reasoning look safe.
3. **A patch-based encoder hid it completely.** Encoding with the same wrong
   offsets reproduces the bytes exactly, so a read->write round trip and the
   dry run both showed zero difference. It could only ever surface as a wrong
   position in the UI, or as a user EDIT written into the wrong byte. Same
   failure mode as `patch-encoders-hide-unwritten-fields`.

Also confirmed from the CPS: **Zone is a hardware SLOT** (byte `05` displays as
"Z7 Digital", and Z7 is at slot 5), and `MinInt`/`MinMark` are the integer and
hundredths halves of one minute — the ZONE_BARS editor shows "Latitude Minute"
as a single decimal `44.11`.

---

### Master radio ID — DONE, full hardware round trip 2026-09-03

First of the eight read-but-not-modelled regions; **seven left**. Bytes were
already in hand from the preserve pass, so no new hardware read was needed to
start — that is true of all seven remaining.

`0x3684000`, 0x40 bytes — byte-for-byte a Radio ID record, so it reuses that
codec:

    +0x00  16 77 64 15                  BCD-as-hex id  (16776415)
    +0x04  4d 00 41 00 ... 58 00        "MASTERX" UTF-16LE, 32 bytes
    +0x26  01                           Override All TX IDs

- ☑ Read and decoded. Confirmed by setting the ID and name in the vendor CPS
  and reading the exact bytes back.
- ☑ Encoder wired into `planCodeplugWrite` — the ID and name reuse
  `applyRadioIdToRecord`; the override byte is set separately because a Radio ID
  record has no such field.
- ☑ **`Override All TX IDs`** (the CPS labels the checkbox "Used") is a byte at
  `+0x26`. Located by toggling it while KEEPING the ID and name: one span of 133
  changed, one byte within it. That also killed the first guess — that "Used"
  merely meant the record was non-empty — which the record staying fully
  populated with the box unticked disproved outright.
- Specific to the MASTER record: all four regular Radio ID records carry `0x00`
  at `+0x26`. Same layout, different meaning — do not merge the codecs.
- ☑ UI on the Digital tab (`MasterRadioIdCard`), above the Radio ID list —
  name, DMR ID and an **Override All TX IDs** checkbox, with the vendor's word
  "Used" kept in the hint so the two can be matched up.
- ☑ **WRITTEN BY NEONPLUG AND VALIDATED.** DMR ID changed to 776655 and
  Override All TX IDs unticked, written by our encoder, read back as
  `00 77 66 55` + "MASTERX" with `+0x26 = 00`, and then confirmed independently
  in the vendor CPS, which showed the ID, name and checkbox exactly as written.
  **The first region this driver has written from scratch rather than echoing
  vendor bytes**, and the first validated by a tool that shares no code with us.
  Note the BCD handled a 6-digit ID with a leading zero (`00 77 66 55`)
  correctly — worth knowing, since that codec is shared with every Radio ID.

---

### AM scan and A Channel — FOUND, and both now read/write

**Located 2026-09-03 from the vendor CPS's own write frames** (`7x2_amzoneexport*`),
after a full read diff came up empty. Both live in the AM mask block, outside
the zone record:

| field | address | shape |
|---|---|---|
| **A Channel** | `0x3884600 + slot*2` | u16 — a POSITION in that zone's member list |
| **AM scan** (`AmChannelList_CH_Scan`) | `0x3884800 + slot*4` | u32 bitmap — one bit per MEMBER POSITION |

Proof: zones of 6/7/16 members with A Channel set to their last entry wrote
`05 00 06 00 0f 00` — positions 5, 6, 15. The scan table read
`3f / 7f / ffff` — exactly 6, 7 and 16 bits set.

- ☑ Read, decoded, displayed, editable and written. `AmZonesEditor` shows a
  scan tick per member chip (unscanned chips are muted) and A Channel as a
  selection among that zone's own members.
- ☑ **CHANGED-FIELD round trip on hardware 2026-09-03**: CZBB's A Channel 3->0
  and one member unticked; read back as `00 00 04 00 0e 00` and `3b 00 00 00`,
  with the other two zones untouched. 2 bytes changed out of 8,533 frames.
- ☐ `0x62-0x7f` in the AM zone record is still unmodelled (30 bytes, zero in
  every record seen).

**Two corrections worth keeping**, both mine:

1. I dumped `0x3884600`/`0x3884800`, saw all-`FF`, and declared them erased and
   the scan field non-existent. They were erased **because NeonPlug never wrote
   them and the CPS had not touched them that session** — absence on an
   unwritten radio is not absence of a field.
2. I read one correlated change (`CurWorkCH` at `+0x20` going `06 -> 00`) as
   confirmation that it was A Channel. It is a different field. One correlated
   byte is much weaker evidence than it felt like at the time.

---

### Superseded: "AM scan — there probably isn't one"

Hunted 2026-09-03 by diffing a full read (156 KB, 131 spans) before and after a
vendor CPS write. **No scan field appeared anywhere.** Ruled out:

- the AM zone record tails (`0x40-0x7f`) — zero on every zone, before and after
- `0x3884600` and `0x3884800`, the two "unidentified" reads in the AM mask block
  — both erased `FF`, never written by anything

The symptom that started the hunt ("channel 1 shows in every zone") was **not** a
scan list: all three zones had `A Channel` = 0, and index 0 was a DELETED slot
still holding its old name. Compacting the AM table closed the gap and the radio
now shows the right station. `AmChannelList_CH_Scan` is a vendor field NAME with
no located bytes; treat it as unproven rather than as a region to find.

---

### AM zone record — layout corrected on hardware 2026-09-03

The same diff settled three things about the `0x80` record:

- ☑ **`A Channel` is `CURRENT_AT` (0x20)** — an absolute AM index. The vendor
  write moved it `06 -> 00` on zone 1 and `0d -> 00` on zone 2, matching the CPS
  showing "CZBB TWR" for all three. There is **no B channel**; the CPS shows one
  column, unlike the main zone table.
- ☑ **Members stop at 0x62, so the list is 32 entries, not 47.** The vendor
  fills `0xFF` from the terminator to `0x61` then `0x00` at `0x62` — a boundary
  it would not draw if members ran to the end. `capacity` was computed from
  `STRIDE`, so a 32+ member zone would have written into `0x62-0x7f`.
- ☐ **`0x62-0x7f` (30 bytes) is unmodelled.** Zero in every record seen. Left
  alone by the encoder; poisoned in a test so encroachment fails loudly.

Also confirmed: **`0x3884000` is the AM VFO record**, same shape as a channel —
BCD frequency at `+0x00`, UTF-16LE name at `+0x04`. The CPS write set its name
to "AM-256". `recordLayout.ts` had this as a guess; it is now observed.

---

### AM zone `CurWorkCH` — RESOLVED on hardware 2026-09-03

It was an absolute index all along, not a position. `amZones.ts` recorded the
uncertainty honestly ("has not been confirmed for AM zones, and guessing wrong
would name the wrong channel") and both the airport import and the zone editor
hardcoded `currentChannel: 0`.

**The observation that settled it:** a radio with AM channels at indices 3-31
and three zones all carrying `currentChannel: 0` displayed **AM-001** — the
leftover name in the DELETED record at index 0. A position would have selected
the zone's first member and shown "CZBB TWR".

Note what made it invisible: **deleting a channel clears its mask bit but leaves
its record**, so a stale pointer shows old bytes instead of failing. Worth
remembering for any other index-valued field.

- ☑ Import now points a new zone at its first member.
- ☑ The editor re-points `currentChannel` whenever members change, so a zone can
  never name a channel it does not contain.
- ☑ `tests/unit/d890AmZoneCurrent.test.ts` pins the semantics, including that an
  out-of-zone pointer is REPRESENTABLE — nothing in the format forbids it, which
  is why the UI has to maintain it rather than relying on a parse-time check.
- ☐ Not yet re-tested on hardware: write a zone whose `currentChannel` names a
  real member and confirm the radio shows that channel rather than AM-001.
