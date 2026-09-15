import React from 'react';
import type { SettingsFieldDescriptor } from '../../../types/settingsProfile';
import { SettingsTextField } from './SettingsTextField';
import { SettingsNumberField } from './SettingsNumberField';
import { SettingsSelectField } from './SettingsSelectField';
import { SettingsColorField } from './SettingsColorField';
import { SettingsCheckboxField } from './SettingsCheckboxField';
import { SettingsRangeField } from './SettingsRangeField';
import { SettingsBitfieldField } from './SettingsBitfieldField';
import { BUTTON } from '../../ui/controlStyles';

interface Props {
  field: SettingsFieldDescriptor;
  value: unknown;
  onChange: (value: unknown) => void;
  /** The value differs from what was last read, written or opened. */
  changed?: boolean;
  /** Put the value back to what was last read, written or opened. */
  onRevert?: () => void;
}

/**
 * Renders one settings control, with the field's documented explanation beneath
 * it when there is one, and a quiet "Changed · Revert" line once its value
 * differs from what was last read, written or opened.
 *
 * The hint is wrapped around the control rather than passed into each field
 * component: there are seven of those, and threading an optional line of text
 * through all of them to render it identically is the kind of duplication that
 * drifts.
 */
export const SettingsFieldRenderer: React.FC<Props> = ({ field, value, onChange, changed, onRevert }) => {
  const control = renderControl(field, value, onChange);
  if (!field.hint && !changed) return control;
  return (
    <div>
      {control}
      {field.hint && <p className="text-muted text-xs mt-0.5 leading-snug">{field.hint}</p>}
      {changed && (
        <p className="text-xs mt-0.5 text-neon-magenta">
          Changed
          {onRevert && (
            <>
              {' · '}
              <button type="button" onClick={onRevert} className={`${BUTTON.link} underline`}>
                Revert
              </button>
            </>
          )}
        </p>
      )}
    </div>
  );
};

function renderControl(
  field: SettingsFieldDescriptor,
  value: unknown,
  onChange: (value: unknown) => void
) {
  switch (field.type) {
    case 'text':
      return (
        <SettingsTextField
          field={field}
          value={value as string}
          onChange={onChange as (v: string) => void}
        />
      );
    case 'number':
      return (
        <SettingsNumberField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'select':
      return (
        <SettingsSelectField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'color':
      return (
        <SettingsColorField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'checkbox':
      return (
        <SettingsCheckboxField
          field={field}
          value={value as boolean}
          onChange={onChange as (v: boolean) => void}
        />
      );
    case 'range':
      return (
        <SettingsRangeField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    case 'bitfield':
      return (
        <SettingsBitfieldField
          field={field}
          value={value as number}
          onChange={onChange as (v: number) => void}
        />
      );
    default:
      return null;
  }
}
