import { describe, it, expect } from 'vitest';
import {
  codeplugToJsonSafe,
  jsonSafeToCodeplug,
  assertReadableFormat,
  checkFormatCompatibility,
  readWithFormatOverride,
  CodeplugFormatError,
  CODEPLUG_FORMAT_VERSION,
  type CodeplugData,
} from '../../src/services/codeplugExport';

function emptyCodeplug(): CodeplugData {
  return {
    channels: [],
    zones: [],
    scanLists: [],
    contacts: [],
    digitalEmergencies: [],
    digitalEmergencyConfig: null,
    analogEmergencies: [],
    radioSettings: null,
    radioInfo: null,
    messages: [],
    radioIds: [],
    quickContacts: [],
    rxGroups: [],
    encryptionKeys: [],
    exportDate: '2026-08-05T00:00:00.000Z',
  };
}

describe('codeplug format version — write path', () => {
  it('stamps formatVersion, app version and commit', () => {
    const out = codeplugToJsonSafe(emptyCodeplug());
    expect(out.formatVersion).toBe(CODEPLUG_FORMAT_VERSION);
    expect(out).toHaveProperty('appVersion');
    expect(out).toHaveProperty('appCommit');
  });

  it('mirrors formatVersion into the legacy `version` field', () => {
    // Builds predating formatVersion read `version`; keeping both means an older
    // NeonPlug can still open a file written by a newer one.
    const out = codeplugToJsonSafe(emptyCodeplug());
    expect(out.version).toBe(CODEPLUG_FORMAT_VERSION);
  });

  it('ignores a caller-supplied version rather than trusting it', () => {
    // Four call sites used to hardcode '1.0.0'; the writer is now the only
    // authority so a future bump cannot be silently ignored.
    const out = codeplugToJsonSafe({ ...emptyCodeplug(), version: '99.0.0' });
    expect(out.formatVersion).toBe(CODEPLUG_FORMAT_VERSION);
    expect(out.version).toBe(CODEPLUG_FORMAT_VERSION);
  });
});

describe('codeplug format version — read path', () => {
  it('reads a file with no version at all as legacy 1.0.0', () => {
    const data = jsonSafeToCodeplug({ channels: [], zones: [] });
    expect(data.version).toBe('1.0.0');
  });

  it('reads a pre-formatVersion file that only has `version`', () => {
    const data = jsonSafeToCodeplug({ version: '1.0.0', channels: [] });
    expect(data.version).toBe('1.0.0');
  });

  it('prefers formatVersion when both are present', () => {
    // Both readable, and they disagree — so the result proves which one won.
    const data = jsonSafeToCodeplug({ formatVersion: '0.9.0', version: '1.0.0' });
    expect(data.version).toBe('0.9.0');
  });

  it('gates on formatVersion, not the legacy mirror', () => {
    // A newer file written by a build that still mirrors `version` must not slip
    // through on the strength of the old field.
    expect(() => jsonSafeToCodeplug({ formatVersion: '2.0.0', version: '1.0.0' })).toThrow(
      CodeplugFormatError
    );
  });

  it('carries provenance through when present, undefined when not', () => {
    expect(jsonSafeToCodeplug({ appVersion: '0.2.0', appCommit: 'abc1234' })).toMatchObject({
      appVersion: '0.2.0',
      appCommit: 'abc1234',
    });
    const bare = jsonSafeToCodeplug({});
    expect(bare.appVersion).toBeUndefined();
    expect(bare.appCommit).toBeUndefined();
  });

  it('warns on a newer minor rather than silently dropping its fields', () => {
    // Was previously accepted outright, which meant unknown fields were dropped
    // and the file re-stamped 1.0.0 with no signal. Now it stops and asks.
    expect(() => jsonSafeToCodeplug({ formatVersion: '1.9.9' })).toThrow(CodeplugFormatError);
  });

  it('opens a newer minor once the user has accepted the warning', () => {
    expect(() =>
      jsonSafeToCodeplug({ formatVersion: '1.9.9' }, { allowNewerFormat: true })
    ).not.toThrow();
  });

  it('refuses a newer major instead of guessing at changed fields', () => {
    expect(() => jsonSafeToCodeplug({ formatVersion: '2.0.0' })).toThrow(
      /cannot be opened by this build/i
    );
  });

  it('never lets the override bypass a newer major', () => {
    // The whole point of the major/minor split: a major bump means existing
    // fields changed meaning, so there is nothing safe to show.
    expect(() =>
      jsonSafeToCodeplug({ formatVersion: '2.0.0' }, { allowNewerFormat: true })
    ).toThrow(CodeplugFormatError);
  });

  it('round-trips write → read', () => {
    const data = jsonSafeToCodeplug(codeplugToJsonSafe(emptyCodeplug()));
    expect(data.version).toBe(CODEPLUG_FORMAT_VERSION);
  });
});

