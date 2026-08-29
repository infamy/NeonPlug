# DA-7X2 / AT-D890UV — hardware verification checklist

## ✅ Session 1 results — 2026-08-25, real DA-7X2

Prototyped over pyserial rather than the browser (far faster to iterate); the
findings are folded back into `src/radios/d890uv/`. Radio state during capture:
8 channels, 1 zone, 1 scan list, 1 talkgroup, 1 radio ID, no tones active.

**Confirmed exactly as documented:**

| Item | Result |
|---|---|
| Transport | STM32 CDC (`0x0483:0x5740`) — *not* an FTDI cable |
| Baud | **921600** |
| Enter programming mode | `PROGRAM` → `51 58 06` (`"QX"` + ACK) |
| Identify | `0x02` → `ID890UV` / `V100` — the BTECH rebrand reports the Anytone string, so no new ID needed |
| Read framing | `'R'`+BE32+len → `'W'`+echo+payload+checksum+`0x06`, **checksum formula correct** |
| Read sizes | `0x10`, `0x20`, `0x40`, `0x80`, `0xf0` all valid and consistent |
| `END` | → `0x06` |
| Name encoding | **UTF-16 little-endian** (`5a 00 6f 00` = "Zone 1") |
| Frequency codec | BCD-as-hex ×10 Hz (`43 55 25 00` = 435.525 MHz) |
| Talkgroup bitmap | **INVERTED confirmed** — 1 talkgroup reads `0xfe`, not `0x01` |
| Zone / scan-list members | u16 LE, 0-based → 1-based; scan-list members at `0x30` |
| Talkgroup record | call type `0x00`, DMR ID BCD at `0x02`, UTF-16LE name at `0x06` |
| Scan-list timers | deciseconds, name at `0x0e` |

**Newly discovered (undocumented anywhere):**

- **Radio ID record layout** — DMR ID as BCD-as-hex at `0x00`, UTF-16LE name at
  `0x04`. Verified: `12 34 56 78` + `"My Radio"`. `readDMRRadioIDs()` can now be
  implemented.
- **Tone-kind gating lives in byte `0x09`** (bit 0 = RX tone active, bit 1 = TX).
  Every programmed channel carries a *leftover* CTCSS index (`0x15`) and DCS
  value (`0x13`) while `0x09` is `0x00`. Reading tone fields unconditionally
  flagged an unresolved tone on 100% of channels.
- **Custom CTCSS at `0x10`-`0x11`** appears to be tenths of Hz (`26 05` = 1318 =
  131.8 Hz).

**Three bugs this session found and fixed:**

1. `readExact` hung forever instead of timing out when a radio sends nothing
   (shared code — affected every radio).
2. `getRadioInfo()` returned the *wire* ID `ID890UV`, which is not a registered
   model ID, so `getCapabilitiesForModel()` missed and **every capability flag
   silently went unset**.
3. `decodeU16Members` read past the end of its buffer, where `readU16LE` returns
   0 — a valid channel index — manufacturing phantom members.

Fixtures captured to `tests/fixtures/d890uv/` and asserted by
`tests/unit/d890uvFixtures.test.ts`: the parsers are now tested against real
radio bytes, not the reference document.

### Still open after session 1

- **§6 CTCSS table** — no channel had a tone active, so no index→Hz pairs. Needs
  channels programmed with known tones.
- **§6b DCS** — same, plus the encoding is still undocumented.
- **§7 `0x04`-`0x07`** — read `00 01 00 00` on all four channels (constant), so
  offset-vs-TX-frequency is still unresolved; needs a repeater channel.
- **§7b scan-list member array length** — a real capture has `0xff00` exactly 100
  bytes into the member array. Either the array is 50 entries and something
  undocumented follows, or that value is meaningful. Filtered by plausibility
  for now.
- Byte `0x08` low bits read 0/1/2/3 across channels 1-4 — likely channel type;
  needs the OEM CPS to say what those four channels are.

---

