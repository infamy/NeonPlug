# NeonPlug — Claude Context

## What this is

A cyberpunk-themed radio CPS (Customer Programming Software) that runs **entirely in the browser** over **WebSerial/WebBluetooth** — no native app, no USB drivers, no backend. The user connects a handheld radio, clicks Read, edits channels/zones/contacts/settings, clicks Write.

Stack: **Vite + React 18 + TypeScript + Zustand + Tailwind**. Deployed to GitHub Pages via `build:single` — one self-contained HTML file. **Offline is a core design pillar, not a build variant:** the deployed page doubles as the downloadable offline app (startup screen and About tab both offer "Download offline version"), so users can program radios with no internet at all (field/emergency use).

**This is software that writes to physical hardware.** A bad write can brick or wipe a user's radio. That fact drives most of the rules below.

## Commands

```bash
npm run dev              # dev server on :5173 (strict port)
npm test                 # vitest watch
npm test -- --run        # one-shot (what CI runs)
npm test -- --run --coverage
npm run build            # tsc + vite build  (CI gate)
npm run build:single     # single-file offline HTML
npm run audit:prod       # prod-only advisories
```

**`npm run lint` works again** as of the ESLint 9 flat-config migration (PR #147, `eslint.config.js`; `.eslintrc.cjs` is gone). It currently reports ~120 findings (mostly `no-explicit-any` in the older debug files) — pre-existing debt now visible, being burned down. CI (`.github/workflows/ci.yml`) runs audit (non-blocking) → `npm test -- --run` → `npm run build`. **Lint is still not in CI** — don't add it until the findings hit zero.

Releases are cut from the Actions tab, not the CLI — see "Releases and versioning" below.

## Releases and versioning

> ⚠️ **Landed but never exercised — no release has ever been cut, so this path is unverified
> end-to-end.** Reviewed by three independent audits on 2026-08-06; every blocker and correctness
> finding they raised is fixed (see `TODO-RELEASE.md` for the list and the reasoning behind each).
> Use `dry_run` for the first attempt, and afterwards **confirm a Deploy run actually starts** — that
> one fix (B1) is the only one that can't be tested without a real release.
>
> Two things the workflow cannot check for you: `main`'s branch protection must permit the
> `github-actions[bot]` push (as of 2026-09-12 main has no branch protection or rulesets), and the
> offline-download links in README/About 404 until the first release exists.

Releases are **manual and deliberate** — Actions → *Release* → leave the version empty (the workflow
works out the next `YEAR.MONTH.N` from the tags) or type one to override, optionally tick `dry_run`
first. `.github/workflows/release.yml` runs tests + `npm run build` (**this is the test gate deploy.yml
never had**), bumps `package.json`, generates notes via GitHub's `releases/generate-notes` API,
prepends them to `CHANGELOG.md`, runs the tests again on that content, commits
`chore(release): vYEAR.MONTH.N`, tags and pushes, **then builds `build:single` with `VITE_RELEASE=1`**,
and publishes the release with two assets: `neonplug-vYEAR.MONTH.N.html` and `neonplug-latest.html`.

The artifact is built *after* the commit, tag and push, so the commit it stamps is the one the tag
points at (`TODO-RELEASE.md` R4, fixed), and the tests run a second time after the CHANGELOG rewrite
because `CHANGELOG.md` is bundled into the app (R5, fixed).

`neonplug-latest.html` exists so `/releases/latest/download/neonplug-latest.html` is a permanent URL —
it's what the README and the About tab's offline download point at. Don't rename it.

**What the site serves** (`deploy.yml` reassembles the whole tree every run — `deploy-pages` replaces
the site wholesale):

| Path | Contents |
|---|---|
| `/` | the **latest release asset**, downloaded not rebuilt — falls back to `main` until the first tag |
| `/dev/` | latest `main` |
| `/test/<branch>/` | every open PR |
| `/rptrs.json`, `/tafl_min.json`, `/airports_min.json`, `/radioid-users.csv` | always from `main` |

Two deliberate decisions there. **The root is the published artifact, not a rebuild of the tag** — for
software that writes to radios, the file users download offline and the file the site serves must be
byte-identical. **Datasets are not pinned to a release** — every loader tries
`https://neonplug.app/<file>` *first*, so this data is already "latest from main" by design; pinning
would freeze repeater/DMR-user data at tag time and add ~31 MB to every release.

**The dataset fallback chains are not symmetric** — `jsonLoader.ts` (`rptrs.json`, `tafl_min.json`,
`airports_min.json`) falls back through relative paths to `raw.githubusercontent.com` on `main`.
`ContactsTab.tsx` is the *only* loader for `radioid-users.csv` (16 MB, the largest) and has **no
GitHub fallback at all** — `neonplug.app` plus four relative paths, then it throws. Don't assume the
GitHub safety net covers contacts.

Because the absolute `neonplug.app` URL always wins, the per-PR and `/dev/` dataset copies are
**unreadable dead weight** (~31 MB each, against Pages' 1 GB site limit) — see `TODO-RELEASE.md` D4.

**Two independent version numbers — don't conflate them:**

- **App version** (`package.json` → `__APP_VERSION__` → `src/utils/version.ts`) is **`YEAR.MONTH.N`**
  (decided 2026-09-12): the UTC year and month a release was cut, and N counting that month's releases
  from 0, worked out by release.yml from the existing tags. Nothing compares app versions; they say
  which build and how old it is, and compatibility belongs to the format version below. Never
  zero-padded: npm rejects `2026.09.0`. `VERSION_LABEL` is `v2026.9.0` for release builds and
  `v2026.9.0-dev+abc1234` for everything else, keyed off `VITE_RELEASE`, which *only* release.yml
  sets. A user on `/dev/` must never look like they're on the tagged release. (Caveat: `-dev+` is
  semver-**backwards** — `2026.9.0-dev` is a *pre*release of `2026.9.0`, i.e. sorts *before* it.
  Cosmetic today because nothing parses the label; `TODO-RELEASE.md` V3.)
- **Codeplug format version** (`CODEPLUG_FORMAT_VERSION` in `services/codeplugExport.ts`), currently
  `1.1.0`, which added the optional `tables` field (main wrote `tables` files as plain
  `version: '1.1.0'` before `formatVersion` existed, so a reader at 1.0.0 would warn on all of
  them). Changes only when the `.neonplug` schema changes. `codeplugToJsonSafe` stamps
  `formatVersion` + `appVersion` + `appCommit` and **ignores any caller-supplied version** — four call
  sites used to hardcode `'1.0.0'`, so the writer is now the only authority. Reads accept older and
  same-major files (missing version ⇒ legacy `1.0.0`) and reject a **higher major** via
  `assertReadableFormat` rather than guessing at changed fields. When it first goes above 1.x, add a
  `migrations[from→to]` chain instead of widening the `??` defaults.

  **Newer-than-us files:** a newer **minor** warns and offers an explicit override ("Open anyway"); a
  newer **major** is a hard reject with no override. The split is deliberate — the data loss happens
  on *save*, not load, so viewing a newer-minor file is harmless and the user can consent to losing
  the fields they can't see; a major bump means existing fields changed meaning, so nothing shown
  would be trustworthy. This matters more than it looks: `/` and `/dev/` are the **same origin** and
  share the `neonplug-codeplug-snapshots` key, so format skew is reachable without exchanging files.

  Plumbing: `CodeplugFormatError.canOverride` → `readWithFormatOverride()` → `useConfirmDialog`, with
  the single warning string in `utils/codeplugFormatPrompt.ts`. All three read paths (file import,
  toolbar restore, startup restore) must keep going through `readWithFormatOverride` so they can't
  drift. `getSnapshotData` rethrows format errors and returns `null` only for missing/undecodable
  entries — don't restore the old blanket `catch { return null }`, it made Restore a dead button.

`CHANGELOG.md` is bundled into the app (`?raw`) and rendered in About → *What's New* by
`utils/changelog.ts`, so release notes travel with the offline build. **It is therefore a build
dependency — it must be committed, or `tsc`/`vite build`/`vitest` all fail on a fresh clone.**
The parser only understands the shape release.yml writes; if you change one, change the other.
`tests/unit/changelog.test.ts` pins the *parser*, but its sample is a hand-written mirror of the
workflow's output — editing release.yml's `sed`/`printf` will not fail any test.

## Golden rules

1. **Never claim a protocol change works.** Anything touching `src/radios/**` read/write paths can only be verified on real hardware. Say "needs hardware verification" and mean it. Unit tests cover encode/decode round-trips, not radio behaviour.
2. **Write paths are destructive by default.** Most of these radios are *clone* protocols: the app uploads a whole memory image. If the image isn't seeded from the last read, everything outside the region you touched gets zeroed. See "Write-path invariants".
3. **Never gate UI on a model string.** Use capabilities. `if (model === 'DM-32UV')` in a component is a bug; `caps.supportsZones` is correct.
4. **Adding a radio has a written procedure** — `ADDING_A_RADIO.md`. Follow it rather than improvising; it exists because the first three radios each got it wrong differently.
5. Prefer theme tokens (`neon-cyan`, `cool-gray`, `deep-gray`, `dark-charcoal`) and the semantic classes in `src/styles/globals.css` (`text-muted`, `border-panel`, `bg-panel`) over raw Tailwind grays.
   Controls take their **look** from `src/components/ui/controlStyles.ts` — `FIELD`, `FIELD_INLINE`, `FIELD_CAUTION` for inputs and selects, `BUTTON.<role>` for raw buttons, `<Button variant size>` for the shared component — and keep their **size** (padding, text size, width, height) at the call site, because dense tables, toolbars and dialogs are sized on purpose. Don't hand-write a new colour/hover/focus set, and don't pass padding to `<Button>` without `size="none"`: two padding classes on one element resolve by stylesheet order, not class order.
6. **Never trade away the single-file offline build.** The deployed Pages build *is* the offline app — do not propose switching Pages to a chunked/code-split build, adding a required backend, CDN assets, or anything else that breaks "save one HTML file, program radios with no internet." Lazy-loading/`manualChunks` wins being dev-mode-only is an accepted trade-off (decided 2026-08).

## Supported radios (all registered in `src/radios/index.ts`)

| Descriptor | Model IDs | Class | Notes |
|---|---|---|---|
| `DM32UV_DESCRIPTOR` | `DM-32UV`, `DP570UV` | Digital (DMR) | 4000 ch, zones, contacts, scan lists, bulk block read |
| `UV5RMINI_DESCRIPTOR` | `UV5R-Mini` | Analog | 999 ch, no zones/contacts, **BLE + serial** |
| `FT65_DESCRIPTOR` | `FT-65` | Analog | Yaesu SCU-35 clone protocol, 200 ch |
| `FT4_DESCRIPTOR` | `FT-4` | Analog | same family |
| `FT25R_DESCRIPTOR` | `FT-25R` | Analog | same family |
| `D890UV_DESCRIPTOR` (BTECH) | `DA-7X2`, `DA-7XR` | Digital (DMR) | **ALPHA — reads and writes.** Sparse 32-bit address space, not a clone image. 4000 ch, banked talkgroups, 921600 baud. |
| `D890UV_ANYTONE_DESCRIPTOR` | `AT-D890UV` | Digital (DMR) | **ALPHA.** The same radio and the same driver, under Anytone's name — two picker entries so nobody has to recognise the other vendor's label. |

FT-70D support exists on the **`feat/ft70` branch only** — not merged to `main`.
DA-7X2 support exists on the **`feat/da7x2` branch only** and is **ALPHA**. It
was read-only by design until 2026-09; it now reads and writes the whole
codeplug, and the picker says ALPHA where the radio is chosen.

**What "alpha" means here, precisely.** Every region is read and re-encoded, and
a write puts back everything it read — regions this driver models are patched
from the read's own bytes, the rest go back verbatim. Most regions have earned a
hardware round trip (write a change, read it back in a SEPARATE session, confirm
in the vendor CPS); the rest have not, and `DA7X2-COVERAGE.md` is generated from
the flags in `recordLayout.ts` so it cannot drift from the code. Adding a channel
works as of 2026-09-11 and is hardware-proven, including repeater offsets.
Untested regions are not the hazard they sound like — untouched, they are
written back byte-identical, and the write dialog names every region that
changes plus every byte that is new.

### The DA-7X2 is a different shape from every other radio here

Not a clone protocol. Memory is a sparse 32-bit address space read region by
region (`0x1000000` channels, `0x2000000` zones, `0x3500000` settings, …), so the
DM-32's block/metadata machinery has nothing to say about it — which is why it
has its own Diagnostics panels (`RecordLayoutPanel`) rather than sharing the
clone-block ones.

Its byte maps come from **two independent sources that agree**: six purpose-built
`.rdt` codeplugs written through the vendor CPS and diffed against read-only
dumps, and static traces of the vendor CPS's own marshallers. Where they
disagree, hardware wins and the disagreement is recorded — see
`DA7X2-WHATS-UNKNOWN.md` §1 for the two cases.

**Provenance is a first-class field, not a comment.** `recordLayout.ts`,
`extraChannelColumns.ts` and `settingsMap.ts` each tag every entry, and the UI
marks anything that is not hardware-confirmed. Do not promote an entry to
`hardware` without an actual capture; `DA7X2-NEEDS-CONFIRMING.md` is the list of
what would settle each one.

## Architecture

```
src/
  App.tsx                  # Root: tabs (lazy-loaded), store wiring, logger init
  radios/
    index.ts               # RADIO_DESCRIPTORS — the single registration point
    types.ts               # RadioDescriptor
    capabilities.ts        # getCapabilitiesForModel(model) — built from descriptors
    shared/
      BaseProtocols.ts     # BaseAnalogProtocol / BaseDigitalProtocol
      BaseSerialConnection.ts
      serialPort.ts
    dm32uv/                # protocol.ts (~3.8k), structures.ts (~3.8k), memory.ts,
                           #   connection.ts, constants.ts, capabilities.ts,
                           #   descriptor.ts, settingsProfile.ts, types.ts
    uv5rmini/              # + bleConnection.ts, serialConnection.ts, channelFormat.ts
    ft65/                  # + settingsFormat.ts (shared by FT-65/FT-4/FT-25R)
  types/
    radio.ts               # AnalogRadioProtocol ⊂ DigitalRadioProtocol ⊂ DM32Protocol
    radioCapabilities.ts   # RadioCapabilities — the feature-flag contract
    settingsProfile.ts     # Declarative Settings-tab schema
  hooks/
    useRadioConnection.ts  # THE connection state machine (read/write orchestration)
    useRadioCapabilities.ts  # → { caps, model }
    useImportStores.ts, useAlert.ts, useLocationState.ts, useEffectiveRadioModel.ts
  store/                   # 16 Zustand stores; radioStore holds connection + caches
  components/              # layout, channels, zones, scanlists, contacts, digital,
                           #   settings/, import/sources/, diagnostics, about, ui
  services/                # csv/, validation/, *Channels.ts importers, codeplug*.ts
  models/                  # Channel, Zone, Contact, RadioSettings, …
  data/                    # static airport/TAFL/repeater/fixed-channel datasets
  utils/                   # helpers + protocolLogger
```

### The four registries (all derived from descriptors — never hand-maintain a second list)

A radio is registered **once** in `RADIO_DESCRIPTORS`, and these all fall out of it:

- `createProtocolForModel(model)` → protocol instance
- `getCapabilitiesForModel(model)` → `RadioCapabilities`
- `getRadioPickerOptions()` → "Pick a radio" modal entries
- `getSettingsProfileForModel(model)` → Settings-tab schema (`src/data/settingsProfiles/index.ts`)

If you find yourself adding a `switch (model)` anywhere, the answer is a descriptor/capability field instead.

### Protocol hierarchy

`AnalogRadioProtocol` (channels + settings) ⊂ `DigitalRadioProtocol` (+ zones, contacts, scan lists, DMR IDs) ⊂ `DM32Protocol` (+ bulk read, boot image, RX groups, quick messages, calibration, encryption, emergencies, raw diagnostic maps).

Extend `BaseAnalogProtocol` or `BaseDigitalProtocol` from `radios/shared/BaseProtocols.ts` — they supply no-op stubs so you don't write 11 empty methods. `useRadioConnection` gates DMR reads with `instanceof BaseDigitalProtocol` and DM-32 specifics with `instanceof DM32UVProtocol`, **not** with casts. There are only ~12 `as any` casts left in `src/` — don't add more.

### Write-path invariants (these were real, shipped bugs — don't regress them)

`useRadioConnection` creates a **fresh protocol instance per operation**, so any state the last read left on the old instance is gone. Therefore:

1. **Cache restore before write.** DM-32 → `restoreCacheFromStore(blockData, blockMetadata)` from `radioStore`. Clone radios (Yaesu/Baofeng) → `protocol.setMemoryImage(cachedMemoryImage.image)`. The cached image is **model-tagged**; never restore one radio's image into another.
2. **Buffered settings must be staged *before* `writeChannels`.** Protocols with `bufferedSettingsWrite === true` don't send settings themselves — they fold them into the memory image that `writeChannels` uploads. Calling `writeRadioSettings` after `writeChannels` silently discards them (and `clearChanges()` then lies about it).
3. **Disconnect on success, not just on error.** Leaving the port open+locked makes the *next* `port.open()` throw.
4. Channels outside the model's `bandLimits` are filtered before write, and zone/scan-list references to filtered-out channels are stripped — never write a reference to a non-existent channel.

## Patterns to follow

```ts
const { caps, model } = useRadioCapabilities();          // never useEffectiveRadioModel + getCapabilitiesForModel separately
const { channels, setChannels, zones, setZones } = useImportStores();  // every import source
const { alertOpen, alertMessage, showAlert, closeAlert } = useAlert('Import');
formatPlural(count, 'channel')                           // not `count !== 1 ? 's' : ''`
```

Import sources (`components/import/sources/*.tsx`) all render `<SelectAllButtons>` and use `selectionCardClass(isSelected)` from `utils/importHelpers.ts`.

**Settings change tracking** — `radioSettingsStore` keeps `originalSettings` plus `changedFields: Set<string>`. `updateSettings(patch)` deep-compares and adds/removes keys; `clearChanges()` advances the baseline. The write→edit→write flow depends on `clearChanges()` firing *only* after the bytes actually reached the radio.

**Settings UI is declarative.** Adding a settings field means editing that radio's `settingsProfile.ts` (sections → typed field descriptors: text/number/select/color/checkbox/range/bitfield), not writing JSX.

**CSV helpers** — `getValue/getBool/getFloat/getInt(headers, row, headerName)` in `services/csv/csvImporter.ts` match headers **partially and case-insensitively** (`h.includes(name)`), so `'id'` matches `'DMR ID'`. Intentional, but it has caused real shadowing bugs — check for a more specific header first when adding one.

**List stores** — `contactsStore`, `encryptionKeysStore`, `dmrRadioIdsStore`, `quickMessagesStore`, `calibrationStore` are byte-identical boilerplate. A `createListStore<T>()` factory is a standing TODO.

## DM-32UV protocol quirks

- `contactId` in the channel struct always parses as 0; the real TX contact ID lives in blocks 0x42/0x43.
- `pttIdDisplay` and `compander` each have **two copies** in the channel byte layout. They're not force-synced on write. **User decision: leave this alone until hardware-verified** (Diagnostics CPS mapping hints the 0x26 "dup" bit is canonical).
- `rxGroupListId` is masked to 6 bits on parse but not clamped on encode — silent truncation risk.
- DCS encoding uses BCD digit nibbles with 0x80 (normal) / 0xC0 (inverted) bases, per `DM32-Protocol-Spec/06-ENCODING.md`. Decode and encode were *both* wrong and mutually consistent for D0xx codes for a long time, which is why round-trip tests didn't catch it. Now covered over all 104 codes × both polarities — **if you touch the codec, keep those tests green.**
- `concatenateCachedBlocks` silently shifts data if a block is missing from cache (open TODO).
- **The calibration block (metadata 0x02) is never written.** `dm32uv/writeGuard.ts` checks every write in the connection's only two write methods, `writeMemory` and `writeMemoryBlock`, before a byte is sent. It refuses a write that overlaps a scanned calibration block, lands in the config memory without a block scan or at an address the scan did not report, or would tag a block 0x02; with no memory layout known, nothing is written. The codeplug, contact and boot-image writes also check all their blocks first, so a refusal never leaves a partial write. Never add a write path around those two methods.
- **Scan lists (fixed + hardware-verified 2026-08-07 via live CPS↔NeonPlug round-trips):**
  channel byte 0x19 stores the scan list ref in **bits 5-0** (1-indexed, 0=None) — the spec's
  "bits 5-2" is wrong. Membership is the `+0x1A` list only, **max 15**; scan entry `+0x0F` is
  a CPS bookkeeping slot that is NOT scanned — a channel written there vanishes from the list
  (the OEM CPS populates it and its Scan Numb counts it, which is why lists *looked* like they
  held 16). NeonPlug ignores it on read and writes 0. `+0x11`/`+0x13` are **Priority
  Channels 1/2, stored directly** (not "Designated TX -2"/"Pri2 -2"; designated TX's real
  offset is unknown and is not written) and **must be list members** — the radio discards
  non-member priorities. Hang time is **0.5s steps** (6 = 3.0s). Names are 11 bytes,
  unterminated when full. Details: `TODO-DM32-SPEC-AUDIT.md` items 31-35; fixtures in
  `tests/unit/scanLists.test.ts` are real radio/CPS bytes.

## Testing

~320 tests across 17 files in `tests/unit/`, all pure-function level: encode/decode (`structures.test.ts`), CSV import, validators, channel helpers, store logic, the six channel-source generators, FT-65/UV5R-Mini settings formats. Run `npm test -- --run` for exact counts rather than trusting a number written here.

Statement coverage is low (~20%) *by construction* — the two 3.8k-line DM-32 files are barely covered. The layer that is tested (validators, CSV, importers, store logic) sits at 75–100%. Don't chase the global number.

**Next milestone — Layer 2:** dump raw binary blocks from a connected radio via the Diagnostics tab → commit as fixtures under `tests/fixtures/dm32uv/` → snapshot-test the parsers. This is the prerequisite safety net before any `protocol.ts` / `structures.ts` refactor. **Don't refactor those two files before the fixtures exist.**

## Not implemented / known stubs

- Digital Emergency Systems — `parseDigitalEmergencies` returns empty (block structure unverified)
- Analog Emergency Systems — `parseAnalogEmergencies` returns `[]`
- VFO TX Contact write (read-only)
- Live repeater API — `services/repeaterFinder.ts` is a stub
- `digitalEmergencySystemId` channel byte offset and `standbyCharacterColor2` settings offset are hardcoded 0

## Known rough edges

- The two largest files by far are `radios/dm32uv/protocol.ts` (3,853) and `radios/dm32uv/structures.ts`
  (3,805) — barely covered by tests, and the reason the Layer-2 fixtures above must land before any
  refactor. `DiagnosticsTab.tsx` is **400 lines** and no longer a rough edge (it was ~3.8k; the split
  landed 2026-08-02 — this bullet claimed the old number until 2026-08-06).
- CI runs `npm audit` over dev deps too, so a dev-only advisory can redden the build; `audit:prod` exists for this.
- Several root docs are **untracked** (`TODO.md`, `TODO-RELEASE.md`, `ADDING_A_RADIO.md`,
  `DESKTOP_APP.md`, `IMPROVEMENTS.md`, `TODO-DM32-SPEC-AUDIT.md`) — real project docs that should be
  committed.

## Where to look things up

| Question | File |
|---|---|
| What is the DA-7X2's read/write coverage? | `tools/d890-coverage.mjs` — parses `recordLayout.ts` and splits **core** from **extra** (pictures, satellites, the DMR contact database). Do not hand-count or `grep -c`: prose in a `note:` mentioning a flag gets counted. |
| How do I read a vendor-CPS serial capture? | `tools/parse-serial-capture.mjs` — turns a CPS log into a memory map. **Use it rather than grep**: these logs run to hundreds of MB and grep treats them as binary, silently finding nothing. |
| How do I add a radio? | `ADDING_A_RADIO.md` (step-by-step + checklist + gotchas) |
| What is still unknown about the DA-7X2? | `DA7X2-WHATS-UNKNOWN.md` |
| What DA-7X2 fields are shown but unconfirmed? | `DA7X2-NEEDS-CONFIRMING.md` (grouped by how to confirm) |
| DA-7X2 hardware findings, in order | `D890UV-HARDWARE-CHECKLIST.md` |
| What's next / why is X like that? | `TODO.md` (bugs, tiers, protocol review items, radio-family roadmap) |
| How do I cut a release? | "Releases and versioning" above; `.github/workflows/release.yml` |
| Why can't I cut a release yet? | `TODO-RELEASE.md` — blockers from the 2026-08-06 three-agent audit |
| What shipped when? | `CHANGELOG.md` (generated — edit `## [Unreleased]`, not released sections) |
| DM-32 wire format | `DM32-Protocol-Spec/` — **gitignored, local only** (01-OVERVIEW → 06-ENCODING) |
| Contributor-facing setup, style | `CONTRIBUTING.md` |
| Colour palette rationale | `PLAN.md` (gitignored, local) |
| Deployment | `DEPLOY.md` (gitignored, local) |

Also gitignored/local-only: `READPLAN.md`, `SPECS.md`, `bugs/`, `coverage/`.

## Working preferences

- **Debug logging:** `localStorage.setItem('neonplug_log_level', 'debug' | 'verbose')` then reload. Logs flow through `utils/protocolLogger.ts` → `logStore` → Diagnostics tab.
- Report test results honestly, including counts and failures. Don't say "verified" for anything that needs a radio plugged in.
- When a change is protocol-adjacent, state explicitly which radios it affects and which it can't be tested on.

---

*Keeping this file honest: it went stale once (claimed 2 radios and 250 tests when there were 5 models and 320+). Prefer capability names, file paths, and invariants — which change slowly — over counts. When you do refresh it, re-derive the numbers from `npm test -- --run` and `src/radios/index.ts` rather than editing them by hand.*
