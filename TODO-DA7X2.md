# DA-7X2 — what's left

Remaining work only. Findings and reasoning live in `DA7X2-STATE-AND-GAPS.md`.

Sources for open questions, in order of weight: the radio's own bytes, the CPS UI,
the vendor `.rdt` schema, then the **DA-7X2 Operating Manual** — extract it with
`tools/pdf-text.py`. The manual describes controls rather than bytes, so it can
settle what a setting MEANS without settling where it lives.

## Getting more captures

`DA7X2-CAPTURE-PROTOCOL.md` is the brief to hand to the agent driving the vendor
CPS on Windows. It carries the prioritised work list, the capture loop, and —
the part that matters most — **how to choose values**.

That last part is not fussiness. Most of a wasted day comes from picking a value
that cannot discriminate: MDC unit ID `1111` stored as `11 11` is identical under
BCD, u16 LE, u16 BE and packed hex, so it excluded nothing, while the very next
value `222` settled the encoding in one read. Palindromes, 0/1, and ascending
sequences are the traps.

Build on `DA7X2RESULTS/scripts/` rather than restarting — it is a working
harness whose hard findings (the settings controls are windowless VB6 with no
HWND; verify persistence by pixels because OCR returns '' for single characters)
cost real time to establish. What changes is that a radio is now in the loop: it
only ever diffed `.rdt` files, and `cps.py` refuses *Write To Radio* outright.

## The Windows/CPS agent — what the exchange settled

A second agent drives the vendor CPS on a Windows machine with the radio
attached, and publishes measured findings over HTTP. Two rounds so far, and the
traffic has gone **both ways**:

**They corrected us.**
- **MDC1200 IDs are little-endian uint16**, not byte-swapped BCD. Writing `1234`
  stores `d2 04`. Our reading came from two values that could not discriminate —
  `1111` is a palindrome, and `22 02` read as BCD looks like `0222`, which was
  matched to a believed 222. It is really 546.
- **Talk group banking confirmed on hardware.** We had changed to 1000 records
  per bank at `0x80000` on disassembly plus structural consistency, flagged as
  unconfirmed. 1010 talk groups by CSV import put record 1000 at `0x3A80000`,
  and `0x3A30D40` reads back `0xFF` — never written.
- **Address book deletion compacts and renumbers**, so a slot index is not a
  stable identifier. Our code already tested only "is it `0xFF`".
- **State Information holds 32 rows**, not the 60 our layout bound implied.

**Group C came back 2026-09-08 — written to the radio and read back.**
- **Auto Repeater 2 CONFIRMED**, all four fields: `0x0f4..0x103` = u32 LE x 100000
  in V2min/V2max/U2min/U2max order, with Auto Repeater 1 unchanged. The
  "these mirror Repeater 1" doubt dissolves — both arrays were simply at factory
  defaults and nobody had ever changed either.
- **Voice header repetitions**: `0x02` -> `0x07`. The byte is the **displayed
  count**, not a 0-based index. The offset was right all along; the encoding was
  what was wrong.
- **Predefined SMS deletion CONFIRMED** exactly as modelled — a linked list, not
  a compacting array. **But the analog address book DOES compact and renumber.**
  Two tables in one radio, two deletion semantics.
- **Three DTMF timing bytes assigned**: `+0x03` Pretime, `+0x04` First Digit
  Time, `+0x0a` Time-Lapse After Encode, each a single byte holding value/10.
  Two remain unassigned because their values could not be varied.
- **`BT On/Off`: `0x02` is KISS TNC**, measured from the radio menu. `0x01` = On
  is by elimination, not measurement.
- **Table B in both address books RESOLVED with no capture** — it is the HIGH
  byte of a u16 slot index whose low byte is Table A, `0xFFFF` for absent. It is
  0x00 for every present slot because every index is below 256, and both books
  cap at 128 rows, so a non-zero value is **unreachable on this hardware**. The
  experiment we proposed could never have worked.

### ⚠️ A vendor CPS write DESTROYS radio-menu-only settings

Measured, and then confirmed by the radio's owner: **the CPS turned the
Bluetooth off.** Not a byte that moved — a feature that stopped working. The CPS
wrote `0x00` over a radio sitting in KISS TNC,
because `BT On/Off` exists on none of its 18 tabs — the field is absent from its
model, so it writes its own default. Two more bytes moved the same way:
`0x01f` (current zone) and `0x02c` (active VFO), both **live operator state**.

**NeonPlug is safe here by construction** — the encoders PATCH the last read
rather than build from a model, so a byte nobody edited is written back
unchanged. That is now a load-bearing property, not an implementation detail:
do not "improve" it into a rebuild. The two volatile bytes are flagged in
`settingsMap.ts` because writing them back still moves the operator's current
zone and VFO to wherever they were at read time.

**We corrected them.**
- **`0x03900000` is the talk group record locator table**, which their handoff
  listed as the largest unexplained region in the write set. A write must emit
  `V = slot index` for present slots and `0xFFFFFFFF` for absent — *not* a
  packed `0..N-1`.
- **The DMR contact database is at `0x07900000`, not `0x18000000`.** Their doc
  concluded the latter from static analysis; a 312 MB capture of the CPS
  downloading contacts contains no `0x18……` address at all. We also supplied the
  per-record layout their document listed as unresolved.
- **`Mute timing` has 256 options, not the 8 they measured** — their own earlier
  `.rdt` sweep has `{END}` → `256minute` → `0xFF`, marked VERIFIED. Almost
  certainly the visible row count of an unscrolled list.

`DA7X2-CAPTURE-PROTOCOL.md` is the work order they run from; the punch list of
what still needs the radio is in the same place.

> **2026-09-08: Core read 79% → 100% (44 → 56 of 56). Every core region the
> radio has is now read and decoded.** Four parsers written over
> the previous two days — status messages, hot keys, the analog address book and
> the MDC1200 book — existed as 471 lines of correct, tested code that **nothing
> called**. Decoding a region and wiring it to a read are separate jobs, and only
> the second one counts. The reads cost almost nothing: the hot-key region was
> already fetched by the preserve pass, and both address books read their slot
> table first and then only the records it says are occupied.
>
> Three more parsers were then written and wired the same day — the SMS store,
> DTMF settings and the DTMF encode list — plus the MDC1200 slot table's high
> half and the zone roam mask, which is carried **verbatim and deliberately not
> decoded**: its bits are zero on every radio anyone has seen and no UI in the
> CPS, the language file or the .rdt can set them. Reading it is what lets a
> write put it back.
>
> **Then the encoders followed: Core write 75% → 100% (42 → 55 of 55).** Status
> messages, hot keys, both address books, the SMS store, DTMF settings and its
> encode list, the zone roam mask, and the talk group locator table now all have
> encoders. Every one PATCHES except the locator, which is built deliberately —
> the CPS writes all 10,000 entries every time and a stale entry points the radio
> at a record that is no longer there.
>
> **`Local info` is now flagged `neverWrite` and excluded from the write and
> round-trip denominators**, which is why those rows read `/55` while read reads
> `/56`. It is the radio identifying itself, and writing it would change what the
> radio claims to be — a region we are correct not to write is a finished state,
> not a shortfall. Counting it as a miss meant Core write could never reach 100%
> and permanently reported a gap that did not exist.
>
> The flag is deliberately narrow: it is for regions where writing would be
> WRONG, never for an encoder that simply has not been written. A test pins that
> `Local info` is the only one using it, that it cannot also be marked writable,
> and that its note says why.
>
> **The gap is hardware round trips.** Every region can be read and written; only
> a third has been proven to survive a CHANGED-FIELD trip on real hardware. The
> current figure is in [DA7X2-COVERAGE.md](DA7X2-COVERAGE.md) — deliberately not
> repeated here, because a number written in prose is a number that goes stale.

