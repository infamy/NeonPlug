/**
 * What went wrong in a read or write, in terms of what the user can do next.
 *
 * Every failure used to open "Connection Failed" with a USB checklist: a
 * cancelled port picker, a port another tab holds, a radio that never answered,
 * and a write refused before a byte was sent. Each needs a different next step,
 * and for a refusal the checklist sends the user after a cable that is fine.
 */

export type RadioErrorKind = 'cancelled' | 'portBusy' | 'noAnswer' | 'readIncomplete' | 'refused' | 'unknown';

/**
 * `name` is the DOMException name when there is one. Chrome's port and device
 * pickers throw NotFoundError when the user closes them, but Web Bluetooth also
 * throws it for real failures ("Bluetooth adapter not available."), which were
 * closed without a word. So the name alone isn't a cancel: the message must say so.
 */
export function classifyRadioError(message: string, name?: string): RadioErrorKind {
  const m = message.toLowerCase();
  if (/cancel|no port selected/.test(m) || (name === 'NotFoundError' && m.trim() === '')) return 'cancelled';
  if (m.includes('nothing was loaded')) return 'readIncomplete';
  if (/in use|already open|busy|locked streams|failed to open serial port/.test(m)) return 'portBusy';
  if (/refus|nothing was written|read the radio first|cannot write|no (channels|zones) to write|too many channels|would exceed/.test(m)) {
    return 'refused';
  }
  if (/timeout|timed out|no reply|not found: expected|handshake failed|failed: expected|did not acknowledge|closed unexpectedly|ended unexpectedly/.test(m)) {
    return 'noAnswer';
  }
  return 'unknown';
}
