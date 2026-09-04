import React, { useState, useEffect } from 'react';
import { isVFOChannel, getVFOIdentifier } from '../../utils/vfoChannels';
import type { Channel } from '../../models/Channel';
import type { ScanList } from '../../models/ScanList';
import type { RXGroup } from '../../models/RXGroup';
import type { EncryptionKey } from '../../models/EncryptionKey';
import type { QuickContact } from '../../models/QuickContact';
import type { DMRRadioID } from '../../models/DMRRadioID';
import { CTCSS_FREQUENCIES, DCS_CODES, formatCTCSSFrequency, formatDCSCode } from '../../utils/ctcssConstants';
import { isNoTxFrequency, isRxInNoTxBand } from '../../services/validation/frequencyValidator';
import type { ChannelColumnGroup } from '../../types/radioCapabilities';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { powerLevelsFor, powerAbbrev, nextPowerLevel } from '../../utils/powerLevels';
import {
  extraColumnsFor,
  extraColumnTitle,
  type ExtraChannelColumn,
} from './extraChannelColumns';

// Re-exported so existing importers keep working; the numbers now derive from
// the radio's channel count rather than being hardcoded in three places.
export { isVFOChannel, getVFOIdentifier };

export const isDigitalMode = (mode: Channel['mode']): boolean =>
  mode === 'Digital' || mode === 'Fixed Digital';

// Frequency input component that only updates parent on blur (prevents cursor jumping)
interface FrequencyInputProps {
  value: number;
  onChange: (value: number) => void;
  className?: string;
}

const FrequencyInput: React.FC<FrequencyInputProps> = ({ value, onChange, className }) => {
  const [localValue, setLocalValue] = useState(value.toFixed(4));

  // Sync local value when prop changes (e.g., when channel changes)
  useEffect(() => {
    setLocalValue(value.toFixed(4));
  }, [value]);

  const handleBlur = () => {
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed) && parsed > 0) {
      onChange(parsed);
      setLocalValue(parsed.toFixed(4));
    } else {
      // Reset to original value if invalid
      setLocalValue(value.toFixed(4));
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onBlur={handleBlur}
      className={className}
    />
  );
};

export type CellChangeHandler = (
  channelNumber: number,
  field: keyof Channel,
  value: string | number | boolean | Channel['rxCtcssDcs']
) => void;

interface ChannelRowProps {
  channel: Channel;
  isSelected: boolean;
  analogOnly: boolean;
  scanLists: ScanList[];
  rxGroups: RXGroup[];
  encryptionKeys: EncryptionKey[];
  talkGroups: QuickContact[];
  dmrRadioIds: DMRRadioID[];
  /** Virtualizer item index; stamped as data-index for dynamic row measurement. */
  dataIndex: number;
  onCellChange: CellChangeHandler;
  onRowClick: (channelNumber: number, e: React.MouseEvent) => void;
  onEdit: (channel: Channel) => void;
  onClone: (channel: Channel) => void;
  onDelete: (channel: Channel) => void;
  /** Keeps the parent's number → row-element map for scroll/highlight effects. */
  registerRef: (channelNumber: number, el: HTMLTableRowElement | null) => void;
  /** Virtualizer measureElement — rows vary in height (stacked tone selects). */
  measureRef: (el: HTMLTableRowElement | null) => void;
}

const NUMBER_INPUT_CLASS =
  'bg-transparent border border-neon-cyan border-opacity-30 rounded px-1 py-1 text-white ' +
  'focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center';

const SELECT_CLASS =
  'bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white ' +
  'focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full max-w-[130px]';

/**
 * One cell of a declarative extra column.
 *
 * Split out so the editor kinds live in one place: the grid already had four
 * near-identical hand-written variants of each, and every new field copied one
 * of them again.
 */