## Coverage

**→ [DA7X2-COVERAGE.md](DA7X2-COVERAGE.md)** — generated. Regenerate with:

```
node tools/d890-coverage.mjs --write
```

It parses `recordLayout.ts`, so the numbers cannot drift from the flags. The
table used to live here and went stale twice by being hand-kept; that is why it
is a generated file now and why nothing below repeats a figure from it.

What EARNED each hardware round trip is in
**[HW-ROUNDTRIP-TESTS.md](HW-ROUNDTRIP-TESTS.md)**, alongside the tests still
outstanding.

### Why these numbers move sideways

They have gone DOWN three times without anything regressing, always because the
denominator grew: regions get **discovered**, not lost. `0x3703900` and the two
contacts slot tables took core from 52 to 55 on 2026-09-07; the contact header
became a sixth extra the same day. Finding a region you were ignoring makes the
score worse and the driver better. Do not "fix" that by editing the table —
there is nothing to edit any more.

### Talk groups — EDITS work; add/delete still refuses (2026-09-09)

Three faults were found and fixed together, deliberately: fixing only the first
is the dangerous outcome, because on a codeplug under 1000 entries it appears to
work while writing every record one slot high.

1. **Never passed to the plan.** `buildD890CodeplugTables` omitted the table, so
   `maskedTable` returned immediately and the region went out verbatim — the
   edit silently dropped. Now passed via `d890Talkgroups()`.
2. **Flat addressing on a banked table.** The planners used
   `dataAddress + index * stride` while `talkgroupAddress()` banks at 1000.
   `tableRecordAddress()` is now the single place that arithmetic lives, the
   span planner plans one bank at a time, and a test asserts the writer and the
   reader agree at slots 0, 999, 1000, 1004 and 2500.
3. **Index base.** `QuickContact.index` is `slot + 1` off a read; the planner
   keys 0-based slots.

A fourth surfaced while testing: `maskedTable` fetched originals only for the
EDITED entries, but `planSpanTableWrite` needs every record its span covers,
because a 0xC8 stride means one frame carries bytes from two records. The first
talkgroup write would have refused, claiming its own neighbour was never read.
That path had never executed, since the table was never passed.

**Add and delete now work (2026-09-10).** `QuickContact` gained an optional
`uid`, assigned at read time as `tg-<slot>` and staged as
`talkgroupSlotByUid` — the same shape `zoneSlotById` uses, for the same reason.
`resolveTalkgroupSlots` keeps every read contact on its own slot, gives a new
one the lowest free slot, and claims existing slots BEFORE allocating so a new
contact listed first cannot take one a later existing contact still holds.

Keyed by uid rather than parsed out of it, deliberately: a codeplug imported
from another radio carries that radio's uids, and parsing would let them claim
slots here. An unknown uid is treated as new.

**`talkgroupLocator.ts` is wired.** The 40,000-byte table at `0x3900000` is
BUILT and written in full whenever talk groups are, which is what the vendor
does — the same capture that writes 1,200 bytes of records writes all 40,000 of
this. `V` is the SLOT INDEX with `0xFFFFFFFF` for absent, never a packed
`0..N-1`. Leaving it unwired was survivable while only edits were possible,
because an edit does not change the slot set; a delete puts a hole in the mask
and the two readings diverge immediately. That is why these two had to land
together.

✅ **VERIFIED ON HARDWARE 2026-09-09.** `TG1005` renamed to `RTTG1005` with DMR
ID `2345678` read back as `02 34 56 78` at `0x3A80322` — slot 1004, **bank 1**,
which proves the writer's bank arithmetic. Neighbours untouched and all 1,009
other records byte-perfect, so the record offsets inside a whole-bank span are
right too.

✅ **SOLVED 2026-09-10 — talk groups COMPACT.** Measured from the vendor CPS by
clearing one row and diffing the write against the restored state
(`~/Downloads/7x2_restoredalltg.txt` vs `7x2_onecleared.txt`, parse with
`tools/parse-serial-capture.mjs --writes`):

```
slot 500        TG0501 -> TG0502     500 records shifted down by one
slot 1008       TG1009 -> TG1010
slot 1009       TG1010 -> (empty)    the LAST slot is freed, not the cleared one
locator[1009]   0x3f1  -> 0xffffffff
mask            slot 1009 becomes absent
```

The table always occupies 0..N-1 with no holes. **The locator is an identity
table because slot always equals position** — not a rule to preserve, a
consequence of the table being unable to have holes. `V = slot` is true and
vacuous, and the earlier hole test wrote a structure the radio cannot represent.

Records are now placed by POSITION and the identity apparatus built for the hole
model (`QuickContact.uid`, `talkgroupSlotByUid`, `resolveTalkgroupSlots`) is
gone — compaction needs none of it.

✅ **Reference renumbering implemented 2026-09-10** (`talkgroupRenumber.ts`).
`QuickContact.readSlot` records where each talk group was read from — used ONLY
to build `old -> new`, never to place a record, because compaction already
decides placement. `d890RenumberedChannels` applies it at every write call site,
including the dry run, so a dry run cannot test a different write from the one
the button sends.

Two things reference a talk group by slot and both now move with it: a channel's
TX contact (`contactId`, 1-based, 0 = none) and a receive group's members (raw
0-based slots).

**Still refused, and both refusals are deliberate:**

- **A channel whose TX contact was deleted.** Clearing it to "none" changes what
  that channel transmits on air. The write refuses and names the channels so the
  user can retarget them.
- **A delete that would move a talk group a RECEIVE GROUP references.** Receive
  groups are not passed to the write plan at all (see the audit below), so we
  cannot fix them, and leaving them stale points them at the wrong talk groups.
  Wiring receive groups lifts this.

⚠️ **NOT ROUND-TRIPPED.** Renumbering is unit-tested only; no delete has been
written to a radio since it landed. The last one that was — before this existed
— left the radio reporting 1010 talk groups and crashing.

**Whether the CPS renumbers is UNKNOWN and the captures cannot say.** All 102
channels with a TX contact on this radio reference slot 0, and nothing
references at or above the shift point, so the CPS had no opportunity to show
us. Alex believes it does. Renumbering is correct either way: references are
slot-based and the table compacts. To settle it, point one channel at a talk
group above the one being cleared and capture again.

⚠️ Also seen in that capture pair, unrelated to talk groups: **the CPS wiped the
RX group reference on 68 channels** (`+0x1c`, `0x00`/`0x01` -> `0xff`). Consistent
with the vendor-CPS-destroys-settings warning above.

☐ **ADD is still unproven on hardware.** Unit-tested only, and it exercises a
path delete does not: the new slot was never read, so its record is BUILT rather
than patched, and the locator gains an entry rather than losing one.

### What is actually ready

