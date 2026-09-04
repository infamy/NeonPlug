import React, { useState } from 'react';
import { SectionTitle } from '../ui/SectionTitle';
import { useRadioStore } from '../../store/radioStore';
import { D890_POWER_ON, type D890PowerOnDisplay } from '../../radios/d890uv/powerOnDisplay';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';

/**
 * The custom power-on screen: two text lines and the power-on password.
 *
 * A settings area rather than part of the pictures block. The text and the boot
 * picture are alternatives to each other, but only one of them is a 40 KB image
 * read on demand — these are three short strings in the codeplug, and burying
 * them under "Boot & Standby Backgrounds" meant nobody found them.
 *
 * They live at 0x3500900, OUTSIDE the 0x160-byte settings block that
 * `settingsMap.ts` covers, which is why they are an area and not profile fields.
 *
 * ⚠️ The password is the radio's power-on lock. Shown in clear because the
 * vendor CPS shows it in clear on the same tab and because a user who cannot
 * read it back cannot recover a radio they locked — it is not a credential of
 * the user's that we are choosing to expose.
 */

/** Which of the three power-on interfaces the settings block currently selects. */
export const POWER_ON_INTERFACE = {
  DEFAULT: 0,
  CUSTOM_CHAR: 1,
  CUSTOM_PICTURE: 2,
} as const;

const FieldRow: React.FC<{
  label: string;
  hint: string;
  value: string;
  maxLength: number;
  onChange: (v: string) => void;
}> = ({ label, hint, value, maxLength, onChange }) => (
  <div>
    <label className="block text-cool-gray text-xs mb-1">{label}</label>
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 bg-deep-gray border-panel rounded text-white
                 font-mono text-sm focus:border-neon-cyan focus:outline-none"
    />
    <p className="text-muted text-xs mt-1">
      {hint} · {value.length}/{maxLength}
    </p>
  </div>
);

export const D890PowerOnArea: React.FC = () => {
  const { tables, setTable } = useRadioStore();
  const { settings } = useRadioSettingsStore();
  const [showPassword, setShowPassword] = useState(false);

  const display = tables.powerOnDisplay;
  if (!display) return null;

  const set = (patch: Partial<D890PowerOnDisplay>) =>
    setTable('powerOnDisplay', { ...display, ...patch });

  const iface = (settings?.radioSpecific as Record<string, unknown> | undefined)
    ?.powerOnInterface;
  const showingText = iface === POWER_ON_INTERFACE.CUSTOM_CHAR;

  return (
    <div>
      <SectionTitle as="h4" size="sm">Power-on Screen</SectionTitle>
      <p className="text-cool-gray text-xs mb-4">
        The two lines the radio shows at power on, and the power-on password.
        {/* Stated rather than implied: editing text while the radio is set to
            show a picture is legal, it just will not be visible. */}
        {' '}Whether the text or the boot picture appears is set by{' '}
        <span className="text-white">Power-on Interface</span> above.
      </p>

      {iface !== undefined && !showingText && (
        <p className="mb-4 text-xs text-amber-400">
          Power-on Interface is not set to <em>Custom Char</em>, so this text will
          not be shown at power on.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <FieldRow
          label="Line 1"
          hint="Top line"
          value={display.line1}
          maxLength={D890_POWER_ON.TEXT_CHARS}
          onChange={(line1) => set({ line1 })}
        />
        <FieldRow
          label="Line 2"
          hint="Bottom line"
          value={display.line2}
          maxLength={D890_POWER_ON.TEXT_CHARS}
          onChange={(line2) => set({ line2 })}
        />
        <div>
          <label className="block text-cool-gray text-xs mb-1">Power-on Password</label>
          <div className="flex gap-2">
            <input
              type={showPassword ? 'text' : 'password'}
              value={display.password}
              maxLength={D890_POWER_ON.PASSWORD_CHARS}
              onChange={(e) => set({ password: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1.5 bg-deep-gray border-panel rounded
                         text-white font-mono text-sm focus:border-neon-cyan focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="px-2 text-xs border border-panel text-muted rounded hover:text-white"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="text-muted text-xs mt-1">
            {/* The encoder writes this as ASCII while the lines are UTF-16 —
                a non-ASCII password would be silently mangled into one the
                radio will not accept, locking the user out. */}
            Up to {D890_POWER_ON.PASSWORD_CHARS} characters · {display.password.length}/
            {D890_POWER_ON.PASSWORD_CHARS}
            {/[^\x20-\x7e]/.test(display.password) && (
              <span className="text-amber-400"> · only plain ASCII is stored</span>
            )}
          </p>
        </div>
      </div>
    </div>
  );
};
