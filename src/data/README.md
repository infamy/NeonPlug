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

That's it! The new channel set will automatically appear in the Smart Import tab.

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

## Airport Data (`airports_min.json`)

**Readonly** - This file contains airport data with frequencies. It's automatically loaded from `src/data/airports_min.json`.

### Data Structure

Each airport entry contains:
- `airport_name`: Airport name (max 16 characters)
- `latitude`: Airport latitude
- `longitude`: Airport longitude  
- `frequencies`: Array of frequencies in kHz (e.g., 122900 = 122.900 MHz)

### Usage

Airports are location-based and require a location to be set. The Smart Import tab will:
1. Filter airports by proximity to your location (configurable radius)
2. Combine airports using the same frequency into single channels
3. Generate channels with appropriate names (airport name or combined names)
4. Create a "Local Airports" zone automatically

**Note:** This is a large dataset (~98k airports). The system filters by location for performance, so only nearby airports are processed.