> This section claimed "only channels has all four layers" and "41% of a full
> codeplug write" until 2026-09-09. Both were long dead: `planCodeplugWrite`
> wires every table, and the dry run reports the real figure.

A record encoder turns one record into bytes. A writable table also needs an
address function, mask recomputation, a frame plan, and to be **passed to
`planCodeplugWrite` from `buildD890CodeplugTables`** — that last step is the one
that keeps getting missed, and it fails silently: the edit is simply dropped and
the region goes out verbatim.

| Layer | Channels | Zones | Masked tables | Flat regions | The 6 new tables | Talk groups |
|---|---|---|---|---|---|---|
| Record encoder | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ |
| Address function | ☑ | ☑ by SLOT | ☑ from spec | ☑ fixed | ☑ | ⚠️ **flat, but the table is banked** |
| Mask recomputation | ☑ | ☑ | ☑ | n/a | ☑ | ☑ |
| Frame plan | ☑ | ☑ | ☑ | ☑ | ☑ | ☑ |
| **Passed from the store** | ☑ | ☑ | ☑ | ☑ | ☑ | ☐ **never passed** |
| **Verified on a radio** | ☑ | ☑ | partly | partly | ☑ 2026-09-09 | ☐ |

**By volume, a NeonPlug write now covers 102% of the vendor's own write set** —
136,912 bytes in 8,557 frames against the CPS's 134,224. Measured by the dry run
against a real codeplug, not estimated. We write slightly more because the
verbatim preserve pass carries regions the vendor's captured session happened not
to touch on that radio.

That 102% is REGION coverage, not proof. The Coverage table above splits it: what
is modelled and encoded, versus what merely rides through unchanged, versus the
33% that has a changed-field hardware round trip behind it.

**Scan lists, radio IDs, encryption keys, receive groups and quick messages**
were once in the same position as talk groups — editable in the UI and silently
discarded. All five are wired now, quick messages last (2026-09-11); see Tier 4
below. For talk groups, see the ⛔ section above.

The wire protocol is fully known from the vendor CPS's own programming session
(`~/Downloads/WriteTo7x2.txt`, parse with `tools/parse-serial-capture.mjs`):

```
PROGRAM  -> "QX" + ACK
02       -> "IDMR-7X2\0V100\0" + ACK
57 <addr:4 BE> 10 <16 data> <cksum> 06   x8389   -> radio replies 06
END      -> ACK
```

**Writes are always 16 bytes** — the CPS never negotiates a larger one the way
it does for reads, so a write puts 24 bytes on the wire per 16 stored. Its full
session is 134,224 bytes over 74 runs, about 20 s.

### Settled — moved out

Channel write, masks, the partial-write question, GPS roaming offsets, the master
radio ID, AM scan / A Channel, and the AM zone record and `CurWorkCH` are all
**closed** and now live in **[DA7X2-SETTLED.md](DA7X2-SETTLED.md)**, with the
reasoning that closed each one.

### 2. Encoders — REGION coverage is closed, FIELD coverage is not

**Every readable region but one now has a tested encoder** — `DA7X2-COVERAGE.md`
has the live count. The one that does not is deliberate and should stay that
way:

| Region | Why never |
|---|---|
| Local info | Device info block, and the read-length negotiation probe |

Two rows left this table in September 2026. **Device identity** was never a
region: it was the DMR contact database HEADER under a wrong label (see its note
in `recordLayout.ts`), and it is now written and round-tripped with the
database. The **Digital Contact List** got its own write path — the Contacts
tab, with progress and cancel, never part of a codeplug write — and
round-tripped on hardware at 133,699 contacts on 2026-09-11.

Everything else a codeplug read produces can now be encoded back, each held to
the same two tests: `parse -> encode` reproduces real vendor bytes exactly, and
a one-field change moves only that field's bytes.

> ⚠️ **"Every region has an encoder" is not "every field is written."** A
> three-agent audit on 2026-09-02 found **16 channel fields that decode, appear
> in the UI, are editable — and are silently discarded on write.** The
> `OFF` table in `channelWrite.ts` has no entry for `0x10`, `0x12` or
> `0x35`-`0x3c` at all; the rest are bits masked out of a byte that IS written.
> Pinned by `tests/unit/d890ChannelFieldWrites.test.ts`, which fails if the list
> changes in either direction.
>
> - ☐ `customCtcssHz` (0x10) · `twoToneDecode` (0x12) · `aprsReportMode` (0x35) ·
>   `analogAprsPttMode` (0x36) · `digitalAprsPttMode` (0x37) ·
>   `digitalAprsReportChannel` (0x38) · `offsetFrequencyEx` (0x39) ·
>   `normalEmergencyCode` (0x3a) · `analogAprsTxPath` (0x3c) — mechanical, just
>   need `OFF` entries.
> - ☐ **`compander` and `encryption` are live UI checkboxes that do nothing.**
>   Masked out of `FLAGS34_WRITABLE` / `FLAGS21_WRITABLE`, along with `idleTx`
>   and `dataAckDisable`.
> - ☐ `smsConfirmation` / `analogAprsMute` / `sendTalkerAlias` (0x3b) — **do not
>   write yet.** The decoder itself flags two as reading the wrong bit or
>   mislabelled, and the byte shares space with five unmodelled bits including
>   `ex_emg_kind`. Confirm on hardware first.

### 2a. Other gaps the 2026-09-02 audit found

- ☐ **APRS settings cannot be written.** `aprsToRadioSpecific` folds them into
  the settings list on read and has no inverse, so there is nothing to encode
  from. `writeRadioSettings` now REFUSES them by name rather than dropping them
  silently — building the inverse is the fix.
- ☑ **FM broadcast `scanAdd` — DONE 2026-09-03.** Read from `0x3402050` since
  the driver started, never written, and the address sits inside the verbatim
  preserve run at `0x3402000` — so an edit was actively overwritten with its
  pre-edit bytes on every write. Now encoded (`encodeBroadcastScanMask`),
  planned explicitly so the verbatim pass cannot clobber it, and the Scan column
  is a checkbox rather than a read-only label.
  Flat, one bit per channel INDEX — deliberately unlike AM's per-zone bitmap
  over member positions, which is why FM's belongs as a column and AM's does
  not. ☐ Not yet hardware-verified.
- ☐ **`applyRoamingZoneToRecord` is a genuine orphan** — encoder and tests
  exist, nothing calls it. Would also need its own planner: the read has no
  presence mask and guesses the table end.
- ☐ **Blocked vs flat addressing.** `planMaskedTableWrite` / `planSpanTableWrite`
  do flat `base + index * stride`, but scan lists and talkgroups are banked. Scan
  lists >= 32 and talkgroups >= 1250 cannot be written at all, and the refusal
  names the wrong cause. `D890_MASKED_TABLES` has no way to express a blocked
  stride.
- ☐ **Member capacity off-by-one.** Scan lists decode 50 members but
  `writeU16Members` throws at >= 50; AM zones are 47 vs 46. A maximally-full list
  read off a radio makes an untouched codeplug **unwritable**. Loud, not
  corrupting.
- ☐ **Talkgroup call type is decoded to a STRING** in `Contact.remark`, so there
  is no numeric field to encode from. `applyContactToRecord` drops it and is
  itself uncalled.
