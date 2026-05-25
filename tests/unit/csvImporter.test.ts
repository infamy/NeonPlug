import { describe, it, expect } from 'vitest';
import { parseCSV, getValue, getBool, getFloat, getInt, importChannelsFromCSV, importContactsFromCSV } from '../../src/services/csv/csvImporter';

// ─── parseCSV ───────────────────────────────────────────────────────────────

describe('parseCSV', () => {
  it('parses a simple two-row CSV', () => {
    const result = parseCSV('a,b,c\n1,2,3');
    expect(result).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('trims leading/trailing spaces from fields', () => {
    const result = parseCSV('  a , b , c ');
    expect(result[0]).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields containing commas', () => {
    const result = parseCSV('"hello, world",b');
    expect(result[0]).toEqual(['hello, world', 'b']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    const result = parseCSV('"say ""hi""",b');
    expect(result[0]).toEqual(['say "hi"', 'b']);
  });

  it('handles empty fields', () => {
    const result = parseCSV('a,,c');
    expect(result[0]).toEqual(['a', '', 'c']);
  });

  it('filters blank lines', () => {
    const result = parseCSV('a,b\n\n1,2\n  \n3,4');
    expect(result).toHaveLength(3);
  });

  it('handles Windows line endings (CRLF)', () => {
    const result = parseCSV('a,b\r\n1,2');
    // \r ends up trimmed as part of the field or the line split
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('a');
  });

  it('returns empty array for empty string', () => {
    expect(parseCSV('')).toEqual([]);
  });

  it('returns empty array for whitespace-only string', () => {
    expect(parseCSV('   \n  ')).toEqual([]);
  });
});

// ─── row accessor helpers ────────────────────────────────────────────────────

describe('getValue', () => {
  const headers = ['channel number', 'name', 'rx frequency'];
  const row = ['5', 'Test', '146.520'];

  it('returns the matching field value', () => {
    expect(getValue(headers, row, 'name')).toBe('Test');
  });

  it('is case-insensitive on the lookup name', () => {
    expect(getValue(headers, row, 'NAME')).toBe('Test');
  });

  it('uses partial header match', () => {
    expect(getValue(headers, row, 'rx')).toBe('146.520');
  });

  it('returns empty string when header not found', () => {
    expect(getValue(headers, row, 'nonexistent')).toBe('');
  });

  it('returns empty string when row is shorter than header index', () => {
    expect(getValue(headers, ['5'], 'rx frequency')).toBe('');
  });
});

describe('getBool', () => {
  const headers = ['flag'];

  it.each([['yes'], ['true'], ['1']])('treats "%s" as true', (val) => {
    expect(getBool(headers, [val], 'flag')).toBe(true);
  });

  it.each([['no'], ['false'], ['0'], [''], ['off']])('treats "%s" as false', (val) => {
    expect(getBool(headers, [val], 'flag')).toBe(false);
  });
});

describe('getFloat', () => {
  const headers = ['val'];

  it('parses a decimal number', () => {
    expect(getFloat(headers, ['446.09375'], 'val')).toBeCloseTo(446.09375, 5);
  });

  it('returns defaultValue for non-numeric input', () => {
    expect(getFloat(headers, ['bad'], 'val', 99)).toBe(99);
  });

  it('returns 0 by default for missing/bad input', () => {
    expect(getFloat(headers, [''], 'val')).toBe(0);
  });
});

describe('getInt', () => {
  const headers = ['val'];

  it('parses an integer', () => {
    expect(getInt(headers, ['3112345'], 'val')).toBe(3112345);
  });

  it('truncates decimals', () => {
    expect(getInt(headers, ['3112345.9'], 'val')).toBe(3112345);
  });

  it('returns defaultValue for non-numeric input', () => {
    expect(getInt(headers, ['bad'], 'val', 7)).toBe(7);
  });
});

// ─── importChannelsFromCSV ───────────────────────────────────────────────────

const CHANNEL_HEADER = 'Channel Number,Name,RX Frequency,TX Frequency,Mode,Bandwidth,Power';
const channelRow = (overrides: Record<string, string> = {}) => {
  const defaults: Record<string, string> = {
    'Channel Number': '1',
    'Name': 'Test Chan',
    'RX Frequency': '146.520',
    'TX Frequency': '146.520',
    'Mode': 'Analog',
    'Bandwidth': '25kHz',
    'Power': 'High',
  };
  const merged = { ...defaults, ...overrides };
  return Object.values(merged).join(',');
};

describe('importChannelsFromCSV', () => {
  it('fails with only a header row', () => {
    const result = importChannelsFromCSV(CHANNEL_HEADER);
    expect(result.success).toBe(false);
    expect(result.errors?.[0]).toMatch(/header row and one data row/);
  });

  it('fails on empty input', () => {
    const result = importChannelsFromCSV('');
    expect(result.success).toBe(false);
  });

  it('imports a valid minimal channel row', () => {
    const csv = `${CHANNEL_HEADER}\n${channelRow()}`;
    const result = importChannelsFromCSV(csv);
    expect(result.success).toBe(true);
    expect(result.channels).toHaveLength(1);
    const ch = result.channels![0];
    expect(ch.name).toBe('Test Chan');
    expect(ch.rxFrequency).toBeCloseTo(146.52, 3);
    expect(ch.txFrequency).toBeCloseTo(146.52, 3);
    expect(ch.mode).toBe('Analog');
  });

  it('falls back to row index when Channel Number is missing', () => {
    const csv = `Name,RX Frequency,TX Frequency\nMy Chan,146.520,146.520`;
    const result = importChannelsFromCSV(csv);
    expect(result.channels![0].number).toBe(1);
  });

  it('falls back to default name when Name column is absent', () => {
    const csv = `RX Frequency,TX Frequency\n146.520,146.520`;
    const result = importChannelsFromCSV(csv);
    expect(result.channels![0].name).toBe('Channel 1');
  });

  it('skips blank rows', () => {
    const csv = `${CHANNEL_HEADER}\n${channelRow()}\n   \n${channelRow({ 'Channel Number': '2', 'Name': 'Second' })}`;
    const result = importChannelsFromCSV(csv);
    expect(result.channels).toHaveLength(2);
  });

  it('imports multiple channels in order', () => {
    const rows = [1, 2, 3].map(n => channelRow({ 'Channel Number': String(n), 'Name': `Ch ${n}` }));
    const csv = [CHANNEL_HEADER, ...rows].join('\n');
    const result = importChannelsFromCSV(csv);
    expect(result.channels).toHaveLength(3);
    expect(result.channels!.map(c => c.number)).toEqual([1, 2, 3]);
  });

  it('header match is case-insensitive and partial', () => {
    // "rx frequency" matches column header "RX Frequency"
    const csv = `channel number,name,rx frequency,tx frequency\n5,Foo,155.340,155.340`;
    const result = importChannelsFromCSV(csv);
    expect(result.channels![0].rxFrequency).toBeCloseTo(155.34, 2);
  });

  it('getBool recognises yes/true/1 as true', () => {
    const header = `${CHANNEL_HEADER},Forbid TX,VOX,Compander`;
    const row = `${channelRow()},yes,true,1`;
    const result = importChannelsFromCSV(`${header}\n${row}`);
    const ch = result.channels![0];
    expect(ch.forbidTx).toBe(true);
    expect(ch.voxFunction).toBe(true);
    expect(ch.compander).toBe(true);
  });

  it('getBool treats no/false/0/empty as false', () => {
    const header = `${CHANNEL_HEADER},Forbid TX,VOX,Compander`;
    const row = `${channelRow()},no,false,0`;
    const result = importChannelsFromCSV(`${header}\n${row}`);
    const ch = result.channels![0];
    expect(ch.forbidTx).toBe(false);
    expect(ch.voxFunction).toBe(false);
    expect(ch.compander).toBe(false);
  });

  it('getNumber uses parseFloat (allows decimals)', () => {
    const csv = `${CHANNEL_HEADER}\n${channelRow({ 'RX Frequency': '446.09375' })}`;
    const result = importChannelsFromCSV(csv);
    expect(result.channels![0].rxFrequency).toBeCloseTo(446.09375, 5);
  });

  it('getNumber defaults to 0 for non-numeric value', () => {
    const csv = `${CHANNEL_HEADER}\n${channelRow({ 'RX Frequency': 'bad' })}`;
    const result = importChannelsFromCSV(csv);
    expect(result.channels![0].rxFrequency).toBe(0);
  });
});

// ─── importContactsFromCSV ───────────────────────────────────────────────────

const CONTACT_HEADER = 'ID,Name,DMR ID,Call Sign';
const contactRow = (overrides: Record<string, string> = {}) => {
  const defaults: Record<string, string> = {
    'ID': '1',
    'Name': 'Alice',
    'DMR ID': '3112345',
    'Call Sign': 'VE7XYZ',
  };
  return Object.values({ ...defaults, ...overrides }).join(',');
};

describe('importContactsFromCSV', () => {
  it('fails with only a header row', () => {
    const result = importContactsFromCSV(CONTACT_HEADER);
    expect(result.success).toBe(false);
  });

  it('imports a valid contact row', () => {
    const csv = `${CONTACT_HEADER}\n${contactRow()}`;
    const result = importContactsFromCSV(csv);
    expect(result.success).toBe(true);
    expect(result.contacts).toHaveLength(1);
    const c = result.contacts![0];
    expect(c.name).toBe('Alice');
    expect(c.dmrId).toBe(3112345);
    expect(c.callSign).toBe('VE7XYZ');
  });

  it('falls back to row index when no column containing "id" is present', () => {
    // Note: partial header matching means "DMR ID" would also match the 'id' lookup.
    // Use a header with no "id" substring to exercise the true fallback.
    const csv = `Name,DMR Number\nBob,9999`;
    const result = importContactsFromCSV(csv);
    expect(result.contacts![0].id).toBe(1);
  });

  it('partial header match: "id" matches the first column whose name contains "id"', () => {
    // "DMR ID" contains "id", so getNumber('id') finds it and returns its value —
    // documenting the known partial-match behaviour that the refactor must preserve.
    const csv = `Name,DMR ID\nBob,9999`;
    const result = importContactsFromCSV(csv);
    // getNumber('id') matches "DMR ID", returning 9999, not a fallback
    expect(result.contacts![0].id).toBe(9999);
  });

  it('falls back to default name when Name column is absent', () => {
    const csv = `DMR ID\n12345`;
    const result = importContactsFromCSV(csv);
    expect(result.contacts![0].name).toBe('Contact 1');
  });

  it('getNumber uses parseInt (truncates decimals)', () => {
    // DMR IDs should be integers
    const csv = `${CONTACT_HEADER}\n${contactRow({ 'DMR ID': '3112345.9' })}`;
    const result = importContactsFromCSV(csv);
    expect(result.contacts![0].dmrId).toBe(3112345);
  });

  it('callSign is undefined when column is absent', () => {
    const csv = `ID,Name,DMR ID\n1,Bob,9999`;
    const result = importContactsFromCSV(csv);
    expect(result.contacts![0].callSign).toBeUndefined();
  });

  it('imports multiple contacts', () => {
    const rows = [1, 2, 3].map(n => contactRow({ 'ID': String(n), 'Name': `Person ${n}`, 'DMR ID': String(1000 + n) }));
    const csv = [CONTACT_HEADER, ...rows].join('\n');
    const result = importContactsFromCSV(csv);
    expect(result.contacts).toHaveLength(3);
    expect(result.contacts!.map(c => c.id)).toEqual([1, 2, 3]);
  });

  it('skips blank rows', () => {
    const csv = `${CONTACT_HEADER}\n${contactRow()}\n   \n${contactRow({ 'ID': '2', 'Name': 'Bob' })}`;
    const result = importContactsFromCSV(csv);
    expect(result.contacts).toHaveLength(2);
  });
});
