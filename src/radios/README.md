# Radio protocol implementations

Each radio folder implements the `RadioProtocol` interface by reading its own memory layout and producing the same **standard codeplug format** (Channel, Zone, Contact, RadioSettings, etc.).

- **DM-32** (`dm32uv/`): Uses V-frames and block discovery; all decode/encode and raw layout details stay in this folder.
- **Other radios**: Can use a linear address map or any other layout; they decode to the same standard types so the rest of the app stays radio-agnostic.

Raw layout (V-frames, blocks, linear addresses) and decoding are implementation details of each radio. The app only ever sees the standard types.

## Adding a new radio

1. **Protocol**: Create a new folder under `radios/` and implement the `RadioProtocol` interface (see [types/radio.ts](../types/radio.ts)). Produce the standard codeplug types; raw layout stays inside the radio folder.
2. **Registry**: Register the protocol in [radios/index.ts](index.ts). If the radio has multiple model ids (e.g. marketing vs internal name), add them to a shared list and build the registry from it (see `DM32_MODEL_IDS`).
3. **Capabilities**: Add a capabilities object (parsers, limits, band limits, firmware helpers) and register it in [radios/capabilities.ts](capabilities.ts) via `getCapabilitiesForModel`. The UI uses capabilities instead of importing from a specific radio.
4. **Settings profile**: If the radio has a settings UI, add a profile and register it in [data/settingsProfiles/index.ts](../data/settingsProfiles/index.ts). The Settings tab resolves the profile by `radioInfo.model`.
5. **Extended protocol surface** (optional): The hook [useRadioConnection.ts](../hooks/useRadioConnection.ts) calls extra methods (e.g. bulk read, boot image, quick messages) via `(protocol as any)`. To support a radio that omits some of these, add optional methods or capability flags and guard calls in the hook so a new radio only implements what it supports.