describe('assertReadableFormat', () => {
  it('allows equal and older versions', () => {
    expect(() => assertReadableFormat('0.9.0')).not.toThrow();
    expect(() => assertReadableFormat('1.0.0')).not.toThrow();
  });

  it('blocks higher majors', () => {
    expect(() => assertReadableFormat('2.0.0')).toThrow();
    expect(() => assertReadableFormat('10.0.0')).toThrow();
  });

  it('treats an unparseable version as legacy rather than exploding', () => {
    expect(() => assertReadableFormat('not-a-version')).not.toThrow();
  });

  it('marks a newer minor overridable and a newer major not', () => {
    // This flag is the entire contract with the UI: it decides whether the user
    // is offered "Open anyway" or only "Update NeonPlug".
    const minor = (() => {
      try { assertReadableFormat('1.5.0'); } catch (e) { return e as CodeplugFormatError; }
    })();
    const major = (() => {
      try { assertReadableFormat('2.0.0'); } catch (e) { return e as CodeplugFormatError; }
    })();
    expect(minor).toBeInstanceOf(CodeplugFormatError);
    expect(major).toBeInstanceOf(CodeplugFormatError);
    expect(minor!.canOverride).toBe(true);
    expect(major!.canOverride).toBe(false);
  });

  it('warns that saving discards the newer fields, not just that they are hidden', () => {
    // The loss happens on save, not on load — the warning has to say so for the
    // override to be informed consent.
    try {
      assertReadableFormat('1.5.0');
      throw new Error('expected a throw');
    } catch (e) {
      expect((e as Error).message).toMatch(/permanently discarded/i);
    }
  });
});

describe('checkFormatCompatibility', () => {
  it('classifies each direction', () => {
    expect(checkFormatCompatibility('1.0.0')).toBe('ok');
    expect(checkFormatCompatibility('0.9.0')).toBe('ok');
    expect(checkFormatCompatibility('1.0.9')).toBe('ok'); // patch never matters
    expect(checkFormatCompatibility('1.1.0')).toBe('newer-minor');
    expect(checkFormatCompatibility('2.0.0')).toBe('newer-major');
    // A lower major always wins, even with a high minor.
    expect(checkFormatCompatibility('0.99.0')).toBe('ok');
  });
});

describe('readWithFormatOverride', () => {
  const newerMinor = () => jsonSafeToCodeplug({ formatVersion: '1.5.0' });

  it('does not prompt when the file is readable', async () => {
    let asked = false;
    const result = await readWithFormatOverride(
      async () => 'loaded',
      async () => { asked = true; return true; }
    );
    expect(result).toBe('loaded');
    expect(asked).toBe(false);
  });

  it('retries with the override once the user accepts', async () => {
    const result = await readWithFormatOverride(
      async (opts) => jsonSafeToCodeplug({ formatVersion: '1.5.0' }, opts),
      async () => true
    );
    expect(result?.version).toBe('1.5.0');
  });

  it('returns null — not an error — when the user declines', async () => {
    const result = await readWithFormatOverride(
      async (opts) => jsonSafeToCodeplug({ formatVersion: '1.5.0' }, opts),
      async () => false
    );
    expect(result).toBeNull();
  });

  it('rethrows a newer major without ever prompting', async () => {
    let asked = false;
    await expect(
      readWithFormatOverride(
        async (opts) => jsonSafeToCodeplug({ formatVersion: '2.0.0' }, opts),
        async () => { asked = true; return true; }
      )
    ).rejects.toThrow(CodeplugFormatError);
    expect(asked).toBe(false);
  });

  it('rethrows unrelated errors untouched', async () => {
    await expect(
      readWithFormatOverride(
        async () => { throw new Error('corrupt zip'); },
        async () => true
      )
    ).rejects.toThrow('corrupt zip');
    expect(newerMinor).toThrow(CodeplugFormatError);
  });
});
