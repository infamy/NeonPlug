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

## 🗺️ Roadmap

Here's where we're headed. Items marked with ✅ are complete, and ⚠️ indicates work in progress.

### Phase 1: Read & Parse (Complete) ✅
- [x] Connect to radio via Web Serial API
- [x] Read full codeplug from radio
- [x] Parse all data structures (channels, contacts, zones, scan lists, RX groups)
- [x] Display parsed data in editable tables
- [x] Basic validation for frequency ranges and DMR settings

### Phase 2: Import & Export (Complete) ✅
- [x] CSV export (CHIRP compatible)
- [x] CSV import with validation
- [x] Location-based channel wizard (repeater databases)
- [x] Airport frequency generation
- [x] Bulk channel generation from repeater databases

### Phase 3: Write Operations (Mostly Complete) ✅
- [x] Write complete codeplug to radio
- [x] Write individual channels
- [x] Write contacts and groups
- [x] Write zones and scan lists
- [ ] Write support for roaming channels/zones
- [ ] Full backup/restore functionality

### Phase 4: Advanced Features (Planned)
- [x] Encrypted channel support
- [ ] Boot picture read/write support
- [ ] Firmware backup/restore
- [ ] Multi-radio profile support (save/load different configurations)
- [ ] Advanced filtering and search
- [ ] Bulk operations (duplicate, batch edit)

### Phase 5: Community & Integration
- [ ] Plugin system for custom repeater databases
- [ ] Collaborative codeplug sharing
- [ ] Integration with RadioID database
- [ ] Mobile-responsive UI improvements

**Want to help?** Pick an item from the roadmap and let us know in Discord!

---

## 🛠️ Tech Stack

Built with modern web technologies for performance and reliability:

- **React** + **TypeScript** - Type-safe component architecture
- **Vite** - Lightning-fast build tooling
- **Tailwind CSS** - Custom cyberpunk neon theme
- **Zustand** - Lightweight state management
- **Web Serial API** - Direct hardware communication

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Chromium-based browser (Chrome, Edge, Opera, Brave) for Web Serial API support

### Installation

```bash
git clone https://github.com/yourusername/NeonPlug.git
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

---

## 📁 Project Structure

```
src/
├── components/     # UI components organized by feature
│   ├── channels/  # Channel management UI
│   ├── contacts/  # Contact management UI
│   ├── zones/     # Zone management UI
│   ├── import/    # Smart import wizard
│   ├── layout/    # App layout and navigation
│   └── ui/        # Reusable UI components
├── models/         # TypeScript data models for radio structures
│   ├── Channel.ts
│   ├── Contact.ts
│   ├── Zone.ts
│   └── ...
├── protocol/       # DM-32UV protocol implementation
│   └── dm32uv/    # Memory maps, encoding, and communication
│       ├── protocol.ts    # Main protocol handler
│       ├── structures.ts  # Data structure definitions
│       ├── memory.ts      # Memory map constants
│       └── encoding.ts    # Character encoding
├── services/       # Business logic (import, validation, generation)
│   ├── smartImporter.ts   # Location-based channel generation
│   ├── validation/        # Validation services
│   └── csv/              # CSV import/export
├── store/          # Zustand stores for app state
│   ├── channelsStore.ts
│   ├── contactsStore.ts
│   └── ...
├── data/           # Static data (repeater databases, airports, etc.)
└── styles/         # Global styles and Tailwind config
```

---

## 🏗️ Architecture

### State Management

NeonPlug uses **Zustand** for state management. Each major feature has its own store:

- `channelsStore.ts` - Channel data and operations
- `contactsStore.ts` - DMR contacts
- `zonesStore.ts` - Zone configuration
- `radioStore.ts` - Radio connection state

### Protocol Layer

The DM-32UV protocol is implemented in `src/protocol/dm32uv/`:

- **protocol.ts** - Main protocol interface (read/write operations)
- **structures.ts** - TypeScript definitions for radio data structures
- **memory.ts** - Memory address maps
- **encoding.ts** - Character encoding/decoding for radio display

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
3. Use the Diagnostics tab to inspect raw data
4. Test read/write operations

---

## 🎨 Styling

The app uses **Tailwind CSS** with a custom cyberpunk theme defined in `tailwind.config.js`.

Color palette:
- Primary: Cyan (`#00ffff`)
- Secondary: Magenta (`#ff00ff`)
- Accent: Purple (`#9333ea`)
- Background: Dark grays

Use semantic color classes when possible:
- `text-primary` for cyan text
- `border-primary` for cyan borders
- `bg-gray-800` for panels

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
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
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

[![Discord](https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/9ckzrcKU)

---

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.