- ☐ **Deletion has no encoder** for GPS roaming, encryption keys or SMS — all
  read as compacted present-only lists, with nothing to clear a vanished slot.
  Channels and zones have explicit cleared-slot handling; these do not.
- ☐ **Satellite encode/decode do not share a type**, and `encodeSatelliteSlot`
  builds a fresh zeroed slot rather than patching — a read->write round trip
  would zero every satellite's tone configuration. Not wired, so latent.

**14 regions have no encoder because they have no PARSER** — they are not read
yet, so there is nothing to invert. Each is blocked on a capture, not effort:

> DTMF · MDC1200 + contacts · analog/DTMF address book + its masks · hot keys ·
> auto-repeater offsets · SMS-associated block · AM airband VFO · zone roam
> mask · master radio ID

Two notes on evidence quality, said out loud because they matter on a write path:

- **Satellites are a self-consistency round trip only.** The table does not
  appear in the vendor's codeplug write, so there are no captured bytes to
  compare against. It proves encode and decode are inverses of each other, NOT
  that either matches what the radio expects — a matched pair of wrong functions
  round-trips perfectly.
- **Pictures now have captured bytes.** `7x2_bootreadand2xwrite.txt` (2026-09-03)
  is the vendor CPS writing a boot image twice: 2,560 ordinary 16-byte frames
  covering exactly 40,960 bytes at `0x3f80000`, no header, no trailer, **no
  erase step**, nothing else touched in the session, and the two passes
  byte-identical. Column-major pixel order is confirmed from the same bytes —
  mean neighbour delta 9.2 along a column-major row against 49.7 down a
  row-major column. `writeImage` sends exactly that frame shape. **All three are
  hardware-confirmed** (2026-09-03) — each rendered on the radio's screen as the
  intended picture, taking Extra HW round-trip 0/5 → 3/5.
  - ☑ bk2's address `0x4080000` was marshaller-only; a NeonPlug write landed
    there and displayed, promoting it to hardware.
  - ☑ `standbyBkPicture` (settings `0x0c1`) labelled from the existing CPS sweep
    rather than new hardware time: `diffs.md` has rdt `0x011a6`, Default →
    Custom2 writing `00` → `02`, VERIFIED. Index 1 was never observed, so
    `Custom1` is by elimination — the only part of that row not swept.
- **AM zones** are round-tripped through a record built to the parser's own
  rules, because the captured codeplug had no AM zones.

### 5. Verification protocol — it cannot be done in-session

- ☐ Read-back must be **cross-session**: comparing during a write session
  compares against pre-write contents and passes while proving nothing. And a
  read mid-write reboots the radio.
- ☐ Sequence: write -> `END` -> wait ~1 min for the radio to commit -> reconnect
  -> read -> diff. NeonPlug must **not** do this automatically after every write.
- ☑ Dry-run view landed (Diagnostics -> "Write dry run — plan vs read"). Plans
  through the SAME `planCodeplug` the Write button uses, validates every frame
  through `dryRunWrite` (checksum + address guards), and diffs against the read
  log. On an unmodified codeplug it must report **0 differing bytes**; it did, on
  real hardware, across 8,635 frames.
- ☑ The confirmation dialog now plans the real write. It called
  `planChannelWrite` while the button called `writeCodeplug` — understating what
  would be sent by 8.7x — and derived "channels changing" from every channel in
  the plan, so it announced "120 channels changing" for a write that changed
  nothing. Both now come from `planCodeplug` + `diffPlanAgainstRead`, the same
  source of truth as the dry run, so the two cannot disagree.

### 5a. What the verified writes do NOT prove

Both hardware writes were **no-ops or near-no-ops**. Encoders patch rather than
rebuild, so a field the encoder never writes matches trivially in BOTH the
round-trip test and the dry run. A clean result means *"a write will not damage
this codeplug"* — never *"an edit to field X reaches the radio"*.

To prove a field is written, mutate it and assert the bytes MOVED —
`tests/unit/d890ChannelFieldWrites.test.ts` does exactly this and pins the known
gaps, so implementing one fails the test until it is removed from the list.

### Rules that are settled — do not relitigate

- **No retry, ever.** A write the radio does not ACK means the session is in an
  unknown state and the radio may be rebooting. Fail, and do not send `END`.
- **Never write a 16-byte unit that was not just read back.** Most fields are
  1-4 bytes, so every write touches bytes we did not set.
- **Encryption: a key's TYPE is never changed.** Create or delete a key instead.
- The only forbidden addresses are `+0x3fbf0` / `+0x3fff0` per
  `D890_FLASH_MARKER_STRIDE`. Sparse 16-byte writes are what the vendor does and
  what we do; there is no write-staging layer to build.

---

## Hardware round-trip tests

**→ [HW-ROUNDTRIP-TESTS.md](HW-ROUNDTRIP-TESTS.md)** is the working list, and it
now also records what each completed round trip PROVED.

**Tier 1 is complete as of 2026-09-09** — all eight rows, in one session across
three writes, taking core round-trip coverage from 9 to 18 of 55. What remains is
Tier 2 (the zone roam mask, and the talk group locator once talk group writing
exists) and Tier 3 (the satellite table and the contact database).

The gap this closes is the one that matters: every region could already be read
and written, and almost none of it was proven to survive a CHANGED-FIELD trip.

## Hardware test list

**The protocol for every row is the same**, and the middle step is the one that
matters: read -> edit ONE thing -> **check the Write dialog names exactly that
and nothing else** -> write -> wait ~1 min -> read -> diff snapshots.

The dialog is the checkpoint. Three outcomes:

| Dialog says | Meaning |
|---|---|
| names your edit, nothing else | proceed |
| **"Nothing changes"** | the edit never reached the plan — a dead field or a broken wire. Do NOT write; report it. |
| refuses | a planning bug (duplicate address, width mismatch). Paste the message. |

> Diff snapshots from Chrome's console rather than by eye — `localStorage`
> `neonplug-codeplug-snapshots` holds every read and write. `sentVsLanded` empty
> plus `beforeVsAfter` showing only your edit is the pass condition. Comparing
> the write snapshot against the read-back is what caught the zone bug; the
> on-screen value alone would not have.

### Adding a record — what goes in the bytes nobody sets

**Settled 2026-09-03 from the vendor's own write capture**, after adding an AM
channel was refused with *"it was never read from the radio"*. Encoders patch,
which serves an edit and cannot serve an ADD: the read is mask-first, so an
unoccupied slot is never fetched and there is no original.

Two facts the capture establishes:

1. **The vendor never writes a blank slot** — 107 of 128 channel slots (sparse,
   21 skipped), 8 of 8 zones, 1 of 1 AM and FM. Occupied slots only. So there is
   no vendor blank to copy; a new record must be BUILT.
2. **The fill byte differs per table**, which is why `blankRecords.ts` holds one
   constant each rather than a shared zero buffer.

| record | vendor writes | blank | evidence |
|---|---|---|---|
| AM / FM channel | all `0x40` | all `0x00` | slot 0 is `10 80 00 00` + UTF-16LE name + zeros to `0x3f` — nothing else in the record |
| zone membership | all `0x200` | all `0xFF` | slot 0 is `00 00 ff ff ff…`; a zero fill would be channel index 0 repeated behind the terminator |
| zone name | only first `0x20` | `0x20` of `0x00` | vendor never touches `0x20-0x3f`; matches `ZONE_NAME_WRITE_BYTES` |
| AM zone | `0x80` | zeros + `0xFFFF` at `MEMBERS_AT` | layout covers all `0x80`: name `0x00-0x1f`, current `0x20-0x21`, members `0x22+` |
| **main channel** | `0x80` | **NONE — still refuses** | ~40% of the record is undecoded, and no capture anywhere contains an unused channel slot |

