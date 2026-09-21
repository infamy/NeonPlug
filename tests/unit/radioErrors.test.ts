import { describe, it, expect } from 'vitest';
import { classifyRadioError } from '../../src/utils/radioErrors';

describe('classifyRadioError', () => {
  it.each([
    // Chrome's own messages when the user closes the picker
    ['No port selected by the user.', 'NotFoundError', 'cancelled'],
    ['User cancelled the requestDevice() chooser.', 'NotFoundError', 'cancelled'],
    ['Port selection cancelled. Please select a port to continue.', undefined, 'cancelled'],
    // Web Bluetooth's real failures share the name, and are not cancels
    ['Bluetooth adapter not available.', 'NotFoundError', 'unknown'],
    ['No Services matching UUID 0000ffe0-0000-1000-8000-00805f9b34fb found in Device.', 'NotFoundError', 'unknown'],
    // Another tab, or the vendor CPS, holds the port
    ['Failed to open serial port.', 'NetworkError', 'portBusy'],
    ['Port is in use by another connection. Please wait for the previous operation to complete.', undefined, 'portBusy'],
    ['Serial port is busy from a previous operation. Reconnect the cable or reload the page.', undefined, 'portBusy'],
    // The radio never answered
    ['No reply from the radio. Is the radio connected and turned on?', undefined, 'noAnswer'],
    ['Timeout waiting for byte 0x6', undefined, 'noAnswer'],
    ['Radio not found: Expected ACK (0x06), got 0x00', undefined, 'noAnswer'],
    // A read that could not read every section
    ['Could not read Zones, so nothing was loaded. Read the radio again.', undefined, 'readIncomplete'],
    // Refused before anything was sent
    ['This radio cannot write settings yet, so nothing was written.', undefined, 'refused'],
    ['Read the radio first. Writing needs the memory image from a read to preserve radio settings.', undefined, 'refused'],
    ["Refusing to write 0x1000: it would overwrite the radio's calibration data at 0x2000, which NeonPlug never writes.", undefined, 'refused'],
    ['Something nobody planned for', undefined, 'unknown'],
  ])('%s', (message, name, kind) => {
    expect(classifyRadioError(message, name)).toBe(kind);
  });
});