export const ExtraColumnCell: React.FC<{
  column: ExtraChannelColumn;
  channel: Channel;
  onCellChange: CellChangeHandler;
}> = ({ column, channel, onCellChange }) => {
  const title = extraColumnTitle(column);
  // Same convention the DMR block uses: a field with no meaning on this channel
  // shows a dash rather than a control that would write a value the radio
  // ignores.
  if (column.analogOnly && isDigitalMode(channel.mode)) {
    // MUST be a <td>, like every other branch here. Returning a bare <span>
    // left the row one cell short of the header, so every extra column to the
    // right of this one rendered under its neighbour's heading on digital rows.
    return (
      <td className="px-2 py-2 text-center" title={title}>
        <span className="text-cool-gray text-xs">-</span>
      </td>
    );
  }
  if (column.digitalOnly && !isDigitalMode(channel.mode)) {
    return (
      <td className="px-2 py-2 text-center" title={title}>
        <span className="text-cool-gray text-xs">-</span>
      </td>
    );
  }
  const raw = channel[column.field];

  if (column.editor.kind === 'boolean') {
    return (
      <td className="px-2 py-2 text-center" title={title}>
        <input
          type="checkbox"
          checked={raw === true}
          onChange={(e) => onCellChange(channel.number, column.field, e.target.checked)}
          className="checkbox-theme"
          title={title}
        />
      </td>
    );
  }

  if (column.editor.kind === 'select') {
    const options = column.editor.options;
    const index = typeof raw === 'number' ? raw : 0;
    return (
      <td className="px-2 py-2" title={title}>
        <select
          value={String(index)}
          onChange={(e) => onCellChange(channel.number, column.field, parseInt(e.target.value) || 0)}
          className={SELECT_CLASS}
          title={title}
        >
          {options.map((label, i) => (
            <option key={label} value={String(i)}>
              {label}
            </option>
          ))}
          {/* A value outside the known list is shown rather than silently
              snapped to option 0 — on this radio an unexpected index means the
              vocabulary is incomplete, which is worth seeing. */}
          {index >= options.length && (
            <option value={String(index)} disabled>
              {index} (unknown)
            </option>
          )}
        </select>
      </td>
    );
  }

  const { min, max, suffix } = column.editor;
  return (
    <td className="px-2 py-2" title={title}>
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={min}
          max={max}
          value={typeof raw === 'number' ? raw : 0}
          onChange={(e) => {
            const parsed = parseInt(e.target.value);
            onCellChange(channel.number, column.field, Number.isNaN(parsed) ? 0 : parsed);
          }}
          className={NUMBER_INPUT_CLASS}
          title={title}
        />
        {suffix && <span className="text-cool-gray text-[10px]">{suffix}</span>}
      </div>
    </td>
  );
};

/**
 * One channel row. Memoized so that a single-cell edit re-renders only the
 * edited row (the store preserves object identity for untouched channels),
 * and virtualizer scrolling doesn't re-render the already-mounted rows.
 */
