# NeonPlug — UI improvements backlog

A running list, not a plan. Items get added as they are noticed and are picked up
when there is time; nothing here blocks protocol work.

Ordered roughly by how often it bites someone, not by effort.

---

## U1. Talk group list is unusable at real sizes — **worst offender**

`src/components/digital/DigitalTab.tsx` (904 lines) renders every talk group as a
plain row. On a codeplug with **1010 talk groups** that is 1010 DOM rows with no
search, no filter, and no virtualisation — the tab is effectively unworkable, and
finding one entry means scrolling past a thousand.

**The pattern already exists in this repo** — do not invent a second one:

| Concern | Reference implementation |
|---|---|
| Virtualised rows | `ChannelsTable.tsx` — `useVirtualizer` from `@tanstack/react-virtual`, `estimateSize: () => 41`, `overscan: 8`, `getItemKey` by stable id |
| Search + filter | `ChannelsTab.tsx` — `filteredChannels` in a `useMemo`, matching name / frequency / mode / number |
| Range selection | `ChannelsTable.tsx` — click / shift-click / alt-click with an `anchorRef` |
| Scroll-to-and-highlight | `ChannelsTable.tsx` — `scrollAndHighlight` |

Wanted, in the order they would help most:

- **Search** by name, DMR ID and call type. Names here are frequently generated
  (`TG0001`…`TG1010`), so substring matching on the numeric part matters.
- **Virtualise the rows.** 1010 rows is already past what the browser is happy
  with, and the table holds up to 10,000.
- **Jump to index.** With generated names, "go to 1005" is the real query.
- **Bulk delete / range select**, so a test load can be cleared without 1010
  clicks.
- **Show what references a talk group before deleting it.** Channels carry a TX
  contact and receive groups carry members; deleting one silently leaves a
  dangling reference, which is what `findDanglingReferences` refuses a write
  over later — far from where the mistake was made.

> ⚠️ Talk group WRITING is separately broken and is not a UI issue: the table is
> never passed to the write plan, and the masked-table planner is flat-addressed
> while `talkgroupAddress()` is banked at 1000. See `TODO-DA7X2.md`. Fixing the
> list UI does not make edits reach the radio.

## U2. Status Messages area

`src/components/settings/D890StatusMessagesArea.tsx`. Works, and was enough to
land a clean dry run, but it is thin:

- **No character counter.** The limit is 32 and a full slot carries no
  terminator, so 32 is genuinely usable — but there is nothing showing 12/32,
  and `maxLength` silently truncates at the boundary.
- **Blur-to-save is invisible.** Typing and clicking Write without leaving the
  field loses the edit. Every table area in this radio has the same behaviour;
  it wants either save-on-change or a visible dirty marker.
- **No slot choice on add.** The button takes the lowest free slot, which is
  usually right and occasionally not — a round-trip test that wants a specific
  slot has to add and delete to reach it.
- **Delete semantics are invisible.** Deleting clears the presence bit and
  deliberately leaves the text in flash. That is correct and surprising, and it
  currently lives only in a `title` tooltip.
- **No cross-reference to hot keys.** A hot key's Content points at a message
  slot; deleting that message leaves the key pointing at a cleared bit, with
  nothing in either screen saying so.

## U3. Blur-to-save is a project-wide pattern, not a local one

Every DA-7X2 table area (`D890StatusMessagesArea`, `D890AddressBooksArea`,
`D890DtmfArea`, `AutoRepeaterOffsets`) uses uncontrolled inputs with
`defaultValue` + `onBlur`. It avoids a re-render per keystroke on big tables, and
it means an edit is silently discarded if the user goes straight from the field
to a toolbar button. Worth solving once, in a shared input component, rather
than five times.

## U4. Read progress freezes on long steps

The configuration phase (70–90%) divides its slice evenly across ~25 steps, and
a step that does not report intra-step progress parks the bar on one number for
its whole duration. On a codeplug with 1010 talk groups that is **~20 seconds
stuck at 73.2%**, which reads as a hang.

The mechanism to fix it already exists — `useRadioConnection.ts` computes
`base + fraction * slice` and passes a `report` callback — but the
`CODEPLUG_READS` steps are pushed as `run: () => run(sinks)`, dropping it. Only
the preserve pass is wired. Roughly ten lines; no protocol risk.

## U5. Newly-read tables have no home outside Settings

Status messages, hot keys, both address books, the SMS store and DTMF all render
as Settings areas because that is where the registry lives. Several are closer to
Contacts or Digital in the user's mind — the address books especially. Worth
revisiting once there is more than one radio with them, and not before: moving
them now would be guessing at a second radio's shape.
