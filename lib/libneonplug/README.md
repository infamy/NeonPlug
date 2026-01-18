# NeonPlug Library

A library for writing contacts directly to Baofeng DM-32UV and compatible radios via Web Serial API.

## Features

- Write contact lists directly to radio via Web Serial API
- Support for Baofeng DM-32UV radio
- Simple, clean API
- Progress callbacks for long-running operations
- TypeScript support with full type definitions

## Requirements

- **Browser**: Chrome/Edge (Web Serial API support required)
- **Radio**: Baofeng DM-32UV
- **Connection**: USB cable connecting radio to computer
- **User Action**: User must grant serial port permission when prompted

## Installation

The library is hosted on neonplug.app and can be imported directly:

```typescript
import { NeonPlugWriter, type Contact } from 'https://neonplug.app/libneonplug/libneonplug.js';
```

Or download and include in your project.

## Quick Start

```typescript
import { NeonPlugWriter, type Contact } from 'https://neonplug.app/libneonplug/libneonplug.js';

// Check if Web Serial API is supported
if (!NeonPlugWriter.isSupported()) {
  alert('Web Serial API not supported. Please use Chrome/Edge.');
  return;
}

// Get list of supported radio models
const supportedModels = NeonPlugWriter.getSupportedModels();
console.log('Supported radios:', supportedModels);
// Output: ['dm32uv']

// Prepare contact data
const contacts: Contact[] = [
  {
    id: 1,
    name: "John Doe",
    dmrId: 1234567,
    callSign: "KD0ABC",
    city: "Denver",
    province: "CO",
    country: "USA",
    remark: "Local repeater"
  },
  // ... more contacts
];

// Create writer instance
const writer = new NeonPlugWriter();

// Write contacts to radio
try {
  await writer.writeContacts(
    contacts,
    'dm32uv', // Radio model
    (progress, message) => {
      console.log(`Progress: ${progress}% - ${message}`);
      // Update your UI with progress
    }
  );
  console.log('Successfully wrote contacts to radio!');
} catch (error) {
  console.error('Failed to write contacts:', error);
  // Handle error (user cancelled, radio not connected, etc.)
}
```

## API Reference

### NeonPlugWriter

Main class for writing contacts to radios.

#### Static Methods

##### `getSupportedModels(): RadioModel[]`

Returns an array of supported radio model identifiers.

```typescript
const models = NeonPlugWriter.getSupportedModels();
// Returns: ['dm32uv', 'dp570uv']
```

##### `isSupported(): boolean`

Checks if Web Serial API is supported in the current browser.

```typescript
if (!NeonPlugWriter.isSupported()) {
  // Show error message
}
```

#### Instance Methods

##### `writeContacts(contacts, radioModel, onProgress?): Promise<void>`

Writes contacts directly to the radio.

**Parameters:**
- `contacts: Contact[]` - Array of Contact objects to write
- `radioModel: RadioModel` - Radio model identifier ('dm32uv', 'dp570uv', etc.)
- `onProgress?: ProgressCallback` - Optional progress callback

**Returns:** Promise that resolves when contacts are written

**Throws:** Error if Web Serial API not supported, connection fails, or write fails

**Example:**
```typescript
await writer.writeContacts(contacts, 'dm32uv', (progress, message) => {
  updateProgressBar(progress);
  showStatus(message);
});
```

## Types

### Contact

```typescript
interface Contact {
  id: number;                   // 1-250
  name: string;                 // Max 16 chars
  dmrId: number;                // DMR ID (7 digits) / Talkgroup ID
  callSign?: string;            // Callsign (optional, max 7 chars)
  city?: string;                // City (optional)
  province?: string;            // Province/State (optional)
  country?: string;             // Country (optional)
  remark?: string;              // Additional remarks/notes (optional)
}
```

### RadioModel

```typescript
type RadioModel = 'dm32uv' | string;
```

### ProgressCallback

```typescript
type ProgressCallback = (progress: number, message: string) => void;
```

## Error Handling

The library provides clear error messages for common scenarios:

- **Web Serial API not supported**: Browser doesn't support Web Serial API
- **User cancelled port selection**: User cancelled the port selection dialog
- **Radio not found/connected**: Radio is not connected or not responding
- **Radio model not supported**: Specified radio model is not in the supported list
- **Write operation failed**: Error occurred during the write operation
- **Connection lost during write**: Connection was lost while writing

## User Experience Flow

1. User visits third-party website
2. Website collects contact data (JSON)
3. User clicks "Write to Radio" button
4. Browser prompts user to select serial port (radio)
5. Library connects to radio and writes contacts
6. Progress updates shown to user via callback
7. Contacts are written directly to radio

## Browser Compatibility

- ✅ Chrome 89+
- ✅ Edge 89+
- ❌ Firefox (Web Serial API not supported)
- ❌ Safari (Web Serial API not supported)

## License

MIT

## Support

For issues, questions, or contributions, please visit the [NeonPlug project](https://github.com/your-repo/neonplug).
