# Contributing to NeonPlug

Thanks for your interest in contributing to NeonPlug! Whether you're a developer, tester, or enthusiast, there are many ways to help.

## 🤝 How Everyone Can Contribute

You don't need to be a developer to make a difference!

### 🧪 Testing & Bug Reports
- Test the app with your DM-32UV radio
- Report bugs with clear reproduction steps
- Test new features and provide feedback
- Document edge cases and unusual configurations

### 💡 Ideas & Feedback
- Suggest new features that would be useful
- Share your workflow and pain points
- Provide feedback on UI/UX improvements
- Request better documentation

### 📣 Community & Promotion
- Share NeonPlug with other radio enthusiasts
- Write blog posts or make videos about using NeonPlug
- Answer questions in our Discord community
- Help other users troubleshoot issues

### 💻 Code Contributions
If you're a developer, keep reading for technical setup and guidelines!

---

## 🛠️ Tech Stack

Built with modern web technologies for performance and reliability:

- **React** + **TypeScript** - Type-safe component architecture
- **Vite** - Lightning-fast build tooling
- **Tailwind CSS** - Custom cyberpunk neon theme (see PLAN.md for the colour palette and usage guidelines)
- **Zustand** - Lightweight state management
- **Web Serial API** - Direct hardware communication

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Chromium-based browser (Chrome, Edge, Opera, Brave) for Web Serial API support

### Installation

