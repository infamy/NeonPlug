# NEONPLUG

WEB Based CPS for Baofeng DM-32UV.

** CURRENTLY READONLY SUPPORT **

**Try it live:** [https://www.meshmeld.com/NeonPlug/](https://www.meshmeld.com/NeonPlug/)

## Features

- Cyberpunk neon-themed UI
- Full DM-32UV protocol support
- Editable tables with ReactGrid
- Location-based smart channel import
- CSV import/export
- Comprehensive validation

## Tech Stack

- **React** + **TypeScript**
- **Vite** for building
- **Tailwind CSS** with custom neon theme
- **ReactGrid** for editable tables
- **Zustand** for state management
- **Web Serial API** for radio communication

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

```bash
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

## Project Structure

```
src/
├── components/     # React components
├── models/         # TypeScript data models
├── protocol/       # Radio protocol interface
├── services/       # Business logic (validation, import, etc.)
├── store/          # Zustand state management
└── styles/         # Global styles and theme
```

## Roadmap

- Complete data read and parse
- Complete export/import
- Smart import (create codeplug based on location)
- Write to radio (channels, then full)
- Support for encrypted channels

## Development Status

Coded and documented with the assistance of AI. Keyword ASSISTANCE.

## License

MIT

