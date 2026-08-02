import React, { useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { downloadHexDump, downloadBinary } from '../../utils/hexdump';
import { CollapsibleSection } from './CollapsibleSection';
import { OffsetInspector } from './OffsetInspector';
import { BOOT_IMAGE } from '../../utils/bootImage';

export const BootImagePanel: React.FC = () => {
  const { bootImageRaw } = useRadioStore();
  const [showBootImageSection, setShowBootImageSection] = useState(true);
  const [inspectBootImageOffset, setInspectBootImageOffset] = useState<string>('');

  if (!(bootImageRaw && bootImageRaw.length > 0)) return null;

  return (
        <div className="mb-6 bg-deep-gray rounded-lg border border-neon-cyan border-opacity-40 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-semibold text-neon-cyan">Boot Image (Raw)</h3>
              <span className="px-2 py-1 bg-cyan-900/30 text-neon-cyan text-xs rounded border border-neon-cyan/40">
                {bootImageRaw.length.toLocaleString()} bytes · {BOOT_IMAGE.BLOCKS} blocks
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadHexDump(bootImageRaw, 'boot-image-hexdump.txt')}
                className="px-3 py-1 text-xs text-neon-cyan hover:text-cyan-300 border border-neon-cyan/40 hover:border-neon-cyan rounded transition-colors"
                title="Download hex dump"
              >
                Hex
              </button>
              <button
                type="button"
                onClick={() => downloadBinary(bootImageRaw, 'boot-image.bin')}
                className="px-3 py-1 text-xs text-neon-cyan hover:text-cyan-300 border border-neon-cyan/40 hover:border-neon-cyan rounded transition-colors"
                title="Download binary"
              >
                Bin
              </button>
              <button
                type="button"
                onClick={() => setShowBootImageSection(!showBootImageSection)}
                className="text-sm text-neon-cyan hover:text-cyan-300"
              >
                {showBootImageSection ? '▼ Hide' : '▶ Show'}
              </button>
            </div>
          </div>
          <p className="text-cool-gray text-sm mb-4">
            Raw boot image from radio. Base address from V-Frame 0x0E (e.g. 0x150000). 153600 bytes raw BGR565, no header. Inspect to verify format/byte order.
          </p>
          {showBootImageSection && (
            <div className="space-y-6">
              <CollapsibleSection title="Offset Inspector (Boot Image)">
                <OffsetInspector
                  data={bootImageRaw}
                  idPrefix="bootimg"
                  placeholder="0x000"
                  knownOffsets={[
                    { offset: 0x000, field: 'Pixel data start (BGR565, 240×320×2)' },
                    { offset: 0x1000, field: 'Second 4KB block' },
                  ]}
                />
              </CollapsibleSection>
              <CollapsibleSection title="Hex Dump (Boot Image)">
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan/20 p-4">
                  <div className="mb-4">
                    <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={inspectBootImageOffset}
                        onChange={(e) => setInspectBootImageOffset(e.target.value)}
                        placeholder="0x000"
                        className="flex-1 px-3 py-2 bg-deep-gray border border-neon-cyan/30 rounded text-white text-sm font-mono focus:outline-none focus:border-neon-cyan"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const offset = parseInt(inspectBootImageOffset.replace(/^0x/i, ''), 16);
                          if (!isNaN(offset) && offset >= 0 && offset < bootImageRaw.length) {
                            document.getElementById(`bootimg-hex-${offset}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                          }
                        }}
                        className="px-4 py-2 bg-cyan-900/30 text-neon-cyan text-sm rounded border border-neon-cyan/30 hover:bg-cyan-900/50"
                      >
                        Go
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto max-h-96 overflow-y-auto font-mono text-xs">
                    {Array.from({ length: Math.ceil(bootImageRaw.length / 16) }, (_, row) => {
                      const offset = row * 16;
                      const rowBytes = bootImageRaw.slice(offset, offset + 16);
                      const hexBytes = Array.from(rowBytes)
                        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
                        .join(' ');
                      const ascii = Array.from(rowBytes)
                        .map(b => (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.')
                        .join('');
                      return (
                        <div
                          key={offset}
                          id={`bootimg-hex-${offset}`}
                          className="flex gap-4 py-0.5 border-b border-neon-cyan/10 hover:bg-neon-cyan/5"
                        >
                          <span className="text-cyan-300 w-16 flex-shrink-0">0x{offset.toString(16).toUpperCase().padStart(4, '0')}</span>
                          <span className="text-green-400 break-all">{hexBytes}</span>
                          <span className="text-cool-gray flex-shrink-0">{ascii}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          )}
        </div>
  );
};
