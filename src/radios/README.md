# Radio protocol implementations

Each radio folder implements the `RadioProtocol` interface by reading its own memory layout and producing the same **standard codeplug format** (Channel, Zone, Contact, RadioSettings, etc.).

- **DM-32** (`dm32uv/`): Uses V-frames and block discovery; all decode/encode and raw layout details stay in this folder.
- **Other radios**: Can use a linear address map or any other layout; they decode to the same standard types so the rest of the app stays radio-agnostic.

Raw layout (V-frames, blocks, linear addresses) and decoding are implementation details of each radio. The app only ever sees the standard types.

## Radio descriptor (single registration surface)

Each radio is registered via a **descriptor** (see [types.ts](types.ts)). The descriptor holds:

- `modelIds` — one or more model IDs (e.g. `['DM-32UV', 'DP570UV']` or `['UV5R-Mini']`)
- `label`, `icon`, `supportsBle` — for the pick-a-radio modal
- `protocolFactory` — function that returns a new `RadioProtocol` instance
- `capabilities` — limits and feature flags (maxChannels, supportsZones, supportsBulkRead, etc.); the UI and migration use these instead of importing a specific radio
- `settingsProfile` — optional; set to `null` when the radio has no settings UI

The central [index.ts](index.ts) imports all descriptors and builds the protocol registry, picker options, and migration targets from them. [capabilities.ts](capabilities.ts) builds the capabilities registry from the same descriptors. [data/settingsProfiles/index.ts](../data/settingsProfiles/index.ts) builds the settings profile registry from the same descriptors. **You do not edit capabilities.ts or settingsProfiles/index.ts when adding a radio** — only add a descriptor and register it in the descriptor list in index.ts.

## Adding a new radio

1. **Protocol**: Create a new folder under `radios/` and implement the `RadioProtocol` interface (see [types/radio.ts](../types/radio.ts)). Produce the standard codeplug types; raw layout stays inside the radio folder.
2. **Capabilities**: In the same folder, add a capabilities object (see [dm32uv/capabilities.ts](dm32uv/capabilities.ts) or [uv5rmini/capabilities.ts](uv5rmini/capabilities.ts)). Set at least `maxChannels`, `supportsZones`, `supportsScanLists`, `analogOnly`; add `supportsBle`, `preferredTransport`, `supportsBulkRead`, `maxZones`, `maxScanLists` as needed.
3. **Descriptor**: In the same folder, add a descriptor file (e.g. `descriptor.ts`) that exports a `RadioDescriptor`: modelIds, label, icon, supportsBle, protocolFactory, capabilities, and optionally settingsProfile (or `null` if no settings UI).
4. **Register**: In [radios/index.ts](index.ts), import the descriptor and add it to the `RADIO_DESCRIPTORS` array.

No edits are needed in useRadioConnection, TabNavigation, migration, or Channel Wizard for feature visibility — they all use capabilities and the effective radio model. Tabs, Settings usage stats, and conversion behavior are driven by the capabilities you set on the descriptor.

5. **Settings profile** (optional): If the radio has a settings UI, add a profile in the radio folder and reference it from the descriptor (`settingsProfile: MyRadio_SETTINGS_PROFILE`). If the radio has no settings UI, set `settingsProfile: null` on the descriptor.
6. **Extended protocol surface** (optional): The hook [useRadioConnection.ts](../hooks/useRadioConnection.ts) calls optional methods (e.g. bulk read, boot image, quick messages) and uses capability flags (`supportsBulkRead`, `supportsBootImage`, `supportsQuickMessages`) where applicable. Implement only what the radio supports; the hook guards by capability.