Everything in `src/radios/d890uv/` is transcribed from
[codeplug-studio's reference docs](https://github.com/pskillen/codeplug-studio/tree/main/docs/reference/radios/anytone/at-d890uv)
and **has never touched a radio**. This file batches every open question into one
session so the radio only has to come out once.

Run order matters: §1 gates everything else. Nothing here writes to the radio.

Setup is the loop that settled the DM-32 scan-list format: `npm run dev`, connect
over Web Serial from Chrome, and keep the OEM CPS open on the same codeplug as
ground truth.

---

## 1. Identity — blocks all other work

The reference documents `ID890UV` / `V100` for the Anytone-branded AT-D890UV. **It
is unknown what a BTECH DA-7X2 or DA-7XR reports.** This string is what rejects a
wrong-model connection, so guessing it is not an option.

- [ ] Enter programming mode: send `PROGRAM` at 921600 baud, confirm reply is `QX` + `0x06`.
- [ ] Send `0x02`. Capture the **raw response bytes** (not just the decoded string).
- [ ] Record the model field (bytes 0–7) and version field (bytes 9–12) verbatim.
- [ ] Add the observed prefix to `D890_ID_PREFIXES` in `constants.ts`.
- [ ] Confirm `END` exits cleanly and the radio returns to normal operation.

If the reply is not `ID890UV`, **stop and report it** — a different ID may mean a
different firmware generation, and the memory map below may not apply.

---

## 2. Read-size negotiation

- [ ] Read `0x10` bytes from `LocalInfo` (`0x4f80000`). Record the bytes.
- [ ] Re-read the same address at `0xf0`, `0x80`, `0x40`, `0x20`.
- [ ] Confirm the first 16 bytes are identical at every size.
- [ ] Record the largest size that stays consistent — that becomes the cached read length.

If any size disagrees, the fallback to `0x10` is correct and should be kept.

---

## 3. Name encoding — endianness

`decodeWideCharString()` assumes UTF-16 **little-endian**; the reference says
"UTF-16/UTF-16LE" without committing. A wrong guess renders as CJK garbage, so it
fails loudly rather than silently.

- [ ] In the OEM CPS, set zone 1's name to a known ASCII string (e.g. `ZONETEST`).
- [ ] Write it to the radio with the OEM CPS.
- [ ] Read `0x3600000` (32 bytes) and confirm the byte pattern is `5A 00 4F 00 …`
      (LE) rather than `00 5A 00 4F …` (BE).
- [ ] Repeat for one channel name at `channelAddresses(0).secondary + 0x04`.

---

## 4. The limits the docs disagree on

Two conflicts were resolved by arithmetic, not by picking a side. Both want
confirmation, but the maths is unambiguous:

| Item | `limits.md` | region summary | bitmap arithmetic | in `constants.ts` |
|---|---|---|---|---|
| Zones | 250 | 32 | `0x20` × 8 = **256** slots | 250 (cap inside 256) |
| Talkgroups | 10,000 | ~4000 / 4096 | `0x4f0` × 8 = **10,112** | 10,000 |

- [ ] In the OEM CPS, try to create zone 251 and talkgroup 10,001. Record where it refuses.
- [ ] Confirm the zone bitmap at `0x3482c00` is 32 bytes and the talkgroup bitmap
      at `0x3980000` is `0x4f0` bytes.

---

## 5. The inverted talkgroup bitmap

Every other bitmap on this radio uses set = present. The talkgroup bitmap is
documented as **inverted** (set = empty). Getting it backwards yields either zero
contacts or ~10,000 phantom ones.

- [ ] With exactly 3 talkgroups programmed, read `0x3980000`.
- [ ] Confirm the first byte is `0xf8` (bits 0–2 clear = 3 occupied), **not** `0x07`.
- [ ] If it reads `0x07`, flip `D890_TALKGROUP_BITMAP_INVERTED` to `false`.

---

## 6. CTCSS tone table — the known gap

The D890 uses a **51-entry** tone table (index 51 = none). NeonPlug's shared
`CTCSS_FREQUENCIES` has **40** entries in a different order, so it cannot be
reused. **No tone table has been written** — inventing an ordering would silently
mis-program every channel.

`parseChannel()` *is* implemented and decodes everything else. It takes an
optional tone table: without one, tones read as None and the decode sets
`hasUnresolvedTone`, carrying the raw indices (`rxToneIndex` / `txToneIndex`)
alongside so nothing is lost. `readChannels()` deliberately refuses until the
table exists — a channel silently reading "no tone" when the radio has 100.0 Hz
set is wrong data the user could export to CSV. `readChannelsPreview()` is the
diagnostics path that does return it, gap and all.

Capturing the table is therefore a diff exercise:

- [ ] Program channels with CTCSS 67.0, 100.0, 141.3, and 254.1 Hz via the OEM CPS.
- [ ] Read each channel with **Diagnostics → Raw region dump → "Channel 1"**, or
      call `readChannelsPreview()` and read off `rxToneIndex`.
- [ ] Record index → Hz for each.
- [ ] Ideally sweep every tone the OEM CPS offers and dump the full 0–50 mapping.
- [ ] Add it to `constants.ts` as `D890_CTCSS_TONES` and pass it through
      `parseChannel`, then drop the guard in `readChannels()`.

### 6b. DCS — worse documented than CTCSS

Investigated 2026-08-25: the reference documents the DCS field *width* (u16 LE at
`0x0c`/`0x0e`) but **not** the encoding, **not** the polarity mechanism, and
**not** the tone-kind selector bits in `0x09`. It defers to anytone-cps source.

An early guess that NeonPlug's shared 104-entry `DCS_CODES` might map directly
does not survive contact with the docs — there is nothing to say whether the u16
is an index, the octal code as a number, or code-plus-polarity bits.

Because a DCS channel carries no CTCSS index, it would otherwise decode as a
plain no-tone channel. `parseChannel` therefore treats **any non-zero DCS value
as unresolved**, regardless of the CTCSS table.

- [ ] Program channels with DCS 023 N, 023 I, 754 N via the OEM CPS.
- [ ] Record the raw u16 at `0x0c` for each — that distinguishes index vs. octal
      vs. code+polarity in three samples.
- [ ] Record byte `0x09` for a CTCSS channel, a DCS channel and a no-tone channel
      to pin the tone-kind selector bits.
- [ ] Alternatively, read it out of anytone-cps / codeplug-studio source, which
      is faster than guessing and needs no radio.

---

## 7. Channel record spot-checks

With a channel programmed to known values (145.500 RX / 145.100 TX, 25 kHz, High
power, DMR, CC1, TS2, named `TESTCH`):

- [ ] `0x00–0x03` decodes to 145.5 via `decodeFrequencyMHz` (expect `14 55 00 00`).
- [ ] `0x04–0x07` holds the TX frequency or offset — **record which**. The docs say
      "offset / TX frequency" depending on the duplex bits; this ambiguity is
      unresolved and matters for every repeater channel.
- [ ] `0x08` bit-unpacks to duplex/bandwidth/power/type as documented.
- [ ] `0x20` = colour code, `0x43` = TX colour code, and they match.
- [ ] `0x21` bits give the expected time slot.
- [ ] Name is at `0x44` in the **combined** buffer, i.e. `+0x04` into the second half.
- [ ] Confirm channel 128 lives at `0x1080000`, not `0x1004000` — this is the block
      -stride assumption `channelAddresses()` encodes and the easiest thing to get wrong.

---

## 8. Write path — explicitly out of scope

No write support is implemented and none should be added until §1–§7 are green.
When it is:

- [ ] `0x2fa0010` must never be written (`D890_FORBIDDEN_WRITE_ADDRESS`).
- [ ] Writes are fixed at 16 bytes per frame; oversized writes desync the radio.
- [ ] `END` is sent **only** after a fully successful upload, so a failed write
      does not commit.
- [ ] Back up the codeplug with the OEM CPS before the first write attempt.

---

## Capture format

Dump raw bytes rather than decoded values — a decode bug looks identical to a
layout difference otherwise. Commit captures under `tests/fixtures/d890uv/` and
turn each one into a snapshot test, the same Layer-2 approach planned for the
DM-32.

**Use Diagnostics → Raw region dump.** Enable debug mode (About → Enable Debug
Mode), pick the 🐛 tab, and every region in this checklist is a preset. It
connects, reads, shows a hex dump, and offers Hex/Bin download; the filename
encodes the address so a saved fixture is self-describing. There is a custom
address/length option for anything not preset. The panel only ever reads.

Note the Diagnostics tab is now split: radios with DM-32-style clone blocks get
the existing block inspectors, and radios without them (anything where
`caps.supportsRawRegionDump` is set) get the generic tools instead of the
permanently-empty "No radio settings data available" state they used to land on.
