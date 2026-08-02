import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';

interface TalkGroupsBlockDetailsProps {
  /** Metadata block 0x44 (Talk Groups) data — passed by DiagnosticsTab. */
  data: Uint8Array;
  /** Metadata block 0x0B (Quick Access Contact List) data, used for display order. */
  quickAccessData: Uint8Array | null;
}

/** Custom detail sections rendered inside the block 0x44 <MetadataBlockDisplay>. */
export const TalkGroupsBlockDetails: React.FC<TalkGroupsBlockDetailsProps> = ({ data, quickAccessData }) => {
          // Parse Talk Group entries
          const parsedEntries: Array<{
            index: number;
            offset: number;
            hasHeader: boolean;
            flag: number;
            name: string;
            contactNumber: number;
            callType: number;
            callTypeStr: string;
            rawBytes: string;
            displayOrder: number;
          }> = [];

          // Helper function to parse a single entry at a specific offset
          const parseEntryAtOffset = (startOffset: number, contactIndex: number, displayOrder: number) => {
            let offset = startOffset;
            const entryStart = offset;
            let hasHeader = false;

            // Check for header byte on first entry
            if (contactIndex === 1 && data[offset] === 0x00) {
              hasHeader = true;
              offset++;
            }

            // Read flag byte
            const flag = data[offset];
            offset++;

            // Read name (16 bytes)
            let nameLength = 0;
            for (let i = 0; i < 16; i++) {
              const byte = data[offset + i];
              if (byte === 0x00 || byte === 0xFF) break;
              nameLength++;
            }

            const nameBytes = data.slice(offset, offset + nameLength);
            const name = new TextDecoder('ascii', { fatal: false }).decode(nameBytes).trim();
            offset += 16;

            // Skip null terminator
            offset++;

            // Read contact number (3 bytes, little-endian)
            const contactNumber = data[offset] | (data[offset + 1] << 8) | (data[offset + 2] << 16);
            offset += 3;

            // Read call type
            const callType = data[offset];
            offset++;

            // Skip 2 bytes padding
            offset += 2;

            const callTypeStr = callType === 0x05 ? 'All Call' :
                              callType === 0x04 ? 'Group Call' :
                              callType === 0x03 ? 'Private Call' :
                              `Unknown (0x${callType.toString(16).toUpperCase()})`;

            // Get raw bytes for this entry
            const rawBytes = Array.from(data.slice(entryStart, offset))
              .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
              .join(' ');

            return {
              index: contactIndex,
              offset: entryStart,
              hasHeader,
              flag,
              name,
              contactNumber,
              callType,
              callTypeStr,
              rawBytes,
              displayOrder
            };
          };

          // Helper to calculate entry offset based on sequential position
          const calculateOffset = (position: number): number => {
            if (position === 1) {
              return 0; // First entry starts at 0
            }
            // Entry 1: 25 bytes (1 header + 24 data)
            // Entry 2+: 24 bytes each
            return 25 + ((position - 2) * 24);
          };

          // First, parse all entries sequentially to build a map of contactIndex → parsed entry
          const entriesByIndex = new Map<number, ReturnType<typeof parseEntryAtOffset>>();
          let entryPosition = 1;

          while (true) {
            try {
              const offset = calculateOffset(entryPosition);

              if (offset >= data.length - 24) {
                break;
              }

              // Check if this is an empty entry
              let checkOffset = offset;
              if (entryPosition === 1 && data[offset] === 0x00) {
                checkOffset++; // Skip header
              }
              const nameStartOffset = checkOffset + 1; // Skip flag byte
              if (data[nameStartOffset] === 0x00) {
                break; // Empty entry, stop parsing
              }

              // Parse this entry
              const entry = parseEntryAtOffset(offset, entryPosition, entryPosition);

              // Skip empty entries
              if (entry.name.length === 0 && entry.contactNumber === 0) {
                break;
              }

              entriesByIndex.set(entryPosition, entry);
              entryPosition++;
            } catch (e) {
              console.error(`Failed to parse entry at position ${entryPosition}:`, e);
              break;
            }
          }

          // Use block 0x0B to determine display order
          if (quickAccessData && quickAccessData.length >= 0x700) {
            // Read Index Table 1 (0x100-0x6FF) - Name sorted order
            for (let i = 0; i < Math.floor((0x700 - 0x100) / 2); i++) {
              const tableOffset = 0x100 + (i * 2);
              const contactIndex = quickAccessData[tableOffset];
              const typeByte = quickAccessData[tableOffset + 1];

              // Stop at empty entry (0xFF 0xFF)
              if (contactIndex === 0xFF && typeByte === 0xFF) {
                break;
              }

              // Get the parsed entry for this contact index
              const entry = entriesByIndex.get(contactIndex);
              if (entry) {
                // Update display order
                parsedEntries.push({
                  ...entry,
                  displayOrder: i + 1
                });
              }
            }
          } else {
            // No block 0x0B available, use sequential order
            parsedEntries.push(...Array.from(entriesByIndex.values()));
          }

          return (
            <>
              {/* Talk Group Entries Summary */}
              <CollapsibleSection title="Talk Group Entries" defaultOpen={true}>
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <p className="text-sm text-cool-gray mb-3">
                    Parsed {parsedEntries.length} Talk Group entries from metadata block 0x44 using Quick Access List (0x0B) index table.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-yellow-600/30">
                          <th className="text-left py-2 px-3 text-yellow-400">Order</th>
                          <th className="text-left py-2 px-3 text-yellow-400">ID</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Offset</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Hdr</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Flag</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Name</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Contact #</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Call Type</th>
                          <th className="text-left py-2 px-3 text-yellow-400">Raw Hex Bytes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsedEntries.map((entry) => (
                          <tr key={`${entry.displayOrder}-${entry.index}`} className="border-b border-yellow-600/10 hover:bg-yellow-900/10">
                            <td className="py-2 px-3 text-yellow-400 font-mono">{entry.displayOrder}</td>
                            <td className="py-2 px-3 text-white font-mono">{entry.index}</td>
                            <td className="py-2 px-3 text-green-400 font-mono">0x{entry.offset.toString(16).toUpperCase().padStart(4, '0')}</td>
                            <td className="py-2 px-3 text-cool-gray font-mono text-xs">
                              {entry.hasHeader ? '✓' : '-'}
                            </td>
                            <td className="py-2 px-3 text-yellow-300 font-mono">0x{entry.flag.toString(16).toUpperCase().padStart(2, '0')}</td>
                            <td className="py-2 px-3 text-white">{entry.name || '(empty)'}</td>
                            <td className="py-2 px-3 text-white font-mono">{entry.contactNumber}</td>
                            <td className="py-2 px-3 text-green-400">{entry.callTypeStr}</td>
                            <td className="py-2 px-3 text-yellow-300 font-mono text-xs break-all max-w-md">
                              {entry.rawBytes}
                            </td>
                          </tr>
                        ))}
                        {parsedEntries.length === 0 && (
                          <tr>
                            <td colSpan={9} className="py-4 px-3 text-center text-cool-gray">
                              No Talk Group entries found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CollapsibleSection>

              {/* Structure Reference */}
              <CollapsibleSection title="Block 0x44 Structure Reference">
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <div className="space-y-4 text-sm">
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Entry Structure</h4>
                      <p className="text-cool-gray mb-2">Each Talk Group entry:</p>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-green-400 font-mono">Entry 1:</span> 1 byte header (0x00) + 1 byte flag + 16 bytes name + 1 byte null + 3 bytes contact# + 1 byte call type + 2 bytes padding = 25 bytes</li>
                        <li><span className="text-green-400 font-mono">Entry 2+:</span> 1 byte flag + 16 bytes name + 1 byte null + 3 bytes contact# + 1 byte call type + 2 bytes padding = 24 bytes</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Field Details</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-yellow-300 font-mono">Header (Entry 1 only):</span> Always 0x00</li>
                        <li><span className="text-yellow-300 font-mono">Flag:</span> 0x00 = PC-created, 0x01 = Radio-created</li>
                        <li><span className="text-yellow-300 font-mono">Name:</span> 16 bytes, ASCII, null or 0xFF padded</li>
                        <li><span className="text-yellow-300 font-mono">Contact Number:</span> 3 bytes, little-endian (0-16777215)</li>
                        <li><span className="text-yellow-300 font-mono">Call Type:</span> 0x03 = Private Call, 0x04 = Group Call, 0x05 = All Call</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Parsing Method</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li><span className="text-yellow-300 font-mono">Using Block 0x0B:</span> We use Index Table 1 (at 0x100) from Quick Access Contact List (0x0B) to determine which contacts are active and their display order</li>
                        <li><span className="text-yellow-300 font-mono">Index Table Format:</span> Each entry is 2 bytes: [contact_index] [type_byte]</li>
                        <li><span className="text-yellow-300 font-mono">Contact Index:</span> Points to the specific entry in block 0x44 (0-based)</li>
                        <li><span className="text-yellow-300 font-mono">Entry Offset Calculation:</span> Entry 1 at 0x00, Entry 2+ at (25 + (index-2)*24)</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="text-yellow-400 font-semibold mb-2">Notes</h4>
                      <ul className="list-disc list-inside text-cool-gray space-y-1">
                        <li>Block size: 4096 bytes (4KB)</li>
                        <li>Metadata byte at 0xFFF: 0x44</li>
                        <li>First entry MUST have header byte for radio recognition</li>
                        <li>Entries are stored sequentially with no gaps</li>
                        <li>Empty entries have name starting with 0x00 and contact# = 0</li>
                        <li>Display order matches Index Table 1 from block 0x0B (name-sorted)</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CollapsibleSection>
            </>
          );
};