- ☐ **Main channel blank is still unknown.** Needs a diagnostic dump of a
  never-used slot — channel 201 at `0x1082400`, len `0x80` (and 501 at
  `0x1183a00` as a second sample, to tell a pattern from one slot's accident).
  Also worth dumping a DELETED slot — zone slot 3 at `0x2000400` — since adding
  into a previously-used slot is a real case and stale bytes may linger.
  Until then `planChannelWrite` refuses rather than guessing ~50 bytes.

### Tier 1 — destructive paths, still entirely unproven

A **presence mask bit that CHANGES** has never been written. Both hardware
writes so far rewrote masks identically. This is the path that can delete data.

- ☐ **Add a channel** to an empty slot. Mask bit 0 -> 1. Then delete it again.
- ☐ **Delete a channel** that no zone or scan list references.
- ☐ **Delete a channel that IS referenced** — the plan must REFUSE, naming the
  zone. If it silently clears the reference instead, stop.
- ☑ **Delete a zone** — verified 2026-09-03, mask bit cleared, survivors kept
  their slots. First changed mask bit this driver has written.
- ☐ **Add a zone.** The remaining half: it used to resolve to slot -1 and vanish
  with no record and no mask bit. Should now take the free slot 2.
- ☑ **Delete a zone — FIXED 2026-09-03 after failing on hardware.** Deleting
  Z2 from 8 zones wrote all seven survivors ONE SLOT DOWN (slots became 0-6).
  Names and members moved together so it looked correct, but `zoneSlots` was the
  positional array staged at READ time, and the slot-keyed A/B pointers stayed
  behind — three ended up past the end of their new zone. **Adding** a zone was
  worse: position 8 against 8 staged slots resolved to -1 and the zone was
  skipped silently, with no record and no mask bit. Fixed by staging
  `zoneSlotById` / `zoneCurrentById` at read time and resolving slots by
  identity (`resolveZoneSlots`), allocating the lowest free slot for a new zone.
  Pinned by `tests/unit/d890ZoneSlotResolve.test.ts`.
  > **Delete VERIFIED on hardware 2026-09-03** (read 07:00:37 -> write 07:01:05
  > -> read 07:02:08): Z4 Sparse removed from six zones, slots went
  > `[0,1,2,3,4,5,6]` -> `[0,1,3,4,5,6]`. The GAP at slot 2 is the proof —
  > positional mapping would have compacted to `[0,1,2,3,4,5]` and moved four
  > zones. 120 channels untouched.
  > **Still to verify: ADDING a zone.** That is the case that used to resolve to
  > slot -1 and vanish silently, and `resolveZoneSlots` should now hand it the
  > free slot 2.
- ☐ **Empty a zone completely.** `filteredZones` drops zones with no channels
  (`.filter(z => z.channels.length > 0)`), and `zoneSlots` is POSITIONAL — so a
  dropped zone almost certainly misaligns every later zone's slot. Predict a
  refusal or corruption; verify on a zone you can afford to lose.

### Tier 2 — regions reachable from the UI, one edit each

Each is a `hardwareRoundTrip` flag in `recordLayout.ts` waiting to be earned.
**Do not promote a flag on a write-back** — only on a changed field.

- ☑ Channels — name, 2026-09-03
- ☑ Zone membership — channel removed, 2026-09-03
- ☐ Channel, a NON-name field — colour code or RX frequency
- ☐ Zone name
- ☐ Zone hidden — **never tested at all.** `hiddenZoneSlots` used to be derived
  from nothing, so the checkbox did nothing. Reversible, and it exercises a
  mask bit that changes.
- ☐ Zone current channel A/B — **suspect.** Read is by POSITION, encode is by
  SLOT; `zoneCurrentChannelsBySlot` bridges them but has never run on hardware.
  Test with a zone that is NOT slot 0, and check a neighbouring zone too.
- ☐ FM broadcast channel — frequency
- ☐ AM airband channel — frequency
- ☐ AM zone — membership
- ☐ 5-Tone entry / 2-Tone entry
- ☐ GPS roaming geofence
- ☐ Roaming channel
- ☐ Power-on display text
- ☐ Settings — any non-APRS field. Goes through the buffered path
  (`writeRadioSettings` stages, `writeCodeplug` sends); **never exercised.**

### Tier 3 — expected to FAIL, and worth confirming cheaply

No write needed: edit, open the dialog, read it, cancel.

- ☐ **`compander`** — expect "Nothing changes". Confirms the dead-field bug and
  that the dialog detects it.
- ☐ **`encryption`** — same.
- ☐ **An APRS setting** — expect a REFUSAL naming the field. `aprsToRadioSpecific`
  is one-way, so there is nothing to encode from.

### Regions we do not decode — 9 left

> Regenerate with `node tools/d890-coverage.mjs`. This list went stale twice by
> being hand-kept, and the counts below are copied from that tool, not counted
> by hand.

**6 are ALREADY READ**, blind, by the preserve pass — every
`VENDOR_WRITE_RUN` nothing else has claimed. Adding a decoder does NOT add a
read: the decoder's read lands first and the preserve pass then skips that run,
so the bytes on the wire are identical either way. What changes is that they
stop being opaque. **Each of these needs a parser, not a hardware session.**

- ◐ `SMS-associated block` — **decoded 2026-09-07/08**: it is the SMS
  message-store index, and it is three pieces. Envelopes at `0x2980000` (16 B each, a NextIndex
  chain and a text-slot pointer), a byte-per-slot **valid table at `0x2980800`**
  (`00` present, `0xFF` free) and a **head byte at `0x2980880`**. Verified on the
  wire: chain `0→1→2→3→4→end` over exactly the five predefined messages
- ◐ `Analog / DTMF address book` — **format decoded 2026-09-07**, parser in
  `analogAddressBook.ts`; not wired to a read
- ◐ `Analog address book masks` — **decoded enough to warn**: it is one byte per
  slot, NOT a bitmask, and value-vs-index is still ambiguous
- ☑ `Auto-repeater offsets`
- ☑ `Hot key / one-key` — **fully decoded 2026-09-07/08.** Status messages
  (`0x3700100`, stride `0x40`, bitmask at `0x3701500`, **32 slots** per the CPS
  grid) and the hot keys themselves (`0x3701000`, stride `0x30`, **18 entries** =
  6 Hot Key + 12 Fun, confirmed against the CPS grid). Content field is an index
  into the predefined SMS table, confirmed: entry holds `0x03` and SMS index 3 is
  `Good bye!`, the string the grid shows. Parsers in `statusMessages.ts` and
  `hotKeys.ts`; neither is wired to a read yet
- ◐ `DTMF` — **decoded 2026-09-07**, and its size was wrong: `0x60` → `0x50`.
  Found a whole unclaimed region with it — the **DTMF encode list at
  `0x3500800`** (16 × 16 B), which was hiding inside a verbatim preserve run and
  is confirmed from the wire (`123123123` → `01 02 03 01 02 03 01 02 03 ff…`).
  Which UI label owns each timing byte is still open

> **These three were decoded with NO hardware time on 2026-09-07**, by diffing
> `7x2_missingdataread.txt` against `7x2_missingdataread_after.txt` — captures
> taken either side of a deliberate CPS edit and then left unused for four days.
> The lesson is worth keeping: the preserve pass already fetches these regions,
> so **any before/after capture pair is a decoding session that needs no radio.**
> ◐ means the bytes are understood but nothing reads them into a table yet, so
> `read` stays false in `recordLayout.ts` and the coverage numbers do not move.

**3 are genuinely not fetched.** These need new traffic:

- ☐ `MDC1200`
- ☐ `MDC1200 contacts`
- ☐ `Zone roam mask`

> ⚠️ That split is classified by the address DECLARED in `recordLayout.ts`, and
> for a few regions that differs from where the bytes actually sit — MDC1200's
> real span is `0x3703900`, not the declared `0x3703000`, so it shows in the
> wrong group. **The read log is ground truth; the tool is an approximation.**

**Done (3 of the original 11):** master radio ID, AM airband VFO, and
auto-repeater offsets — **all three now hardware round-tripped**. None needed a
new hardware read to start: the bytes were already in every read log we had, and
the vendor write capture supplied the layouts.

| region | written by NeonPlug and read back |
|---|---|
| Master radio ID | ID 776655 + Override flag; also verified in the vendor CPS |
| AM airband VFO | 108.015 -> 121.500 MHz (`12 15 00 00`), AM channel 1 untouched |
| Auto-repeater offsets | slot 0 5.0 -> 7.6 MHz (`c0 98 0b 00`), slot 1 untouched |

Both of the last two also confirmed their NEIGHBOURS were untouched, which is
what a rebuild-instead-of-patch bug would have disturbed.

### Tier 3a — UI gaps found 2026-09-03

- ☑ **AM/FM broadcast add, delete and edit — DONE 2026-09-03.**
  `BroadcastChannelsTable.tsx` was a read-only view; it now has an Add button
  (with an `n of max` counter, 256 AM / 100 FM), a per-row delete, and inline
  name and frequency editing.
  Three things worth keeping if this is ever refactored:
  - **Add takes the lowest FREE index, not `length`.** A record's address is
    derived from its index, so appending after a middle deletion would collide.
  - **Deleting an AM channel strips it from every AM zone.** Members are
    indices into this table, so a deleted channel would otherwise leave a
    dangling reference the radio follows — the same rule the main write applies
    to zone/scan-list refs.
  - **Mutations go through the STORE list, never the `entries` prop**, which is
    the search-filtered view; rebuilding from it would delete every row the
    filter happened to hide.
  Frequency is a text input, not `type=number`: a partly-typed `118.` is not a
  valid number and would be discarded mid-keystroke. Empty parses to `null` —
  the decoder's own "no usable frequency" — rather than inventing `0.0000`.
  **Delete COMPACTS the table** (`broadcastEdits.ts`), rather than leaving a gap.
  The indices are hardware slots, so this is only safe because the references
  move in the same step: AM zone `members` and `currentChannel` are both
  absolute indices into this table, and renumbering channels without them would
  leave every zone naming the station one slot along — silently, and
  indistinguishable from correct until someone listened. Eight tests in
  `d890BroadcastEdits.test.ts` cover it, including a zone pointing AT the
  deleted channel and a table that already had gaps.
  Rewriting the whole table is ~1.8 KB for a full airband list, which is nothing
  beside a 138 KB codeplug write — the reason not to compact was never cost.
  > **Not hardware-tested.** Add and delete both move a presence-mask bit, which
  > is the destructive path. The write side is already wired
  > (`amChannels`/`fmChannels`), so these edits WILL reach the radio.
  > A compacting delete also rewrites every record above the gap, so the write
  > dialog should name many AM channels — that is expected, not a bug.
- ☐ **AM zones cannot be edited by hand either** — same shape:
  `AmZonesEditor.tsx` exists, but `setTable('amZones', …)` is only called from
  the airport import.
- ☑ **Channel Wizard summary — FIXED 2026-09-03.** It was a fixed sentence
  ("Successfully generated N channels and M zones!") with the airband news
  appended, so a working import of 29 airband frequencies announced itself as
  "0 channels and 0 zones!". Now built from what actually happened: only
  non-zero categories are listed, the airband routing is a muted second line,
  and the skipped-zone warning reads `caps.maxAirbandZones` instead of a
  hardcoded 16.
- ~~The Channel Wizard summary misreports zones when they route to AM zones.~~
  On a radio with `separateAirbandTable`, `splitAirbandChannels` moves airband
  groups OUT of `result.zones` into `airbandZones`, so the summary's
  `zones: routed.zones.length` counts only the ordinary zones while the airband
  groups are reported separately as `amZones`. The numbers are individually
  right and read as wrong together. Check `SmartImportTab.tsx:435-441` against
  `AirportSource.tsx:180-186`.

### Tier 4 — encoders that exist but are NOT wired from the store

The write carries these verbatim, so they are preserved but not editable — and
the failure is SILENT: the UI accepts the edit and the plan drops it. Wiring is
the prerequisite, not a hardware session.

- ☑ **Status messages · hot keys · both address books · SMS store · DTMF** —
  wired 2026-09-09 and all six now have hardware round trips.
- ☑ **Talk groups** — wired with banking and the index base fixed 2026-09-09.
  EDIT round-tripped 2026-09-09, DELETE 2026-09-10. ADD is unit-tested only.
- ☑ **Scan lists · RX groups · radio IDs · encryption keys · quick messages** —
  ALL FIVE WIRED by 2026-09-11, quick messages last. The audit that follows is
  kept for its reasoning: as of 2026-09-10 all five had a working emitter in
  `planCodeplugWrite` and were editable in the UI, but **none was passed by
  `buildD890CodeplugTables`**, so every edit to any of them was silently
  discarded on write.

  Wiring is NOT the whole job, and the amount left differs per table. What
  decides it is whether the HARDWARE SLOT survives an edit — the talk group
  lesson, which cost 994 records and then a crashed radio:

  | Table | Emitter keys on | Does the slot survive? |
  |---|---|---|
  | Encryption keys | `(encryptionType, id)` | ✅ **WIRED 2026-09-10** — `id` IS the slot, the store never renumbers |
  | Radio IDs | `.index` | ✅ **WIRED 2026-09-10** — edit, add and delete; deletes leave a HOLE (measured) |
  | Scan lists | `list.slot` | ✅ **WIRED 2026-09-10** — edit and delete; add still refused (no record to patch) |
  | RX groups | `.index` | ✅ **WIRED 2026-09-10** — `deleteGroup` no longer reindexes; deletes leave a HOLE (measured) |
  | Quick messages | text slot | ✅ **WIRED 2026-09-11** — `QuickTextMessage.slot` carries the text slot past the store's renumbering. The texts and the SMS store chain are written TOGETHER (the chain is the list the radio shows), the reader follows the chain, deletes keep slots, and a delete that strands a hot key is refused |

  ☑ **Scan lists are wired (2026-09-10)** — edits only. The awkward one, for two
  reasons that both come from the shared `ScanList` being DM-32 shaped:

  1. **No slot.** `ScanListDecoded.slot` never left `radios/d890uv/`, so the slot
     died at the store boundary and a write would have placed every list after a
     gap into the wrong record. `ScanList.slot` now carries it, and the store's
     edit operations spread, so it survives a rename.
  2. **No home for the D890's own fields** — scan mode, priority select, the raw
     priority channels and the four timers, all of which
     `applyScanListToRecord` writes. Narrowing at read time loses more than the
     slot. So the DECODED record from `tables.scanListsDetailed` is the base and
     only what the UI can actually edit — name and channels — is overlaid onto
     it, matched by slot. The overlay is explicit rather than a spread, so the
     boundary of "what the UI may edit" is visible and the DM-32-shaped fields
     cannot leak into a record the D890 encoder reads.

  ☑ **Three more fields wired (2026-09-10)** — the overlay was name and channels
  only, so the other eight controls in the settings panel were editable and
  discarded. `Hang Time` was the worst of them: it DISPLAYED this radio's real
  dwell time, took an edit, and reverted. Three map onto fields the record has —
  `hangTime`→`dwellTime`, `priorityChannel1/2`→`priorityChannel1Raw/2Raw` — and
  are now written.

  Both directions had to move together. The read never populated
  `priority1Type`, so the UI showed "None" for a list whose record said channel
  60; wiring only the write would have cleared a real priority on the first
  save. `scanListPriority.ts` holds the codec (`0xffff` Off, `0x0000` Current,
  `n` channel n — note zero is a LIVE setting, not "unset") plus
  `narrowScanList`, lifted out of `readScanLists` so the lossy step can be
  tested without a radio. An absent UI value keeps the radio's value rather than
  encoding undefined as Off.

  The other five have no D890 equivalent, so the new `scanListFields` capability
  stops the panel offering them. Undefined ⇒ all of them, so the DM-32 is
  unchanged.

  ☑ **ADD WORKS (2026-09-10).** A scan list created in the vendor CPS and
  written to the radio (`7x2_slreadaddwrite.txt`) supplied the four fields that
  had no UI and no derivable value: look-back A **5**, look-back B **26**,
  dropout delay **31**, revert channel **4** (with dwell 32, scan mode 0). The
  same values sit in `SL Alpha`, the untouched list in this radio's first reads —
  they always WERE the defaults, and the earlier note calling them a sweep was
  wrong.

  The vendor put its new list into the slot a DELETE had emptied, so the same
  capture answers the erased-flash question too: `applyScanListToRecord` builds
  from `blankScanList()` when the original is wholly 0xFF. `tests/fixtures/
  d890uv/scanlist-vendor-new.bin` is the vendor's actual 512-byte record and the
  test asserts ours is BYTE-IDENTICAL to it — not that the encoder round-trips,
  but that our bytes are the vendor's bytes.

  Two defaults are counter-intuitive and are taken verbatim: the member array is
  0xFF-filled while everything from 0x98 is zero, and **byte 0x01 defaults to 3
  with BOTH priority channels Off**.

  ❓ **Byte 0x01 (`prioritySelect`) remains unknown and unwritten.** It was
  briefly recorded as gating the priority channels and a commit derived it from
  them; that was a misread of the radio's menu and is retracted. Priority 2 is
  ON with the byte at 1, so it does NOT gate — and the vendor's own default is 3
  with both priorities off, which rules out "in use" bits from the other
  direction.

  ☑ **DMR radio IDs are wired (2026-09-10)** — edits and adds. `index` IS the
  hardware slot: `readDMRRadioIDs` walks the presence mask and hands each
  occupied slot to `parseRadioId`, and the store renumbers on neither add nor
  delete. Holes are honoured rather than packed down.

  The UI list still LOOKS compacted — a radio holding slots 0, 1 and 3 shows
  three rows — but nothing downstream uses the row position: every handler
  passes `radioId.index`, and `maskedTable` places at `index: list.slot` for scan
  lists. `lowestFreeSlot` (shared with scan lists) allocates an add, so a new ID
  fills slot 2 rather than colliding with slot 3 and leaving the hole forever.

  ✅ **CONFIRMED ON THE RADIO'S OWN SCREEN, 2026-09-10.** Slot 3 was renamed
  `RID Max` → `RID Zulu` and a new `RID Hole` / 222 written into the slot 2 hole,
  in one whole-codeplug write (84 bytes changed of 22,051 frames). **The radio
  menu then showed four IDs with `RID Zulu` LAST** — so records do not compact,
  an add reuses the hole, and a record built from erased flash is valid provided
  its unmodelled tail is zeroed the way every vendor write does. Established by
  the radio's own menu, not by reading back what we sent. Detail and the three
  bugs the plan-vs-read diff caught first: `D890UV-HARDWARE-CHECKLIST.md`.

  ✅ **DELETE LEAVES A HOLE — measured 2026-09-10**, from a vendor CPS delete
  captured either side (`7x2_predelete.txt` / `7x2_postdelete.txt`, read
  direction). Deleting radio ID slot 2 of 0-3 left the read fetching
  `0x3680000` (slots 0-1) and `0x36800c0` (slot 3) — nothing shifted. Scan lists
  behave identically: deleting slot 0 of {0,1} left the read fetching
  `0x2100200` alone. Same as zones, and UNLIKE talk groups, which compact.

  Because slots do not move, a delete needs no reference renumbering. It did
  need the dangling-reference gate to stop being count-based: with slots
  {0,1,3} a count of 3 called a channel referencing slot 3 out of range and
  refused a valid write. `findDanglingReferences` now takes an optional
  `occupiedSlots` set per table and prefers it. Talk groups deliberately do NOT
  supply one — they compact, so their count and slot set agree.

  Fixed on the way: `handleAddRadioId` assigned `radioIds.length` as the new
  index — a POSITION. On a radio with slots 0, 1 and 3 occupied that is 3, which
  overwrites the ID already there. It now takes the lowest free slot.

  ☑ **Encryption keys are wired (2026-09-10)** — the only one that needed no
  slot map and no refusal. Edits, adds and deletes all work: a deleted key is
  written back as an EMPTY record, because emitting only the survivors leaves
  the removed key exactly where it was and the deletion silently does not
  happen. `entryNumber` is a list position and is not used to place anything —
  slot 1 exists in three tables at once. Type changes are refused by
  `applyKeySlotToRecord` itself, as they always were.

  ⚠️ NOT round-tripped on hardware.

  The other four still need their slots carried the way `predefinedSms` and
  `readSlot` now do, and none should get add/delete until it is round-tripped —
  the talk group delete looked perfect on read-back and crashed the radio.

  ⚠️ Do not wire and write in the same sitting. Wire, dry-run, then verify one
  table at a time on a codeplug backed up in the CPS.
- ☑ **Talk group locator** (`talkgroupLocator.ts`) — wired 2026-09-10 and
  proven by the hole test the same day. `V` is the SLOT INDEX, measured.
- ☐ Roaming ZONES — encoder and tests exist, nothing calls it
- ☐ FM broadcast `scanAdd` — read, no encoder at all

### Tier 5 — offsets to confirm while the radio is in hand

- ☐ **`btPttHold` (0x0f0).** Read `255` in every read from 05:27 to 06:01 —
  including right after a full write that sent `255` — then `0` at 06:12, the
  one read following menu use. `max` is 1, so `255` was never legal, and the
  offset is `confidence: 'vendor-name'`, never confirmed. Toggle BT PTT Hold on
  the radio, read, see whether `0x0f0` moves: promote to `hardware`, or we have
  been mislabelling that byte.
- ☐ Anything else in `DA7X2-NEEDS-CONFIRMING.md` reachable from the radio's own
  menus — the same toggle-and-read method settles each.

## Settings vocabulary — a bug class, and the guards against it

Found and fixed 2026-09-08. Four settings fields shipped with **option lists
that could not represent the byte the radio holds**. Because the Settings
profile turns `max <= 1` into a CHECKBOX, three of them rendered as checkboxes
over non-boolean bytes — so saving *any* unrelated setting silently rewrote a
value the user never touched.

| field | declared | radio holds | outcome |
|---|---|---|---|
| `btPttHold` `0x0f0` | `max:1` Off/On | `0xFF` | demoted to an unmapped byte — offset itself unproven |
| `btOnOff` `0x0b1` | `max:1` Off/On | `0x02` | widened; the radio menu has **three** states (Off / On / KISS TNC) |
| `groupCallHoldTime` `0x019` | 32 entries, 0-based | `0x05`, and the CPS writes `0x20` | **1-based** — it showed `6s` for `5s` and could not show `Infinite` at all |
| `simpRepeaterVoiceEnable` `0x15d` | `max:1`, no list | — | widened; never persisted in any sweep |

Plus five `vendorName` annotations on unmapped bytes that carried **uncorrected**
marshaller addresses, each duplicating a name already correctly assigned 12 or
24 bytes later.

**The cause is structural, not carelessness.** Only 1 of the vendor CPS's 13
dialogs was ever swept, so many option lists were asserted from a marshaller
*name*. A name is not a decode.

### Three guards now stand against it

| test | what it catches |
|---|---|
| `d890SettingsVocabulary.test.ts` | any field whose declared range cannot represent the byte in the real radio dump |
| `d890SweepRanges.test.ts` | any field too narrow for a value the CPS is **known to write** — 153 VERIFIED sweep rows |
| `d890IniOptions.test.ts` | drift in the 12 option lists that are verbatim CPS vocabulary |

The second one earns its keep: the fixture dump is structurally blind to a field
whose byte never varies, which is exactly why `groupCallHoldTime` looked fine.
It has since caught **two** regressions — that shipped bug, and one introduced
from an external measurement (see below).

### Two inferences that looked sound and were not

Both cost real work; neither should be repeated.

1. **"The strings are absent from `english.ini`, so the list was invented."**
   False. The CPS *displays* `Slot 1` and `2.5K`, and neither string is in any
   language file — some option strings are generated rather than stored. Three
   lists were removed on this reasoning and restored.
2. **"A consecutive run of the right length in the ini is that control's list."**
   Also false. `simpRepeaterSlot` matched ini `29997-29999` — `Channel Slot` /
   `Slot1` / `Slot2`, exactly three, terminated by a dialog title — and the CPS
   shows `Slot 1` *with a space*. In a 1,899-key flat pool a coincidental run is
   entirely possible. Recorded as a known false positive in the fixture.

**Only positive evidence counts**, and a run match is evidence rather than proof.

### Still open in this class

- [ ] **Key functions: we offer 78, the CPS offers 61 (Short) / 57 (Long).**
  Our list starts identically and over-runs by 17. Fixing it properly means
  splitting Short from Long — the difference is exactly `Sub PTT`, `Alarm`,
  `Monitor`, `TBST Send`, the four that only make sense while a key is held.
- [ ] **`PF3 Long Key` is greyed out on this model**, and we offer it as freely
  settable. Same for `Simp Repearter VoiceEn` / `Slot` while `Simp Repearter` is
  `Off`. This is a bug of a kind not previously considered — **not a wrong
  range, a wrong availability**. Unknown whether the greying is driven by a
  readable byte or purely by CPS UI state.
- [x] ~~`Man Down` widened to a number field.~~ **Reverted 2026-09-08**: the
  radio menu offers exactly Off/On, so it is a genuine boolean and a
  radio-menu-only control. Its OFFSET is still unconfirmed — an attempt to move
  it from the menu left all 512 bytes identical, which is equally consistent with
  the setting never being applied.
- [ ] **`Select TX Contact`, `SMS Confirmation`, `GPS Template Information`** —
  absent from the CPS *and* not found on the radio menu, but the owner notes they
  may be in unopened submenus. **Unresolved, not absent.** Left widened, since a
  number field cannot corrupt a byte the way a checkbox can.
- [ ] **`Gps Mode` has 7 options including `All`.** We model `gps` at `0x028` as
  an Off/On checkbox with `hardware` confidence (observed 1→0 from the radio
  menu). If that is the same byte it is the `btOnOff` bug again; if not, we are
  missing `Gps Mode` entirely.

## Needs the radio

**2 open · 8 skipped** · 10 done — reasoning in `DA7X2-STATE-AND-GAPS.md`.


| | Item | What |
|---|---|---|
| ☐ | **2-Tone scaling** | Set one 2-Tone to a known frequency pair. Confirms tenths-of-a-hertz, currently inferred. |
| ☐ | **`DmrRasEn` + `RepIdLimit`** | Two settings with unattributed offsets. Toggle each, diff the settings block. |

## Needs a populated codeplug

Set **one** of each in the CPS, save as `.rdt` **and** write to the radio. Use
distinctive, non-round values so a wrong offset is obvious.

| | Set this | Unblocks |
|---|---|---|
| ☐ | One **DTMF** field changed | `0x3481e00` — 13 vendor field names, no offsets |
| ☐ | One **auto-repeater offset** (e.g. 7.600 MHz) | `0x3483200` — geometry confirmed, encoding not |
| ☐ | One **hot key** (not a default) | `0x3700000` |
| ☐ | Two **status messages** | `0x3700100` — two are needed to get a stride |
| ☐ | One **AM zone member with scan on** | The AM per-channel scan flag |
| ☐ | Two **linked scan groups** on one channel | `channel_ScanList2` — no address known |
| ☐ | One **analog address book** entry | `0x3801000` |
| ☐ | One **MDC1200** contact | `0x3702000`, `0x4a00000` |
| ☐ | A **distinct non-zero value** in each control feeding the 14 unnamed settings bytes | Their width and which control owns which array slot. All read zero today, and nothing can be inferred from a zero. |

The last three need a **region hunt** as well — no address known, so a
before/after diff is what finds them.

## Still unverified

- `radioBusy` disabling other radio actions while one is running — the only thing
  built today that has not been seen working

---

## Not doing

- **NXDN** — needs alternative firmware. See `DA7X2-NXDN-NOTES.md`.
- **Recordings** — audio capture, large transfers, nothing mapped.
- **Zone hide bulk dialog** (`Tool > Zone Hide Operation`) — the per-zone control is done.

## Skipped, pending evidence

`zone roam mask` · `MDC1200` · `hot key` · `analog address book` ·
`auto-repeater offsets` · `SMS-associated block` · `DTMF` · the last 12
`vendorField` tags.

Each is blocked on a capture or a populated example rather than on effort;
reasons are in `DA7X2-STATE-AND-GAPS.md`.
