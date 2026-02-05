# Radio protocol implementations

Each radio folder implements the `RadioProtocol` interface by reading its own memory layout and producing the same **standard codeplug format** (Channel, Zone, Contact, RadioSettings, etc.).

- **DM-32** (`dm32uv/`): Uses V-frames and block discovery; all decode/encode and raw layout details stay in this folder.
- **Other radios**: Can use a linear address map or any other layout; they decode to the same standard types so the rest of the app stays radio-agnostic.

Raw layout (V-frames, blocks, linear addresses) and decoding are implementation details of each radio. The app only ever sees the standard types.
