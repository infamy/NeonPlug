import React, { useState } from 'react';
import { useChannelsStore } from '../../store/channelsStore';
import { downloadBinary } from '../../utils/hexdump';
import { downloadFile } from '../../utils/download';
import { CollapsibleSection } from './CollapsibleSection';

interface TxContactStructureReferenceProps {
  /** 0x42 = Channels 1-2048 block; 0x43 = Channels 2049+ and VFOs block. */
  variant: '0x42' | '0x43';
  data: Uint8Array;
}

export const TxContactStructureReference: React.FC<TxContactStructureReferenceProps> = ({ variant, data }) => {
  const { channels } = useChannelsStore();
  const [txContactLookupChannel, setTxContactLookupChannel] = useState<string>('');

  // Generate proposed TX Contact write data for block 0x42 (channels 1-2047)
  const generateProposedTxContact42 = (): Uint8Array | null => {
    if (!data) return null;

    // Start with a copy of current block data
    const proposedData = new Uint8Array(data);

    // Update with current channel contactId values
    for (const channel of channels) {
      if (channel.number >= 1 && channel.number <= 2047) {
        const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
        const contactId = channel.contactId ?? 0;

        const offset = (channel.number - 1) * 2;

        // Encode: high nibble is contact ID high, bit 0 is digital flag
        const contactIdHigh = (contactId >> 8) & 0x0F;
        const contactIdLow = contactId & 0xFF;
        const byte0 = (contactIdHigh << 4) | (isDigital ? 0x01 : 0x00);
        const byte1 = contactIdLow;

        proposedData[offset] = byte0;
        proposedData[offset + 1] = byte1;
      }
    }

    // Set metadata byte
    proposedData[0xFFF] = 0x42;

    return proposedData;
  };

  // Download proposed vs current comparison for a specific channel
  const downloadTxContactComparison = () => {
    if (!data) return;

    const currentData = data;
    const proposedData = generateProposedTxContact42();
    if (!proposedData) return;

    let report = 'TX Contact Block 0x42 - Current vs Proposed Comparison\n';
    report += '='.repeat(80) + '\n\n';
    report += 'Channel | Current Bytes | Current TG | Proposed Bytes | Proposed TG | Changed?\n';
    report += '-'.repeat(80) + '\n';

    for (const channel of channels) {
      if (channel.number >= 1 && channel.number <= 2047) {
        const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
        if (!isDigital) continue; // Only show digital channels

        const offset = (channel.number - 1) * 2;

        const currByte0 = currentData[offset];
        const currByte1 = currentData[offset + 1];
        const currTg = ((currByte0 >> 4) << 8) | currByte1;

        const propByte0 = proposedData[offset];
        const propByte1 = proposedData[offset + 1];
        const propTg = ((propByte0 >> 4) << 8) | propByte1;

        const changed = currByte0 !== propByte0 || currByte1 !== propByte1;

        report += `Ch ${channel.number.toString().padStart(4)} | `;
        report += `${currByte0.toString(16).padStart(2, '0')} ${currByte1.toString(16).padStart(2, '0')}`.padEnd(13) + ' | ';
        report += `${currTg}`.padEnd(10) + ' | ';
        report += `${propByte0.toString(16).padStart(2, '0')} ${propByte1.toString(16).padStart(2, '0')}`.padEnd(14) + ' | ';
        report += `${propTg}`.padEnd(11) + ' | ';
        report += changed ? 'YES <<<' : 'no';
        report += '\n';
      }
    }

    report += '\n\nChannel Store Values:\n';
    report += '-'.repeat(80) + '\n';
    for (const channel of channels) {
      if (channel.number >= 1 && channel.number <= 2047) {
        const isDigital = channel.mode === 'Digital' || channel.mode === 'Fixed Digital';
        if (!isDigital) continue;
        report += `Ch ${channel.number}: contactId=${channel.contactId}, txContactId=${channel.txContactId}, mode=${channel.mode}\n`;
      }
    }

    downloadFile(report, 'tx_contact_comparison.txt', 'text/plain');
  };

  // Shared between the 0x42 and 0x43 variants.
  const entryStructure = (
    <div>
      <h4 className="text-yellow-400 font-semibold mb-2">Entry Structure (2 bytes per channel)</h4>
      <ul className="list-disc list-inside text-cool-gray space-y-1">
        <li><span className="text-green-400 font-mono">Byte 0 bits 7-4:</span> Talk Group Index bits 11-8</li>
        <li><span className="text-green-400 font-mono">Byte 0 bits 3-1:</span> Reserved</li>
        <li><span className="text-green-400 font-mono">Byte 0 bit 0:</span> Digital Flag (1=Digital, 0=Analog)</li>
        <li><span className="text-green-400 font-mono">Byte 1:</span> Talk Group Index bits 7-0</li>
      </ul>
    </div>
  );

  return (
    <CollapsibleSection title="TX Contact Structure Reference" defaultOpen={true}>
      <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
        <div className="space-y-4 text-sm">
          {variant === '0x43' && (
            <div>
              <h4 className="text-yellow-400 font-semibold mb-2">VFO TX Contact (Fixed Offsets)</h4>
              <p className="text-xs text-cool-gray mb-2">Offsets shown are within this 4KB block (combined buffer offset - 0x1000)</p>
              <div className="font-mono text-xs space-y-1">
                {[
                  { name: 'VFO A (4001)', bufferOffset: 0x1FFA, blockOffset: 0x0FFA },
                  { name: 'VFO B (4002)', bufferOffset: 0x1FFC, blockOffset: 0x0FFC },
                ].map((vfo) => {
                  const byte0 = data[vfo.blockOffset] ?? 0;
                  const byte1 = data[vfo.blockOffset + 1] ?? 0;
                  const tgIndex = ((byte0 >> 4) << 8) | byte1;
                  const isDigital = (byte0 & 0x01) !== 0;
                  const hasData = vfo.blockOffset < data.length;
                  return (
                    <div key={vfo.name} className="flex items-center gap-2 hover:bg-yellow-900/10 py-1 px-2 rounded">
                      <span className="text-yellow-400 w-24">{vfo.name}</span>
                      <span className="text-green-400 w-16">0x{vfo.blockOffset.toString(16).toUpperCase().padStart(4, '0')}</span>
                      {hasData ? (
                        <>
                          <span className="text-yellow-300 w-16">{byte0.toString(16).toUpperCase().padStart(2, '0')} {byte1.toString(16).toUpperCase().padStart(2, '0')}</span>
                          <span className="text-white w-24">TG Index: {tgIndex}</span>
                          <span className={isDigital ? 'text-green-400' : 'text-cool-gray'}>{isDigital ? 'Digital' : 'Analog'}</span>
                        </>
                      ) : (
                        <span className="text-red-400">Offset out of bounds</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {entryStructure}
          {variant === '0x42' ? (
            <>
              <div>
                <h4 className="text-yellow-400 font-semibold mb-2">Offset Calculation</h4>
                <ul className="list-disc list-inside text-cool-gray space-y-1">
                  <li><span className="text-yellow-300 font-mono">Channels 1-2047:</span> (channel - 1) * 2</li>
                  <li><span className="text-yellow-300 font-mono">Example:</span> Channel 1 → offset 0x0000, Channel 2 → offset 0x0002</li>
                </ul>
              </div>
              <div>
                <h4 className="text-yellow-400 font-semibold mb-2">Debug Tools</h4>
                <div className="flex items-center gap-2 mb-3">
                  <button
                    onClick={downloadTxContactComparison}
                    className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-500 transition-colors text-xs font-semibold"
                  >
                    📥 Download Current vs Proposed Comparison
                  </button>
                  <button
                    onClick={() => {
                      const proposed = generateProposedTxContact42();
                      if (proposed) downloadBinary(proposed, 'proposed_block_0x42.bin');
                    }}
                    className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-500 transition-colors text-xs font-semibold"
                  >
                    📥 Download Proposed Block 0x42
                  </button>
                </div>
              </div>
              <div>
                <h4 className="text-yellow-400 font-semibold mb-2">Channel Lookup</h4>
                <div className="flex items-center gap-2 mb-3">
                  <input
                    type="number"
                    min="1"
                    max="2047"
                    placeholder="Enter channel # (1-2047)"
                    value={txContactLookupChannel}
                    onChange={(e) => setTxContactLookupChannel(e.target.value)}
                    className="w-48 bg-dark-charcoal border border-yellow-600/30 rounded px-3 py-1 text-sm text-white focus:outline-none focus:border-yellow-400"
                  />
                  {txContactLookupChannel && (() => {
                    const chNum = parseInt(txContactLookupChannel);
                    if (chNum >= 1 && chNum <= 2047) {
                      const offset = (chNum - 1) * 2;
                      const byte0 = data[offset] ?? 0;
                      const byte1 = data[offset + 1] ?? 0;
                      const tgIndex = ((byte0 >> 4) << 8) | byte1;
                      const isDigital = (byte0 & 0x01) !== 0;
                      return (
                        <div className="flex items-center gap-2 font-mono text-xs bg-yellow-900/20 px-3 py-1 rounded">
                          <span className="text-yellow-400">Ch {chNum}</span>
                          <span className="text-green-400">0x{offset.toString(16).toUpperCase().padStart(4, '0')}</span>
                          <span className="text-yellow-300">{byte0.toString(16).toUpperCase().padStart(2, '0')} {byte1.toString(16).toUpperCase().padStart(2, '0')}</span>
                          <span className="text-white font-bold">TG Index: {tgIndex}</span>
                          <span className={isDigital ? 'text-green-400 font-bold' : 'text-cool-gray'}>{isDigital ? 'Digital' : 'Analog'}</span>
                        </div>
                      );
                    }
                    return <span className="text-red-400 text-xs">Invalid channel (1-2047)</span>;
                  })()}
                </div>
              </div>
              <div>
                <h4 className="text-yellow-400 font-semibold mb-2">First 10 Channels</h4>
                <div className="font-mono text-xs space-y-1">
                  {Array.from({ length: 10 }, (_, i) => {
                    const chNum = i + 1;
                    const offset = i * 2;
                    const byte0 = data[offset] ?? 0;
                    const byte1 = data[offset + 1] ?? 0;
                    const tgIndex = ((byte0 >> 4) << 8) | byte1;
                    const isDigital = (byte0 & 0x01) !== 0;
                    const hasData = offset + 1 < data.length;
                    return (
                      <div key={i} className="flex items-center gap-2 hover:bg-yellow-900/10 py-1 px-2 rounded">
                        <span className="text-yellow-400 w-20">Ch {chNum}</span>
                        <span className="text-green-400 w-16">0x{offset.toString(16).toUpperCase().padStart(4, '0')}</span>
                        {hasData ? (
                          <>
                            <span className="text-yellow-300 w-16">{byte0.toString(16).toUpperCase().padStart(2, '0')} {byte1.toString(16).toUpperCase().padStart(2, '0')}</span>
                            <span className="text-white w-24">TG Index: {tgIndex}</span>
                            <span className={isDigital ? 'text-green-400' : 'text-cool-gray'}>{isDigital ? 'Digital' : 'Analog'}</span>
                          </>
                        ) : (
                          <span className="text-red-400">No data</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <div>
              <h4 className="text-yellow-400 font-semibold mb-2">Offset Calculation (Channels 2049+)</h4>
              <ul className="list-disc list-inside text-cool-gray space-y-1">
                <li><span className="text-yellow-300 font-mono">Formula:</span> 0x1000 + (channel & 0x7FF) * 2</li>
                <li><span className="text-yellow-300 font-mono">Example:</span> Channel 2049 → offset 0x1002</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </CollapsibleSection>
  );
};