export const ChannelRow: React.FC<ChannelRowProps> = React.memo(({
  channel,
  isSelected,
  analogOnly,
  scanLists,
  rxGroups,
  encryptionKeys,
  talkGroups,
  dmrRadioIds,
  dataIndex,
  onCellChange,
  onRowClick,
  onEdit,
  onClone,
  onDelete,
  registerRef,
  measureRef,
}) => {
  const showColorCode = isDigitalMode(channel.mode);
  const handleCellChange = onCellChange;
  const { caps } = useRadioCapabilities();
  const powerOrder = powerLevelsFor(caps);
  // Optional column groups, matched one-for-one with the headers in
  // ChannelsTable. A cell gated differently from its header silently shifts
  // every column after it, so the two lists are pinned by test.
  const declaredColumns = new Set(caps?.channelColumns ?? []);
  const hasColumn = (g: ChannelColumnGroup) => declaredColumns.has(g);

  return (
    <tr
      data-index={dataIndex}
      ref={(el) => {
        registerRef(channel.number, el);
        measureRef(el);
      }}
      onMouseDown={(e) => {
        if (e.shiftKey && !(e.target as HTMLElement).closest('input, button, select')) {
          e.preventDefault();
        }
      }}
      onClick={(e) => onRowClick(channel.number, e)}
      className={`border-b border-neon-cyan border-opacity-20 transition-colors cursor-pointer ${
        isSelected
          ? 'bg-neon-cyan bg-opacity-20'
          : 'hover:bg-deep-gray hover:bg-opacity-50'
      }`}
    >
      <td className={`px-2 py-2 sticky left-0 z-10 min-w-[28px] w-[28px] ${isSelected ? 'bg-neon-cyan bg-opacity-20' : 'bg-deep-gray'}`} title={isVFOChannel(channel.number) ? 'VFO' : 'Click = one; Shift+click = range; Alt+click = add/remove'} />
      <td className={`px-2 py-2 text-white sticky left-[28px] z-10 text-sm font-medium ${isSelected ? 'bg-neon-cyan bg-opacity-20' : 'bg-deep-gray'}`}>
        {isVFOChannel(channel.number) ? getVFOIdentifier(channel.number) : channel.number}
      </td>
      <td className={`px-2 py-2 sticky left-[68px] z-10 ${isSelected ? 'bg-neon-cyan bg-opacity-20' : 'bg-deep-gray'}`}>
        <input
          type="text"
          value={isVFOChannel(channel.number) ? '' : channel.name}
          onChange={(e) => handleCellChange(channel.number, 'name', e.target.value)}
          disabled={isVFOChannel(channel.number)}
          className={`bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs ${
            isVFOChannel(channel.number)
              ? 'text-cool-gray cursor-not-allowed'
              : 'text-white'
          }`}
          maxLength={16}
          placeholder={isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : ''}
        />
      </td>
      <td className="px-2 py-2">
        <FrequencyInput
          value={channel.rxFrequency}
          onChange={(val) => handleCellChange(channel.number, 'rxFrequency', val)}
          className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
        />
      </td>
      <td className="px-1 py-2 align-middle">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!(isRxInNoTxBand(channel.rxFrequency) && isNoTxFrequency(channel.txFrequency))) {
              handleCellChange(channel.number, 'txFrequency', channel.rxFrequency);
            }
          }}
          disabled={isRxInNoTxBand(channel.rxFrequency) && isNoTxFrequency(channel.txFrequency)}
          className="p-1 rounded border border-neon-cyan border-opacity-30 text-xs font-bold disabled:opacity-40 disabled:text-cool-gray disabled:border-opacity-20 disabled:cursor-not-allowed text-neon-cyan hover:bg-neon-cyan hover:bg-opacity-10 disabled:hover:bg-transparent"
          title={isRxInNoTxBand(channel.rxFrequency) && isNoTxFrequency(channel.txFrequency) ? 'Receive-only (no TX)' : 'Copy RX to TX'}
          aria-label="Copy RX to TX"
        >
          →
        </button>
      </td>
      <td className="px-2 py-2">
        {isRxInNoTxBand(channel.rxFrequency) && isNoTxFrequency(channel.txFrequency) ? (
          <input
            type="text"
            readOnly
            disabled
            value=""
            placeholder=""
            title="Receive-only (no TX)"
            aria-label="No transmit"
            className="w-full text-xs rounded px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-20 text-cool-gray opacity-60 cursor-not-allowed"
          />
        ) : (
          <FrequencyInput
            value={channel.txFrequency}
            onChange={(val) => handleCellChange(channel.number, 'txFrequency', val)}
            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
          />
        )}
      </td>
      {!analogOnly && (
        <td className="px-2 py-2 text-center">
          <button
            onClick={() => {
              const modeOrder = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];
              const currentIndex = modeOrder.indexOf(channel.mode);
              const nextIndex = (currentIndex + 1) % modeOrder.length;
              const newMode = modeOrder[nextIndex] as Channel['mode'];
              // Auto-set bandwidth to Narrow when switching to Digital
              if ((newMode === 'Digital' || newMode === 'Fixed Digital') && channel.bandwidth === '25kHz') {
                handleCellChange(channel.number, 'bandwidth', '12.5kHz');
              }
              handleCellChange(channel.number, 'mode', newMode);
            }}
            className="w-10 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
            title={channel.mode}
          >
            {channel.mode === 'Analog' || channel.mode === 'Fixed Analog' ? 'Ana' : 'Dig'}
          </button>
        </td>
      )}
      <td className="px-2 py-2 text-center">
        <button
          onClick={() => {
            // Driven by the radio's declared levels, not a fixed list. With a
            // hardcoded three-entry list, indexOf('Turbo') is -1 and the cycle
            // wraps to Low - silently downgrading a Turbo channel on one click.
            handleCellChange(channel.number, 'power', nextPowerLevel(channel.power, powerOrder));
          }}
          className="w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
          title={channel.power}
        >
          {powerAbbrev(channel.power)}
        </button>
      </td>
      <td className="px-2 py-2 text-center">
        <button
          onClick={() => {
            if (!isDigitalMode(channel.mode)) {
              handleCellChange(channel.number, 'bandwidth', channel.bandwidth === '25kHz' ? '12.5kHz' : '25kHz');
            }
          }}
          disabled={isDigitalMode(channel.mode)}
          className={`w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors ${
            isDigitalMode(channel.mode)
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-opacity-80 hover:border-neon-cyan'
          }`}
          title={isDigitalMode(channel.mode) ? 'Locked to Narrow (12.5kHz) for Digital' : (channel.bandwidth === '25kHz' ? 'Wide (25kHz)' : 'Narrow (12.5kHz)')}
        >
          {isDigitalMode(channel.mode) ? 'N' : (channel.bandwidth === '25kHz' ? 'W' : 'N')}
        </button>
      </td>
      <td className="px-2 py-2 text-center">
        <input
          type="checkbox"
          checked={channel.forbidTx}
          onChange={(e) => {
            const next = e.target.checked;
            if (!next && isRxInNoTxBand(channel.rxFrequency) && isNoTxFrequency(channel.txFrequency)) return;
            handleCellChange(channel.number, 'forbidTx', next);
          }}
          className="checkbox-theme"
        />
      </td>
      <td className="px-2 py-2">
        {isDigitalMode(channel.mode) ? (
          <span className="text-cool-gray text-xs text-center block">-</span>
        ) : (
          <div className="flex flex-col gap-1">
            <select
              value={channel.rxCtcssDcs.type}
              onChange={(e) => {
                const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                handleCellChange(channel.number, 'rxCtcssDcs', {
                  ...channel.rxCtcssDcs,
                  type,
                  value: type === 'None' ? undefined : channel.rxCtcssDcs.value,
                });
              }}
              className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
            >
              <option value="None">None</option>
              <option value="CTCSS">CTCSS</option>
              <option value="DCS">DCS</option>
            </select>
            {channel.rxCtcssDcs.type === 'CTCSS' && (
              <select
                value={channel.rxCtcssDcs.value || ''}
                onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                  ...channel.rxCtcssDcs,
                  value: e.target.value ? parseFloat(e.target.value) : undefined,
                })}
                className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
              >
                <option value="">Select...</option>
                {channel.rxCtcssDcs.value && !CTCSS_FREQUENCIES.includes(channel.rxCtcssDcs.value) && (
                  <option value={channel.rxCtcssDcs.value}>
                    {formatCTCSSFrequency(channel.rxCtcssDcs.value)} (Custom)
                  </option>
                )}
                {CTCSS_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {formatCTCSSFrequency(freq)}
                  </option>
                ))}
              </select>
            )}
            {channel.rxCtcssDcs.type === 'DCS' && (
              <div className="flex gap-1">
                <select
                  value={channel.rxCtcssDcs.value || ''}
                  onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                    ...channel.rxCtcssDcs,
                    value: e.target.value ? parseInt(e.target.value) : undefined,
                  })}
                  className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                >
                  <option value="">Select...</option>
                  {channel.rxCtcssDcs.value && !DCS_CODES.includes(channel.rxCtcssDcs.value) && (
                    <option value={channel.rxCtcssDcs.value}>
                      {formatDCSCode(channel.rxCtcssDcs.value, channel.rxCtcssDcs.polarity)} (Custom)
                    </option>
                  )}
                  {DCS_CODES.map((code) => (
                    <option key={code} value={code}>
                      {formatDCSCode(code)}
                    </option>
                  ))}
                </select>
                <select
                  value={channel.rxCtcssDcs.polarity || 'N'}
                  onChange={(e) => handleCellChange(channel.number, 'rxCtcssDcs', {
                    ...channel.rxCtcssDcs,
                    polarity: e.target.value as 'N' | 'P',
                  })}
                  className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                  disabled={!channel.rxCtcssDcs.value}
                >
                  <option value="N">N</option>
                  <option value="P">P</option>
                </select>
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-2 py-2">
        {isDigitalMode(channel.mode) ? (
          <span className="text-cool-gray text-xs text-center block">-</span>
        ) : (
          <div className="flex flex-col gap-1">
            <select
              value={channel.txCtcssDcs.type}
              onChange={(e) => {
                const type = e.target.value as 'CTCSS' | 'DCS' | 'None';
                handleCellChange(channel.number, 'txCtcssDcs', {
                  ...channel.txCtcssDcs,
                  type,
                  value: type === 'None' ? undefined : channel.txCtcssDcs.value,
                });
              }}
              className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
            >
              <option value="None">None</option>
              <option value="CTCSS">CTCSS</option>
              <option value="DCS">DCS</option>
            </select>
            {channel.txCtcssDcs.type === 'CTCSS' && (
              <select
                value={channel.txCtcssDcs.value || ''}
                onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                  ...channel.txCtcssDcs,
                  value: e.target.value ? parseFloat(e.target.value) : undefined,
                })}
                className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs"
              >
                <option value="">Select...</option>
                {channel.txCtcssDcs.value && !CTCSS_FREQUENCIES.includes(channel.txCtcssDcs.value) && (
                  <option value={channel.txCtcssDcs.value}>
                    {formatCTCSSFrequency(channel.txCtcssDcs.value)} (Custom)
                  </option>
                )}
                {CTCSS_FREQUENCIES.map((freq) => (
                  <option key={freq} value={freq}>
                    {formatCTCSSFrequency(freq)}
                  </option>
                ))}
              </select>
            )}
            {channel.txCtcssDcs.type === 'DCS' && (
              <div className="flex gap-1">
                <select
                  value={channel.txCtcssDcs.value || ''}
                  onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                    ...channel.txCtcssDcs,
                    value: e.target.value ? parseInt(e.target.value) : undefined,
                  })}
                  className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                >
                  <option value="">Select...</option>
                  {channel.txCtcssDcs.value && !DCS_CODES.includes(channel.txCtcssDcs.value) && (
                    <option value={channel.txCtcssDcs.value}>
                      {formatDCSCode(channel.txCtcssDcs.value, channel.txCtcssDcs.polarity)} (Custom)
                    </option>
                  )}
                  {DCS_CODES.map((code) => (
                    <option key={code} value={code}>
                      {formatDCSCode(code)}
                    </option>
                  ))}
                </select>
                <select
                  value={channel.txCtcssDcs.polarity || 'N'}
                  onChange={(e) => handleCellChange(channel.number, 'txCtcssDcs', {
                    ...channel.txCtcssDcs,
                    polarity: e.target.value as 'N' | 'P',
                  })}
                  className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs"
                  disabled={!channel.txCtcssDcs.value}
                >
                  <option value="N">N</option>
                  <option value="P">P</option>
                </select>
              </div>
            )}
          </div>
        )}
      </td>
      {hasColumn('loneWorker') && (
        <td className="px-2 py-2 text-center" title="Lone Worker">
          <input
            type="checkbox"
            checked={channel.loneWorker}
            onChange={(e) => handleCellChange(channel.number, 'loneWorker', e.target.checked)}
            className="checkbox-theme"
            title="Lone Worker"
          />
        </td>
      )}
      <td className="px-2 py-2">
        <select
          value={channel.scanListId}
          onChange={(e) => handleCellChange(channel.number, 'scanListId', parseInt(e.target.value) || 0)}
          className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full max-w-[120px]"
        >
          <option value={0}>None</option>
          {scanLists.map((scanList, index) => (
            <option key={scanList.name} value={index + 1}>
              {scanList.name}
            </option>
          ))}
        </select>
      </td>
      {hasColumn('freeToAir') && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={channel.forbidTalkaround}
            onChange={(e) => handleCellChange(channel.number, 'forbidTalkaround', e.target.checked)}
            className="checkbox-theme"
          />
        </td>
      )}
      {hasColumn('emergency') && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={channel.emergencyIndicator}
            onChange={(e) => handleCellChange(channel.number, 'emergencyIndicator', e.target.checked)}
            className="checkbox-theme"
          />
        </td>
      )}
      {hasColumn('emergency') && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={channel.emergencyAck}
            onChange={(e) => handleCellChange(channel.number, 'emergencyAck', e.target.checked)}
            className="checkbox-theme"
          />
        </td>
      )}
      {hasColumn('emergency') && (
        <td className="px-2 py-2">
          <input
            type="number"
            min="0"
            max="31"
            value={channel.emergencySystemId}
            onChange={(e) => handleCellChange(channel.number, 'emergencySystemId', parseInt(e.target.value) || 0)}
            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-1 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
          />
        </td>
      )}
      {hasColumn('aprs') && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={channel.aprsReceive}
            onChange={(e) => handleCellChange(channel.number, 'aprsReceive', e.target.checked)}
            className="checkbox-theme"
          />
        </td>
      )}
      {hasColumn('aprs') && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={channel.aprsReportMode === 'Digital'}
            onChange={(e) => handleCellChange(channel.number, 'aprsReportMode', e.target.checked ? 'Digital' : 'Off')}
            className="checkbox-theme"
          />
        </td>
      )}
      {hasColumn('vox') && (
        <td className="px-2 py-2 text-center">
          {isDigitalMode(channel.mode) ? (
            <span className="text-cool-gray text-xs">-</span>
          ) : (
            <input
              type="checkbox"
              checked={channel.voxFunction}
              onChange={(e) => handleCellChange(channel.number, 'voxFunction', e.target.checked)}
              className="checkbox-theme"
            />
          )}
        </td>
      )}
      {hasColumn('audioProcessing') && (
        <td className="px-2 py-2 text-center" title="Scramble">
          <input
            type="checkbox"
            checked={channel.scramble}
            onChange={(e) => handleCellChange(channel.number, 'scramble', e.target.checked)}
            className="checkbox-theme"
            title="Scramble"
          />
        </td>
      )}
      {hasColumn('audioProcessing') && (
        <td className="px-2 py-2 text-center" title="Compander">
          <input
            type="checkbox"
            checked={channel.compander}
            onChange={(e) => handleCellChange(channel.number, 'compander', e.target.checked)}
            className="checkbox-theme"
            title="Compander"
          />
        </td>
      )}
      {hasColumn('audioProcessing') && (
        <td className="px-2 py-2 text-center" title="Talkback">
          <input
            type="checkbox"
            checked={channel.talkback}
            onChange={(e) => handleCellChange(channel.number, 'talkback', e.target.checked)}
            className="checkbox-theme"
            title="Talkback"
          />
        </td>
      )}
      {hasColumn('audioProcessing') && (
        <td className="px-2 py-2 text-center" title="Compander Dup">
          <input
            type="checkbox"
            checked={channel.companderDup}
            onChange={(e) => handleCellChange(channel.number, 'companderDup', e.target.checked)}
            className="checkbox-theme"
            title="Compander Dup"
          />
        </td>
      )}
      {hasColumn('squelch') && (
        <td className="px-2 py-2">
          <input
            type="number"
            min="0"
            max="255"
            value={channel.squelchLevel}
            onChange={(e) => handleCellChange(channel.number, 'squelchLevel', parseInt(e.target.value) || 0)}
            className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-1 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
          />
        </td>
      )}
      {hasColumn('pttId') && (
        <td className="px-2 py-2 text-center">
          {isDigitalMode(channel.mode) ? (
            <span className="text-cool-gray text-xs">-</span>
          ) : (
            <input
              type="checkbox"
              checked={channel.pttIdDisplay}
              onChange={(e) => handleCellChange(channel.number, 'pttIdDisplay', e.target.checked)}
              className="checkbox-theme"
            />
          )}
        </td>
      )}
      {hasColumn('pttId') && (
        <td className="px-2 py-2">
          {isDigitalMode(channel.mode) ? (
            <span className="text-cool-gray text-xs text-center block">-</span>
          ) : (
            <input
              type="number"
              min="0"
              max="63"
              value={channel.pttId}
              onChange={(e) => handleCellChange(channel.number, 'pttId', parseInt(e.target.value) || 0)}
              className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-1 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
            />
          )}
        </td>
      )}
      {hasColumn('vox') && (
        <td className="px-2 py-2 text-center">
          <input
            type="checkbox"
            checked={channel.voxRelated}
            onChange={(e) => handleCellChange(channel.number, 'voxRelated', e.target.checked)}
            className="checkbox-theme"
          />
        </td>
      )}
      {hasColumn('squelch') && (
        <td className="px-2 py-2">
          {isDigitalMode(channel.mode) ? (
            <span className="text-cool-gray text-xs text-center block">-</span>
          ) : (
            <select
              value={channel.rxSquelchMode}
              onChange={(e) => handleCellChange(channel.number, 'rxSquelchMode', e.target.value)}
              className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
            >
              <option value="Carrier/CTC">Carrier/CTC</option>
              <option value="Optional">Optional</option>
              <option value="CTC&Opt">CTC&Opt</option>
              <option value="CTC|Opt">CTC|Opt</option>
            </select>
          )}
        </td>
      )}
      {hasColumn('stepFrequency') && (
        <td className="px-2 py-2">
          <select
            value={channel.stepFrequency}
            onChange={(e) => handleCellChange(channel.number, 'stepFrequency', parseInt(e.target.value) || 0)}
            className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
          >
            <option value={0}>2.5K</option>
            <option value={1}>5K</option>
            <option value={2}>6.25K</option>
            <option value={3}>10K</option>
            <option value={4}>12.5K</option>
            <option value={5}>25K</option>
            <option value={6}>50K</option>
            <option value={7}>100K</option>
          </select>
        </td>
      )}
      {hasColumn('signalType') && (
        <td className="px-2 py-2">
          {isDigitalMode(channel.mode) ? (
            <span className="text-cool-gray text-xs text-center block">-</span>
          ) : (
            <select
              value={channel.signalingType}
              onChange={(e) => handleCellChange(channel.number, 'signalingType', e.target.value)}
              className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
            >
              <option value="None">None</option>
              <option value="DTMF">DTMF</option>
              <option value="Two Tone">2Tone</option>
              <option value="Five Tone">5Tone</option>
              <option value="MDC1200">MDC</option>
            </select>
          )}
        </td>
      )}
      {hasColumn('pttId') && (
        <td className="px-2 py-2">
          <select
            value={channel.pttIdType}
            onChange={(e) => handleCellChange(channel.number, 'pttIdType', e.target.value)}
            className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full"
          >
            <option value="Off">Off</option>
            <option value="BOT">BOT</option>
            <option value="EOT">EOT</option>
            <option value="Both">Both</option>
          </select>
        </td>
      )}
      {/* Digital-only fields - hidden for analog-only radios */}
      {!analogOnly && (
        <>
          <td className="px-2 py-2">
            {showColorCode ? (
              <input
                type="number"
                min="0"
                max="15"
                value={channel.colorCode}
                onChange={(e) => handleCellChange(channel.number, 'colorCode', parseInt(e.target.value) || 0)}
                className="bg-transparent border border-neon-cyan border-opacity-30 rounded px-1 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan w-full text-xs text-center"
              />
            ) : (
              <span className="text-cool-gray text-xs text-center block">-</span>
            )}
          </td>
          <td className="px-2 py-2">
            {showColorCode ? (
              <select
                value={channel.rxGroupListId ?? 0}
                onChange={(e) => handleCellChange(channel.number, 'rxGroupListId', parseInt(e.target.value) || 0)}
                className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full max-w-[140px]"
              >
                <option value={0}>None</option>
                {rxGroups
                  .filter(group => group.index < 63) // RX Group List ID is 0-63, so valid indices are 0-62
                  .map((group) => (
                    <option key={group.index} value={group.index + 1}>
                      {group.name}
                    </option>
                  ))}
              </select>
            ) : (
              <span className="text-cool-gray text-xs text-center block">-</span>
            )}
          </td>
          <td className="px-2 py-2 text-center">
            {showColorCode ? (
              <button
                onClick={() => {
                  // slotOperation: 0 = TS1, 1 = TS2 (stored at 0x1D bit 4)
                  // Toggle between 0 and 1
                  const currentSlot = channel.slotOperation ?? 0;
                  const newSlot = currentSlot === 0 ? 1 : 0; // Toggle: 0→1, 1→0
                  handleCellChange(channel.number, 'slotOperation', newSlot);
                }}
                className="w-8 h-7 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white hover:bg-opacity-80 hover:border-neon-cyan focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs font-medium transition-colors"
                title={`Slot ${(channel.slotOperation ?? 0) === 0 ? 1 : 2}`}
              >
                {(channel.slotOperation ?? 0) === 0 ? 1 : 2}
              </button>
            ) : (
              <span className="text-cool-gray text-xs text-center block">-</span>
            )}
          </td>
          {hasColumn('encryption') && (
            <td className="px-2 py-2 text-center">
              {showColorCode ? (
                <input
                  type="checkbox"
                  checked={channel.encryption ?? false}
                  onChange={(e) => handleCellChange(channel.number, 'encryption', e.target.checked)}
                  className="checkbox-theme"
                  title="Encryption"
                />
              ) : (
                <span className="text-cool-gray text-xs">-</span>
              )}
            </td>
          )}
          {hasColumn('encryption') && (
            <td className="px-2 py-2">
              {showColorCode ? (
                <select
                  value={channel.encryptionId ?? 0}
                  onChange={(e) => handleCellChange(channel.number, 'encryptionId', parseInt(e.target.value) || 0)}
                  className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full max-w-[120px]"
                  title="Encryption Key"
                >
                  <option value={0}>None</option>
                  {encryptionKeys
                    .filter(key => key.id >= 1 && key.id <= 8 && key.name.trim() !== '')
                    .map((key) => (
                      <option key={key.entryNumber} value={key.id}>
                        {key.name || `Key ${key.id}`}
                      </option>
                    ))}
                </select>
              ) : (
                <span className="text-cool-gray text-xs text-center block">-</span>
              )}
            </td>
          )}
          {hasColumn('tdma') && (
            <td className="px-2 py-2 text-center">
              {showColorCode ? (
                <input
                  type="checkbox"
                  checked={channel.tdmaDirectMode ?? false}
                  onChange={(e) => handleCellChange(channel.number, 'tdmaDirectMode', e.target.checked)}
                  className="checkbox-theme"
                  title="TDMA Direct Mode"
                />
              ) : (
                <span className="text-cool-gray text-xs">-</span>
              )}
            </td>
          )}
          {hasColumn('confirmations') && (
            <td className="px-2 py-2 text-center">
              {showColorCode ? (
                <input
                  type="checkbox"
                  checked={channel.shortDataConfirm ?? false}
                  onChange={(e) => handleCellChange(channel.number, 'shortDataConfirm', e.target.checked)}
                  className="checkbox-theme"
                  title="Short Data Confirm"
                />
              ) : (
                <span className="text-cool-gray text-xs">-</span>
              )}
            </td>
          )}
          {hasColumn('confirmations') && (
            <td className="px-2 py-2 text-center">
              {showColorCode ? (
                <input
                  type="checkbox"
                  checked={channel.privateConfirm ?? false}
                  onChange={(e) => handleCellChange(channel.number, 'privateConfirm', e.target.checked)}
                  className="checkbox-theme"
                  title="Private Confirm"
                />
              ) : (
                <span className="text-cool-gray text-xs">-</span>
              )}
            </td>
          )}
          <td className="px-2 py-2">
            {showColorCode ? (
              <select
                value={String(channel.dmrRadioIdIndex ?? 255)}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  // 255 = None, store as 255 (will be converted to 0xFF when encoding)
                  handleCellChange(channel.number, 'dmrRadioIdIndex', value);
                }}
                className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full max-w-[150px]"
                title="DMR Radio ID Index for TX"
              >
                <option value="255">None</option>
                {dmrRadioIds.map((radioId) => {
                  // Use 0-based index directly (0=first entry, 1=second entry, etc.)
                  return (
                    <option key={radioId.index} value={String(radioId.index)}>
                      {radioId.name} (ID: {radioId.dmrId})
                    </option>
                  );
                })}
                {/* Show current value even if it's not in the list (e.g., deleted radio ID) */}
                {channel.dmrRadioIdIndex !== undefined && channel.dmrRadioIdIndex !== 255 && !dmrRadioIds.find(r => r.index === channel.dmrRadioIdIndex) && (
                  <option value={String(channel.dmrRadioIdIndex)} disabled>
                    Index {channel.dmrRadioIdIndex} (not found)
                  </option>
                )}
              </select>
            ) : (
              <span className="text-cool-gray text-xs text-center block">-</span>
            )}
          </td>
        </>
      )}
      {/* Radio-specific extras. Same source array as the headers in
          ChannelsTable, so the two cannot drift apart. */}
      {extraColumnsFor(declaredColumns).map((c) => (
        <ExtraColumnCell
          key={c.field}
          column={c}
          channel={channel}
          onCellChange={handleCellChange}
        />
      ))}
      {/* Common fields - work for both */}
      <td className="px-2 py-2">
        {showColorCode ? (
          <select
            value={channel.contactId}
            onChange={(e) => handleCellChange(channel.number, 'contactId', parseInt(e.target.value) || 0)}
            className="bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-2 py-1 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan text-xs w-full max-w-[150px]"
          >
            <option value={0}>None</option>
            {talkGroups.map((tg) => {
              const callTypeLabel = tg.callType === 0x05 ? 'All' : tg.callType === 0x04 ? 'Grp' : tg.callType === 0x03 ? 'Prv' : '?';
              return (
                <option key={tg.index} value={tg.index}>
                  {tg.name} [{callTypeLabel}] ({tg.contactNumber})
                </option>
              );
            })}
          </select>
        ) : (
          <span className="text-cool-gray text-xs text-center block">-</span>
        )}
      </td>
      <td className={`px-2 py-2 text-center sticky right-0 z-10 ${isSelected ? 'bg-neon-cyan bg-opacity-20' : 'bg-deep-gray'}`}>
        <div className="flex items-center justify-center gap-1">
          <button
            onClick={() => onEdit(channel)}
            className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-neon-cyan border border-neon-cyan border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
            title={`Edit ${isVFOChannel(channel.number) ? `VFO ${getVFOIdentifier(channel.number)}` : `channel ${channel.number}`}`}
          >
            ✎
          </button>
          {!isVFOChannel(channel.number) && (
            <button
              onClick={() => onClone(channel)}
              className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-neon-magenta border border-neon-magenta border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
              title={`Clone channel ${channel.number}`}
            >
              ⧉
            </button>
          )}
          {!isVFOChannel(channel.number) && (
            <button
              onClick={() => onDelete(channel)}
              className="px-1.5 py-0.5 text-xs text-cool-gray hover:text-red-400 border border-red-600 border-opacity-0 hover:border-opacity-30 rounded transition-colors opacity-60 hover:opacity-100"
              title={`Delete channel ${channel.number}`}
            >
              ×
            </button>
          )}
        </div>
      </td>
    </tr>
  );
});

ChannelRow.displayName = 'ChannelRow';
