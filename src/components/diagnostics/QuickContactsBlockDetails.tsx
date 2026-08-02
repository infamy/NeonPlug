import React from 'react';
import { CollapsibleSection } from './CollapsibleSection';

interface QuickContactsBlockDetailsProps {
  /** Metadata block 0x0B (Quick Access Contact List) data — passed by DiagnosticsTab. */
  data: Uint8Array;
}

/** Custom detail sections rendered inside the block 0x0B <MetadataBlockDisplay>. */
export const QuickContactsBlockDetails: React.FC<QuickContactsBlockDetailsProps> = ({ data }) => {
  return (
          <>
            {/* Header Information */}
            <CollapsibleSection title="Header & Counts" defaultOpen={true}>
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-yellow-600/30">
                      <th className="text-left py-2 px-3 text-yellow-400">Field</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Offset</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Size</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Value</th>
                      <th className="text-left py-2 px-3 text-yellow-400">Hex</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Total Contact Count</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x00-0x01</td>
                      <td className="py-2 px-3 text-cool-gray">2 bytes</td>
                      <td className="py-2 px-3 text-white font-semibold">
                        {data[0] | (data[1] << 8)}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono">
                        {data[0].toString(16).toUpperCase().padStart(2, '0')} {data[1].toString(16).toUpperCase().padStart(2, '0')}
                      </td>
                    </tr>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Group Call Count</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x02-0x03</td>
                      <td className="py-2 px-3 text-cool-gray">2 bytes</td>
                      <td className="py-2 px-3 text-white font-semibold">
                        {data[2] | (data[3] << 8)}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono">
                        {data[2].toString(16).toUpperCase().padStart(2, '0')} {data[3].toString(16).toUpperCase().padStart(2, '0')}
                      </td>
                    </tr>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Private Call Count</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x04</td>
                      <td className="py-2 px-3 text-cool-gray">1 byte</td>
                      <td className="py-2 px-3 text-white font-semibold">
                        {data[4]}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono">
                        {data[4].toString(16).toUpperCase().padStart(2, '0')}
                      </td>
                    </tr>
                    <tr className="border-b border-yellow-600/10">
                      <td className="py-2 px-3 text-cool-gray">Reserved</td>
                      <td className="py-2 px-3 text-green-400 font-mono">0x05-0x0F</td>
                      <td className="py-2 px-3 text-cool-gray">11 bytes</td>
                      <td className="py-2 px-3 text-cool-gray">
                        {Array.from(data.slice(5, 16)).every(b => b === 0xFF) ? '(All 0xFF)' : '(Mixed)'}
                      </td>
                      <td className="py-2 px-3 text-yellow-300 font-mono text-xs">
                        {Array.from(data.slice(5, 16)).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CollapsibleSection>

            {/* Slot Usage Bitmask */}
            <CollapsibleSection title="Slot Usage Bitmask (0x10-0x1F)">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <p className="text-sm text-cool-gray mb-3">
                  16 bytes controlling 128 slots. Each bit represents one slot (0 = used, 1 = free).
                </p>
                <div className="font-mono text-xs space-y-1">
                  {Array.from({ length: 16 }, (_, byteIdx) => {
                    const byte = data[0x10 + byteIdx];
                    const binaryStr = byte.toString(2).padStart(8, '0');
                    const usedBits = binaryStr.split('').filter(b => b === '0').length;
                    return (
                      <div key={byteIdx} className="flex items-center gap-3 hover:bg-yellow-900/10 py-1 px-2 rounded">
                        <span className="text-yellow-400 w-16">0x{(0x10 + byteIdx).toString(16).toUpperCase().padStart(2, '0')}</span>
                        <span className="text-yellow-300 w-12">{byte.toString(16).toUpperCase().padStart(2, '0')}</span>
                        <span className="text-green-400 w-20">{binaryStr}</span>
                        <span className="text-cool-gray text-xs">
                          Slots {byteIdx * 8}-{byteIdx * 8 + 7} ({usedBits} used)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CollapsibleSection>

            {/* Index Table 1 Preview */}
            <CollapsibleSection title="Index Table 1 (0x100-0x6FF) - Name Sorted">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <p className="text-sm text-cool-gray mb-3">
                  Entries sorted by name. Each entry: 2 bytes [contact_index] [type_byte]
                </p>
                <div className="font-mono text-xs">
                  <div className="flex font-semibold text-yellow-400 mb-2 pb-2 border-b border-yellow-600/30">
                    <div className="w-16">Offset</div>
                    <div className="w-24">Contact ID</div>
                    <div className="w-24">Type Byte</div>
                    <div className="w-32">Call Type</div>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {Array.from({ length: Math.min(20, Math.floor((0x700 - 0x100) / 2)) }, (_, i) => {
                      const offset = 0x100 + (i * 2);
                      const contactIndex = data[offset];
                      const typeByte = data[offset + 1];

                      // Skip if both bytes are 0xFF (empty entry)
                      if (contactIndex === 0xFF && typeByte === 0xFF) return null;

                      const callType = typeByte === 0x30 ? 'Private Call' :
                                     typeByte === 0x40 ? 'Group Call' :
                                     typeByte === 0x50 ? 'All Call' :
                                     `Unknown (0x${typeByte.toString(16).toUpperCase()})`;

                      return (
                        <div key={i} className="flex hover:bg-yellow-900/10 py-1 px-2 rounded">
                          <div className="w-16 text-yellow-400">0x{offset.toString(16).toUpperCase()}</div>
                          <div className="w-24 text-white">{contactIndex}</div>
                          <div className="w-24 text-yellow-300">0x{typeByte.toString(16).toUpperCase().padStart(2, '0')}</div>
                          <div className="w-32 text-green-400">{callType}</div>
                        </div>
                      );
                    }).filter(Boolean)}
                  </div>
                  <p className="text-xs text-cool-gray mt-2 pt-2 border-t border-yellow-600/20">
                    Showing first 20 entries. Total capacity: {Math.floor((0x700 - 0x100) / 2)} entries
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Index Table 2 Preview */}
            <CollapsibleSection title="Index Table 2 (0x740-0xCFF) - Alphabetically Sorted">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <p className="text-sm text-cool-gray mb-3">
                  Entries sorted alphabetically. Each entry: 2 bytes [contact_index] [type_byte]
                </p>
                <div className="font-mono text-xs">
                  <div className="flex font-semibold text-yellow-400 mb-2 pb-2 border-b border-yellow-600/30">
                    <div className="w-16">Offset</div>
                    <div className="w-24">Contact ID</div>
                    <div className="w-24">Type Byte</div>
                    <div className="w-32">Call Type</div>
                  </div>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {Array.from({ length: Math.min(20, Math.floor((0xD00 - 0x740) / 2)) }, (_, i) => {
                      const offset = 0x740 + (i * 2);
                      const contactIndex = data[offset];
                      const typeByte = data[offset + 1];

                      // Skip if both bytes are 0xFF (empty entry)
                      if (contactIndex === 0xFF && typeByte === 0xFF) return null;

                      const callType = typeByte === 0x30 ? 'Private Call' :
                                     typeByte === 0x40 ? 'Group Call' :
                                     typeByte === 0x50 ? 'All Call' :
                                     `Unknown (0x${typeByte.toString(16).toUpperCase()})`;

                      return (
                        <div key={i} className="flex hover:bg-yellow-900/10 py-1 px-2 rounded">
                          <div className="w-16 text-yellow-400">0x{offset.toString(16).toUpperCase()}</div>
                          <div className="w-24 text-white">{contactIndex}</div>
                          <div className="w-24 text-yellow-300">0x{typeByte.toString(16).toUpperCase().padStart(2, '0')}</div>
                          <div className="w-32 text-green-400">{callType}</div>
                        </div>
                      );
                    }).filter(Boolean)}
                  </div>
                  <p className="text-xs text-cool-gray mt-2 pt-2 border-t border-yellow-600/20">
                    Showing first 20 entries. Total capacity: {Math.floor((0xD00 - 0x740) / 2)} entries
                  </p>
                </div>
              </div>
            </CollapsibleSection>

            {/* Structure Reference */}
            <CollapsibleSection title="Structure Reference">
              <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                <div className="space-y-4 text-sm">
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-2">Memory Layout</h4>
                    <ul className="list-disc list-inside text-cool-gray space-y-1">
                      <li><span className="text-green-400 font-mono">0x0000-0x000F</span>: Header (16 bytes)</li>
                      <li><span className="text-green-400 font-mono">0x0010-0x001F</span>: Slot Usage Bitmask (16 bytes, 128 slots, 0=used, 1=free)</li>
                      <li><span className="text-green-400 font-mono">0x0100-0x06FF</span>: Index Table 1 - Name Sorted (768 entries max)</li>
                      <li><span className="text-green-400 font-mono">0x0740-0x0CFF</span>: Index Table 2 - Alphabetically Sorted (704 entries max)</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-2">Type Byte Values</h4>
                    <ul className="list-disc list-inside text-cool-gray space-y-1">
                      <li><span className="text-yellow-300 font-mono">0x30</span>: Private Call</li>
                      <li><span className="text-yellow-300 font-mono">0x40</span>: Group Call</li>
                      <li><span className="text-yellow-300 font-mono">0x50</span>: All Call</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-yellow-400 font-semibold mb-2">Update Requirements</h4>
                    <p className="text-cool-gray mb-2">When adding a Talk Group:</p>
                    <ul className="list-disc list-inside text-cool-gray space-y-1">
                      <li>Update Metadata 0x44 with Talk Group entry data</li>
                      <li>Update Metadata 0x0B:
                        <ul className="list-circle list-inside ml-6 mt-1 space-y-1">
                          <li>Increment total count at 0x00-0x01</li>
                          <li>Update Group Call count at 0x02-0x03 (if Group Call)</li>
                          <li>Clear bit in bitmask at 0x10-0x1F (0=used, 1=free)</li>
                          <li>Append entry to Index Table 1 at 0x100+</li>
                          <li>Insert entry (sorted) in Index Table 2 at 0x740+</li>
                        </ul>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          </>
  );
};
