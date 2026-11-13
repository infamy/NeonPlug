import React, { useState } from 'react';
import { formatPlural } from '../../../utils/formatPlural';
import { useImportStores } from '../../../hooks/useImportStores';
import { getNextChannelNumber, selectionCardClass } from '../../../utils/importHelpers';
import {
  describeRepeater,
  generateAmateurRepeaterChannels,
  type AmateurRepeater,
} from '../../../services/amateurRepeaterChannels';
import { SelectAllButtons } from '../SelectAllButtons';
import { Button } from '../../ui/Button';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';

interface AmateurRepeaterSourceProps {
  repeaters: AmateurRepeater[];
  onError: (msg: string) => void;
  onGenerationResult: (r: { channels: number; zones: number }) => void;
}

/** Analog FM amateur repeaters found near the search, from HearHam via data.ferritefw.dev. */
export const AmateurRepeaterSource: React.FC<AmateurRepeaterSourceProps> = ({ repeaters, onError, onGenerationResult }) => {
  const { channels, setChannels, zones, setZones } = useImportStores();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  if (repeaters.length === 0) return null;

  const toggle = (index: number) => {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
  };

  const handleAdd = () => {
    const chosen = [...selected].sort((a, b) => a - b).map((i) => repeaters[i]).filter(Boolean);
    if (chosen.length === 0) {
      onError('Please select at least one repeater');
      return;
    }
    onError('');
    const result = generateAmateurRepeaterChannels(getNextChannelNumber(channels), chosen);
    setChannels([...channels, ...result.channels]);
    setZones([...zones, ...result.zones]);
    onGenerationResult({ channels: result.channels.length, zones: result.zones.length });
    setSelected(new Set());
  };

  return (
    <Card padding="tight" className="mb-4">
      <SectionTitle as="h3" size="lg" className="mb-4">Amateur Repeaters</SectionTitle>
      <div className="flex justify-between items-center mb-4">
        <SectionTitle as="h4" size="md">
          Found {repeaters.length} {formatPlural(repeaters.length, 'Repeater')}
        </SectionTitle>
        <SelectAllButtons
          onSelectAll={() => setSelected(new Set(repeaters.map((_, i) => i)))}
          onDeselectAll={() => setSelected(new Set())}
        />
      </div>
      <div className="space-y-2 max-h-96 overflow-y-auto mb-4">
        {repeaters.map((r, index) => (
          <div
            key={`${r.name}|${r.mhz}|${r.lat}|${r.lon}`}
            className={selectionCardClass(selected.has(index))}
            onClick={() => toggle(index)}
          >
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.has(index)}
                onChange={() => toggle(index)}
                onClick={(e) => e.stopPropagation()}
                className="mr-2"
              />
              <span className="font-semibold text-neon-cyan">{r.name}</span>
              <span className="text-sm text-cool-gray">{describeRepeater(r)}</span>
              <span className="text-xs text-cool-gray ml-auto">{r.distance.toFixed(1)} miles away</span>
            </div>
          </div>
        ))}
      </div>
      {selected.size > 0 && (
        <Button onClick={handleAdd} variant="accent" className="w-full">
          Add {selected.size} {formatPlural(selected.size, 'Repeater')}
        </Button>
      )}
      <p className="text-xs text-cool-gray mt-2">
        Repeater data from HearHam.com (user-contributed), via data.ferritefw.dev. Check a repeater's tone before you
        rely on it.
      </p>
    </Card>
  );
};
