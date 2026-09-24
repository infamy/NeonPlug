![NeonPlug Banner](neonplug_banner.jpg)

# NEONPLUG

[![Discord](https://img.shields.io/badge/discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/j59TBHVD22)
[![Latest release](https://img.shields.io/github/v/release/infamy/NeonPlug?label=release&color=00e5ff)](https://github.com/infamy/NeonPlug/releases/latest)

**A next-generation, web-based Channel Programming Software (CPS) for supported radios.**

NeonPlug lets you program your radio directly from your browser—no software installation required. Connect via Web Serial (USB) or, where supported, Bluetooth Low Energy (BLE). A sleek, cyberpunk neon-themed UI puts channels, zones, scan lists, contacts, and settings at your fingertips.

**Supported radios:**
| Radio | Manufacturer | Bands | Connection |
|---|---|---|---|
| DM-32UV / DP570UV | Baofeng | VHF + UHF (DMR/Analog) | USB |
| DA-7X2 / DA-7XR — alpha | BTECH | VHF + UHF (DMR/Analog) | USB |
| AT-D890UV — alpha | Anytone | VHF + UHF (DMR/Analog) | USB |
| UV5R-Mini | Baofeng | VHF + UHF (Analog) | USB or BLE |
| FT-65 / FT-65R / FT-65E | Yaesu | VHF + UHF (Analog) | USB (SCU-35) |
| FT-4 / FT-4XR / FT-4XE | Yaesu | VHF + UHF (Analog) | USB (SCU-35) |
| FT-4VR | Yaesu | VHF (Analog) | USB (SCU-35) |
| FT-25R | Yaesu | VHF (Analog) | USB (SCU-35) |

*Alpha* means the driver reads and writes the whole codeplug, but not every part of it has been checked on the radio yet. The DA-7X2, DA-7XR and AT-D890UV are the same radio under three names.

**🚀 Try it live:** [https://neonplug.app](https://neonplug.app) · **📥 [Download offline version](https://github.com/infamy/NeonPlug/releases/latest/download/neonplug-latest.html)** (single-file, no install)

| Build | URL | What it is |
|---|---|---|
| **Release** | [neonplug.app](https://neonplug.app) | Latest tagged version — what you want |
| **Development** | [neonplug.app/dev](https://neonplug.app/dev/) | Latest `main`, unreleased and untagged |
| **PR preview** | `neonplug.app/test/<branch>/` | A specific open pull request |

> ⚠️ **Note:** Currently in active development. Some features are still being implemented.

---

## ✨ Demo

![NeonPlug Demo](demo.gif)

*Create channels, manage contacts, and program your radio—all from your browser.*

---

## 🎯 Key Features

### 📻 Radio Management
- **Web Serial & BLE** - Connect via USB (Web Serial API, no drivers) or Bluetooth Low Energy where supported (e.g. UV5R-Mini)
- **Read & Write** - Full codeplug read/write support for each radio
- **Live Validation** - Real-time frequency and configuration validation

### 📡 Channel Configuration
- **Smart Import** - Location-based channel wizard using repeater databases
- **Bulk Editing** - Powerful table interface for editing multiple channels at once
- **Codeplug backup** - Save and load a full codeplug as a `.neonplug` file: a zipped JSON archive you can unzip to read, but edit it in NeonPlug rather than by hand
- **Chirp CSV** - Import and export channels in CHIRP CSV format; custom CSV import also supported
- **Auto-Configuration** - Automatic offset, CTCSS, and color code detection

### 👥 Contact & Group Management
- **Digital Contacts** - Manage DMR contacts with full talk group support (DMR radios)
- **RX Groups** - Create and organize receive groups (DMR radios)
- **Scan Lists** - Configure scan lists across zones

---

## 🚀 Getting Started

Just visit **[neonplug.app](https://neonplug.app)** in a Chrome-based browser (Chrome, Edge, Opera, Brave). No installation needed!

**Requirements:**
- Chrome, Edge, Opera, or Brave browser (for Web Serial API support)
- A supported radio (see table above) with the appropriate USB cable—or BLE for the UV5R-Mini

### 📥 Offline mode

You can use NeonPlug without an internet connection. Either:

- **Download a released build directly:** [neonplug-latest.html](https://github.com/infamy/NeonPlug/releases/latest/download/neonplug-latest.html) — or pick a specific version from [Releases](https://github.com/infamy/NeonPlug/releases). This is the same file the live site serves, so it is a known, citable version.
- **Or export from the running app:** on the startup screen click **Download offline version (ZIP)** — or open **Settings → About** and click **Download Offline Version (ZIP)** — then unzip and open **neonplug.html**.

Either way the result is a single, self-contained HTML file (all assets inlined). No server or network required; Web Serial for the radio still works when the file is opened locally.

Releases are numbered by date, `YEAR.MONTH.N`: `2026.9.0` is the first release of September 2026, and the next one that month is `2026.9.1`. The version you are running is shown in **Settings → About**. A tagged release reads `v2026.9.0`; anything built from `main` or a PR reads `v2026.9.0-dev+abc1234` so bug reports can be traced to an exact commit.

---

## 🤝 Contributing

We welcome contributions from everyone—not just developers!

- 🧪 **Test the app** and report bugs or issues
- 💡 **Share ideas** for new features
- 📣 **Spread the word** about NeonPlug to other radio enthusiasts
- 💻 **Write code** — the [Contributing Guide](CONTRIBUTING.md) covers setup, architecture and guidelines

This project was built with the assistance of AI, but all design decisions and architecture are intentional and human-guided.

---

## 🙏 Acknowledgements

Thanks to [BTECH Radios](https://baofengtech.com/product/da-7x2/) for providing the DA-7X2 that NeonPlug's DA-7X2 support is built and tested on.

Radio donations are welcome — having the radio on hand is what gets support for a new model built and tested. If you have one to donate, [open a GitHub issue](https://github.com/infamy/NeonPlug/issues/new) with the model.

---

## 📜 License

MIT License - feel free to use this project for your own radio programming needs!

---

## 💬 Community

Have questions or want to share your experience? [Join our Discord](https://discord.gg/j59TBHVD22).
