# Data Files

This directory contains centralized data files for the application.

## Fixed Channels Data (`fixedChannels.json`)

All fixed channel sets (FRS, GMRS, MURS, etc.) are defined in **JSON format** for easy editing.

### Adding a New Channel Set

1. Open `src/data/fixedChannels.json`
2. Add a new object to the array with your channel frequencies:

```json
{
  "name": "Your Set Name",
  "description": "Description of the channel set",
  "defaultPower": "High",
  "defaultBandwidth": "25kHz",
  "defaultMode": "Analog",
  "frequencies": [
    { "number": 1, "rx": 146.520, "tx": 146.520, "name": "Channel 1" },
    { "number": 2, "rx": 146.540, "tx": 146.540, "name": "Channel 2" }
  ]
}
```

That's it! The new channel set will automatically appear in the Channel Wizard tab.

**Note:** The JSON file is loaded automatically - no code changes needed!

### Optional Fields

Each frequency entry can include:
- `ctcss?: number` - CTCSS tone in Hz
- `dcs?: number` - DCS code
- `notes?: string` - Additional notes

## Repeater Database (`repeaterDatabase.ts`)

Static repeater database for offline/local use.

### Adding Repeaters

Add repeater entries to the `REPEATER_DATABASE` array:

```typescript
export const REPEATER_DATABASE: Repeater[] = [
  {
    callsign: 'W1ABC',
    frequency: 146.940, // Output frequency (MHz)
    inputOffset: -0.6, // Offset in MHz (typically -0.6 for 2m, -5.0 for 70cm)
    ctcss: 100.0, // Optional CTCSS tone
    location: 'Downtown',
    city: 'Boston',
    state: 'MA',
    latitude: 42.3601,
    longitude: -71.0589,
    band: '2m',
    mode: 'FM',
    status: 'active',
    notes: 'Open repeater',
  },
  // Add more repeaters...
];
```

### Loading from External File

Users can also load repeater databases from JSON files using the `loadRepeaterDatabaseFromFile()` function.

### API Integration

The database is designed to support API integration. See `DEFAULT_REPEATER_CONFIG` for configuration options.

## Airports, licensed sites and amateur repeaters

Not stored here. They come from [data.ferritefw.dev](https://data.ferritefw.dev), rebuilt daily,
split into map tiles so a search downloads only the tiles around it: see `src/services/ferrite/`.
Airports are OurAirports, licensed sites are Canada's TAFL and the US FCC's ULS, and amateur
repeaters are HearHam. Their credits are on the About tab.

## DMR Repeater Data (`rptrs.json`)

**Readonly** - This file contains DMR repeater information with location data. It's automatically loaded from `src/data/rptrs.json`.

### Data Structure

The file contains a JSON object with a `rptrs` array. Each repeater entry contains:
- `callsign`: Repeater callsign
- `frequency`: Frequency as string (e.g., "440.58750")
- `offset`: Offset as string (e.g., "+5.000", "-5.000")
- `color_code`: DMR color code (0-15)
- `ts_linked`: Timeslots linked (e.g., "TS1 TS2", "TS1", "Mixed Mode")
- `city`, `state`, `country`: Location information
- `lat`, `lng`: Latitude and longitude as strings
- `ipsc_network`: Network name (e.g., "Brandmeister", "DMR-MARC")
- `status`: Repeater status (e.g., "ACTIVE", "INACTIVE")

### Usage

DMR repeaters are location-based and require a location to be set. The Smart Import tab will:
1. Filter repeaters by proximity to your location (configurable radius)
2. Create separate channels for each timeslot if multiple timeslots are available
3. Generate channels with DMR-specific settings (color code, digital mode, 12.5kHz bandwidth)
4. Create zones grouped by network, location, or all in one zone

**Note:** This is a large dataset. The system filters by location for performance, so only nearby repeaters are processed. Only ACTIVE repeaters are included in search results.

