import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { HexDump } from './HexDump';

export const ContactWriteBlocksPanel: React.FC = () => {
  const { rawContactBlockAddress, writeBlockData } = useRadioStore();
  const [showContactWriteBlocks, setShowContactWriteBlocks] = useState(false);
  const [expandedContactBlocks, setExpandedContactBlocks] = useState<Set<number>>(new Set());

  if (!(writeBlockData.size > 0 && rawContactBlockAddress !== null)) return null;

  return (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-yellow-400">Contact Write Blocks</h3>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                {writeBlockData.size} Block(s)
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowContactWriteBlocks(!showContactWriteBlocks);
              }}
              className="text-sm text-yellow-400 hover:text-yellow-300"
            >
              {showContactWriteBlocks ? '▼ Hide' : '▶ Show'}
            </button>
          </div>
          <p className="text-cool-gray text-sm mb-4">
            All contact blocks that were written to the radio. Each block is 4KB (0x1000 bytes).
            Use this to verify contact data is being written correctly.
          </p>

          <div className={`space-y-4 ${showContactWriteBlocks ? '' : 'hidden'}`}>
            {Array.from(writeBlockData.entries())
              .sort(([addrA], [addrB]) => addrA - addrB)
              .map(([blockAddr, blockInfo]) => {
                const isExpanded = expandedContactBlocks.has(blockAddr);
                const ENTRY_SIZE = 0x5C; // 92 bytes per contact
                const BLOCK_SIZE = 0x1000; // 4KB

                // Calculate which contacts are in this block
                // Contacts start at baseAddr + 0x10, where baseAddr is the first contact block address
                // But we need to account for the fact that contacts can span blocks
                const contactsStartAddr = rawContactBlockAddress + 0x10;
                const blockEndAddr = blockAddr + BLOCK_SIZE;

                // Calculate contact indices in this block
                const firstContactInBlock = Math.max(0, Math.ceil((blockAddr - contactsStartAddr) / ENTRY_SIZE));
                const lastContactInBlock = Math.floor((blockEndAddr - contactsStartAddr - 1) / ENTRY_SIZE);

                return (
                  <div key={blockAddr} className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h4 className="text-lg font-semibold text-yellow-400">
                          Block at 0x{blockAddr.toString(16).toUpperCase()}
                        </h4>
                        <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
                          Metadata: 0x{blockInfo.metadata.toString(16).toUpperCase().padStart(2, '0')}
                        </span>
                        {firstContactInBlock <= lastContactInBlock && (
                          <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
                            Contacts: {firstContactInBlock} - {lastContactInBlock}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const newExpanded = new Set(expandedContactBlocks);
                          if (isExpanded) {
                            newExpanded.delete(blockAddr);
                          } else {
                            newExpanded.add(blockAddr);
                          }
                          setExpandedContactBlocks(newExpanded);
                        }}
                        className="text-sm text-yellow-400 hover:text-yellow-300"
                      >
                        {isExpanded ? '▼ Hide' : '▶ Show'} Hex
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="mt-4">
                        <HexDump
                          data={blockInfo.data}
                          idPrefix={`contact-write-offset-${blockAddr}`}
                          withOffsetJump
                          downloadName={`contact-write-block-0x${blockAddr.toString(16).toUpperCase()}`}
                          scrollable
                        />
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
  );
};
