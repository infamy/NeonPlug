/**
 * The two settings bytes that decide which picture the radio actually shows.
 *
 * A picture can be written perfectly and never appear, because these two bytes
 * select between the built-in screen, the custom text and each custom image.
 * That failure looks exactly like a failed write from the outside, which is why
 * the selected value is surfaced next to the pictures themselves.
 *
 * Both live in the 0x160-byte settings block and are declared in
 * `settingsMap.ts`; the meanings below are the same values that map's `options`
 * lists, kept here so UI can reason about them by name instead of by number.
 */

/** `powerOnInterface`, settings offset 0x006 (vendor `StartDspSet`). */
export const POWER_ON_INTERFACE = {
  DEFAULT: 0,
  CUSTOM_CHAR: 1,
  CUSTOM_PICTURE: 2,
} as const;

/**
 * `standbyBkPicture`, settings offset 0x0c1 (vendor `bkpic`).
 *
 * VERIFIED from the CPS sweep for 0 and 2: rdt offset 0x011a6, Default ->
 * Custom2 wrote `00` -> `02`. Index 1 was never observed — the sweep's {END}
 * jumped straight to the last item — so CUSTOM_1 is by elimination.
 */
export const STANDBY_BK_PICTURE = {
  DEFAULT: 0,
  CUSTOM_1: 1,
  CUSTOM_2: 2,
} as const;

export type D890ImageKindLike = 'boot' | 'bk1' | 'bk2';

export interface ImageDisplayState {
  /** True when the radio is currently set to show THIS picture. */
  shown: boolean;
  /** What showing it would mean, e.g. 'Shown at power-on'. */
  role: string;
  /** Why it is not shown, or null when it is. */
  reason: string | null;
  /** The settings field that decides, for pointing the user at it. */
  setting: string;
}

/**
 * Whether the radio will display a given picture, from the decoded settings.
 *
 * Returns null when the settings have not been read — "we do not know" and
 * "not shown" must not render the same, or a user with no codeplug loaded is
 * told their picture is disabled.
 */
export function imageDisplayState(
  kind: D890ImageKindLike,
  radioSpecific: Record<string, unknown> | undefined
): ImageDisplayState | null {
  if (!radioSpecific) return null;

  if (kind === 'boot') {
    const iface = radioSpecific.powerOnInterface;
    if (typeof iface !== 'number') return null;
    const shown = iface === POWER_ON_INTERFACE.CUSTOM_PICTURE;
    return {
      shown,
      role: 'Shown at power-on',
      setting: 'Power-on Interface',
      reason: shown
        ? null
        : iface === POWER_ON_INTERFACE.CUSTOM_CHAR
          ? 'Power-on Interface is Custom Char, so the text is shown instead'
          : 'Power-on Interface is Default Interface',
    };
  }

  const bk = radioSpecific.standbyBkPicture;
  if (typeof bk !== 'number') return null;
  const wants = kind === 'bk1' ? STANDBY_BK_PICTURE.CUSTOM_1 : STANDBY_BK_PICTURE.CUSTOM_2;
  const shown = bk === wants;
  return {
    shown,
    role: 'Shown on standby',
    setting: 'Standby BK Picture',
    reason: shown
      ? null
      : bk === STANDBY_BK_PICTURE.DEFAULT
        ? 'Standby BK Picture is Default'
        : `Standby BK Picture selects ${bk === STANDBY_BK_PICTURE.CUSTOM_1 ? 'Custom1' : 'Custom2'}`,
  };
}
