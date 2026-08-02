import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { HexDump } from './HexDump';
import { formatHexDumpText } from '../../utils/hexdump';
import { CollapsibleSection } from './CollapsibleSection';
import { createZip, type ZipEntry } from '../../utils/zip';
import { downloadBlob } from '../../utils/download';

interface ContactBlocksPanelProps {
  showAlert: (message: string, title?: string) => void;
}

export const ContactBlocksPanel: React.FC<ContactBlocksPanelProps> = ({ showAlert }) => {
  const { rawContactBlockAddress, rawContactBlocks } = useRadioStore();
  const [showContactBlock, setShowContactBlock] = useState(true);
  const [selectedContactBlock, setSelectedContactBlock] = useState<number | null>(null);

  // Initialize selected block to first block if available
  React.useEffect(() => {
    if (rawContactBlocks.size > 0 && selectedContactBlock === null) {
      const firstBlockAddr = Array.from(rawContactBlocks.keys()).sort((a, b) => a - b)[0];
      setSelectedContactBlock(firstBlockAddr);
    }
  }, [rawContactBlocks, selectedContactBlock]);

  if (rawContactBlocks.size === 0) return null;

  return (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-yellow-400">DMR Contact Blocks</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                {rawContactBlocks.size} Block(s)
              </span>
            </div>
            <div className="flex items-center gap-2">
              {rawContactBlocks.size > 0 && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const entries: ZipEntry[] = [];

                    // Text hex dump with a contact-block header
                    const generateHexDump = (data: Uint8Array, prefix: string): string =>
                      formatHexDumpText(data, [
                        `${prefix} Block Hex Dump`,
                        `Length: ${data.length} bytes (0x${data.length.toString(16).toUpperCase()})`,
                        '='.repeat(80),
                        '',
                      ]);

                    // Add all contact blocks to zip
                    for (const [blockAddr, blockData] of rawContactBlocks.entries()) {
                      const hexDump = generateHexDump(blockData, 'CONTACTS');
                      const blockAddrHex = blockAddr.toString(16).toUpperCase().padStart(6, '0');
                      entries.push({ name: `contact-block-0x${blockAddrHex}.txt`, data: hexDump });
                      entries.push({ name: `contact-block-0x${blockAddrHex}.bin`, data: blockData });
                    }

                    // Generate and download zip
                    try {
                      const blob = await createZip(entries);
                      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                      downloadBlob(blob, `contact-blocks-${timestamp}.zip`);
                    } catch (error) {
                      console.error('Error generating zip:', error);
                      showAlert('Failed to generate zip file');
                    }
                  }}
                  className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
                  title="Download all contact blocks as zip"
                >
                  📦 Download All Blocks
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowContactBlock(!showContactBlock);
                }}
                className="text-sm text-yellow-400 hover:text-yellow-300"
              >
                {showContactBlock ? '▼ Hide' : '▶ Show'}
              </button>
            </div>
          </div>
          <p className="text-cool-gray text-sm mb-4">
            All contact blocks from contact database. Each contact is 92 bytes (0x5C).
            Use this to manually inspect the contact structure and fix parsing.
          </p>

          <div className={`space-y-6 ${showContactBlock ? '' : 'hidden'}`}>
            {/* Block Selector */}
            <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
              <label className="block text-sm text-cool-gray mb-2">Select Block</label>
              <select
                value={selectedContactBlock !== null ? selectedContactBlock : (rawContactBlockAddress !== null ? rawContactBlockAddress : '')}
                onChange={(e) => setSelectedContactBlock(parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
              >
                {Array.from(rawContactBlocks.entries())
                  .sort(([addrA], [addrB]) => addrA - addrB)
                  .map(([blockAddr]) => (
                    <option key={blockAddr} value={blockAddr}>
                      0x{blockAddr.toString(16).toUpperCase().padStart(6, '0')}
                    </option>
                  ))}
              </select>
            </div>

            {/* Hex Dump Viewer for Selected Contact Block */}
            {selectedContactBlock !== null && rawContactBlocks.has(selectedContactBlock) && (
              <CollapsibleSection title={`Hex Dump - Block 0x${selectedContactBlock.toString(16).toUpperCase().padStart(6, '0')}`}>
                <HexDump
                  data={rawContactBlocks.get(selectedContactBlock)!}
                  idPrefix={`contact-offset-${selectedContactBlock}`}
                  withOffsetJump
                  downloadName={`contact-block-0x${selectedContactBlock.toString(16).toUpperCase()}`}
                  scrollable
                />
              </CollapsibleSection>
            )}
          </div>
        </div>
  );
};