```bash
git clone https://github.com/infamy/NeonPlug.git
cd NeonPlug
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Linting

```bash
npm run lint
```

### UI and colour consistency

Use the theme colours defined in `tailwind.config.js` and documented in PLAN.md (Color Palette). Prefer `neon-cyan`, `cool-gray`, `deep-gray`, and `dark-charcoal` over raw Tailwind grays so the neon theme stays consistent.

---

## 📁 Project Structure

```
src/
├── components/       # UI components organized by feature
│   ├── about/       # About tab
│   ├── channels/    # Channel management (table, edit modal, tab)
│   ├── contacts/    # Contacts tab and table
│   ├── diagnostics/ # Diagnostics tab, collapsible sections, offset inspector
│   ├── digital/     # Digital tab (DMR IDs, talk groups, encryption, etc.)
│   ├── import/      # Smart import wizard
│   ├── layout/      # Main layout, status bar, tab navigation, toolbar
│   ├── rxgroups/    # RX groups list
│   ├── scanlists/   # Scan lists list and tab
│   ├── settings/    # Settings tab and field renderers (settings/fields/)
│   ├── ui/          # Reusable UI (Button, Card, Modal, EmptyState, etc.)
│   └── zones/       # Zones list and tab
├── constants/       # App constants (e.g. countries)
├── data/            # Static data and config
│   ├── settingsProfiles/  # Radio-specific settings profiles
│   ├── airportsData.ts, taflData.ts, rptrsData.ts, etc.
│   └── ...
├── hooks/           # React hooks (e.g. useRadioConnection)
├── models/          # TypeScript data models
│   ├── Channel.ts, Contact.ts, Zone.ts, RadioSettings.ts
│   ├── RXGroup.ts, ScanList.ts, EncryptionKey.ts, etc.
│   └── index.ts
├── radios/          # Radio protocol layer (multi-radio support)
│   ├── index.ts           # Protocol factory, model IDs
│   ├── capabilities.ts    # Capabilities registry
│   ├── dm32uv/            # DM-32UV / DP570UV implementation
│   │   ├── protocol.ts, structures.ts, memory.ts, connection.ts
│   │   ├── capabilities.ts, settingsProfile.ts, types.ts
│   │   └── ...
│   └── README.md
├── services/        # Business logic
│   ├── csv/         # CHIRP and CSV import/export
│   ├── validation/  # Channel, frequency, DMR validators
│   ├── smartImporter.ts, repeaterFinder.ts, locationService.ts
│   ├── airportChannels.ts, taflChannels.ts, rptrsChannels.ts
│   ├── codeplugExport.ts, debugExport.ts, metadataAnalysis.ts
│   └── ...
├── store/           # Zustand stores (channels, zones, contacts, radio, etc.)
│   ├── channelsStore.ts, zonesStore.ts, contactsStore.ts
│   ├── radioStore.ts, radioSettingsStore.ts, debugStore.ts
│   └── ...
├── types/           # Shared types (radio, capabilities, settings profile)
├── utils/            # Helpers (formatHelpers, ctcssConstants, zoneHelpers, etc.)
├── styles/          # Global styles (globals.css, theme classes)
├── App.tsx
└── main.tsx
```

---

## 🏗️ Architecture

### State Management

NeonPlug uses **Zustand** for state management. Each major feature has its own store:

- `channelsStore.ts` - Channel data and operations
- `contactsStore.ts` - DMR contacts
- `zonesStore.ts` - Zone configuration
- `radioStore.ts` - Radio connection state
- Plus stores for settings, scan lists, RX groups, encryption keys, quick contacts/messages, DMR radio IDs, emergencies, calibration, debug, and logs

### Protocol Layer

The radio protocol layer lives under `src/radios/`. The DM-32UV (aka DP570UV) implementation is in `src/radios/dm32uv/`:

- **protocol.ts** - Main protocol interface (read/write operations)
- **structures.ts** - Data structure definitions and encoding
- **memory.ts** - Memory maps and block handling
- **connection.ts** - Serial connection and handshake
- **capabilities.ts** - Radio-specific limits and parsers
- **settingsProfile.ts** - Settings field layout for this model

### Validation

All data validation is centralized in `src/services/validation/`:

- **frequencyValidator.ts** - Frequency range and band validation
- **dmrValidator.ts** - DMR-specific validation (color codes, time slots)
- **channelValidator.ts** - Complete channel validation

---

## 🧪 Testing

Currently, testing is done manually with actual hardware. Automated testing infrastructure is planned for the future.

To test with a radio:
1. Connect your DM-32UV via USB
2. Click "Connect to Radio" in the app
3. Enable **Debug Mode** from the About tab to reveal the Diagnostics tab, then use it to inspect raw data
4. Test read/write operations

---

## 🎨 Styling

The app uses **Tailwind CSS** with a custom cyberpunk neon theme defined in `tailwind.config.js`. See **PLAN.md** (Color Palette table) and the **UI and colour consistency** section above for full guidelines.

**Palette (from `tailwind.config.js`):**
- Primary accent: `neon-cyan` (#00FFF7) — primary buttons, highlights, borders
- Secondary accent: `neon-magenta` (#FF00FF) — tabs, selection, alerts
- Highlight: `electric-purple` (#9B30FF) — modal headers, secondary accents
- Secondary text: `cool-gray` (#B0B0B0) — labels, muted text
- Backgrounds: `dark-charcoal`, `deep-gray` (#121212, #1E1E1E)

**Reusable semantic classes** in `src/styles/globals.css`: `text-muted`, `border-panel`, `border-panel-strong`, `link-accent`, `bg-panel`. Prefer these and the theme tokens over raw Tailwind grays.

---

## 🤝 How to Contribute

### Reporting Bugs

Open an issue with:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Browser and OS information
- Radio model and firmware version (if applicable)

### Suggesting Features

Open an issue with:
- Clear description of the feature
- Use case and motivation
- Any implementation ideas

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git switch -c feature/amazing-feature`)
3. Make your changes
4. Test thoroughly
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow existing naming conventions
- Add comments for complex logic
- Keep functions focused and single-purpose
- Use meaningful variable names

---

## 📚 Useful Resources

- [Web Serial API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API)
- [DMR Protocol Basics](https://en.wikipedia.org/wiki/Digital_mobile_radio)
- [Zustand Documentation](https://docs.pmnd.rs/zustand)

---

## 💬 Get Help

Join our Discord community for development discussions:

[![Discord](https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/j59TBHVD22)

---

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.
