// @vitest-environment jsdom
/**
 * Every row in the channel grid must have exactly as many cells as the header.
 *
 * This is a regression test for a bug that shipped: one branch of the extra
 * column renderer returned a bare `<span>` where every sibling branch returned
 * a `<td>`. The branch only fires for `analogOnly` columns on a DIGITAL
 * channel, so analog rows were fine and digital rows were one cell short —
 * which silently shifted 21 columns left, displaying every value under the
 * wrong heading. Nothing threw, and the grid still looked plausible.
 *
 * A cell count is the cheapest possible check for that whole class of fault,
 * and it does not care which column was wrong.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { ChannelRow } from '../../src/components/channels/ChannelRow';
import { createDefaultChannel } from '../../src/utils/channelHelpers';
import { useRadioStore } from '../../src/store/radioStore';
import type { Channel, ChannelMode } from '../../src/models/Channel';

// The extra columns are declared by the RADIO, via caps.channelColumns. With no
// radio selected the set is empty and none of them render at all — so a test
// that forgets this passes without ever reaching the code it means to check.
// The DA-7X2 declares the most (22 groups) and is the radio the original bug
// was found on.
beforeEach(() => {
  useRadioStore.setState({ selectedRadioModel: 'DA-7X2', radioInfo: null });
});

afterEach(() => {
  cleanup();
  useRadioStore.setState({ selectedRadioModel: null, radioInfo: null });
});

const noop = () => {};

function renderRow(channel: Channel, analogOnly: boolean) {
  // A <tr> is only valid inside a table, and jsdom follows the parser rules —
  // rendering the row bare would silently drop the cells being counted.
  const { container } = render(
    <table>
      <tbody>
        <ChannelRow
          channel={channel}
          isSelected={false}
          analogOnly={analogOnly}
          scanLists={[]}
          rxGroups={[]}
          encryptionKeys={[]}
          talkGroups={[]}
          dmrRadioIds={[]}
          dataIndex={0}
          onCellChange={noop}
          onRowClick={noop}
          onEdit={noop}
          onClone={noop}
          onDelete={noop}
          registerRef={noop}
          measureRef={noop}
        />
      </tbody>
    </table>
  );
  return container.querySelectorAll('td').length;
}

describe('ChannelRow cell count', () => {
  const modes: ChannelMode[] = ['Analog', 'Digital', 'Fixed Analog', 'Fixed Digital'];

  it('renders the same number of cells for every channel mode', () => {
    const counts = modes.map((mode) =>
      renderRow(createDefaultChannel({ number: 1, name: 'TEST', mode }), false)
    );

    // All four modes must agree. If they do not, some branch returned a
    // non-<td> and the columns after it are displaying under the wrong header.
    expect(new Set(counts).size, `cell counts per mode: ${modes
      .map((m, i) => `${m}=${counts[i]}`)
      .join(', ')}`).toBe(1);
  });

  it('renders the same number of cells for every mode in analog-only grids', () => {
    const counts = modes.map((mode) =>
      renderRow(createDefaultChannel({ number: 1, name: 'TEST', mode }), true)
    );
    expect(new Set(counts).size, `cell counts per mode: ${modes
      .map((m, i) => `${m}=${counts[i]}`)
      .join(', ')}`).toBe(1);
  });

  it('renders fewer cells in an analog-only grid than a digital one', () => {
    const channel = createDefaultChannel({ number: 1, name: 'TEST', mode: 'Analog' });
    expect(renderRow(channel, true)).toBeLessThan(renderRow(channel, false));
  });
});
