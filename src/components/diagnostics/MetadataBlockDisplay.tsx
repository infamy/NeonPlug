import React, { useMemo, useState, ReactNode } from 'react';

interface MetadataBlockDisplayProps {
  metadata: number;
  blockData: Uint8Array | null;
  blockAddress: number | null;
  description?: string;
  children?: ReactNode;
  downloadHexDump: (data: Uint8Array, filename: string) => void;
  downloadBinary: (data: Uint8Array, filename: string) => void;
}

export const MetadataBlockDisplay: React.FC<MetadataBlockDisplayProps> = ({
  metadata,
  blockData,
  blockAddress,
  description,
  children,
  downloadHexDump,
  downloadBinary,
}) => {
  // All hooks must be called before any conditional returns
  const [showBlock, setShowBlock] = useState(false);
  const [showHexDump, setShowHexDump] = useState(false);
  const [inspectOffset, setInspectOffset] = useState<string>('');

  const metadataHex = metadata.toString(16).toUpperCase().padStart(2, '0');
  const blockId = `block${metadataHex}`;

  // Memoize hex dump rows (only computed if blockData exists)
  const hexDumpRows = useMemo(() => {
    if (!blockData) return [];
    
    const bytesPerRow = 16;
    const rows = [];
    
    for (let i = 0; i < blockData.length; i += bytesPerRow) {
      const offset = i;
      const rowBytes = blockData.slice(i, i + bytesPerRow);
      
      const offsetHex = offset.toString(16).toUpperCase().padStart(4, '0');
      const hexBytes = Array.from(rowBytes)
        .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');
      const hexPadding = '   '.repeat(bytesPerRow - rowBytes.length);
      const ascii = Array.from(rowBytes)
        .map(b => {
          const char = String.fromCharCode(b);
          return (b >= 32 && b <= 126) ? char : '.';
        })
        .join('');
      
      rows.push(
        <div key={offset} id={`${blockId}-${offset}`} className="flex border-b border-yellow-600/10 hover:bg-yellow-900/10 py-1">
          <div className="w-20 text-yellow-400 px-2">{offsetHex}</div>
          <div className="w-[52ch] text-yellow-300 px-2">{hexBytes}{hexPadding}</div>
          <div className="w-16 text-green-400 px-2 ml-4">{ascii}</div>
        </div>
      );
    }
    
    return rows;
  }, [blockData, blockId]);

  // Now we can have conditional returns after all hooks are called
  if (!blockData) {
    return (
      <div className="mb-6">
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
          <h3 className="text-lg font-semibold text-yellow-400 mb-2">Metadata Block 0x{metadataHex}</h3>
          <p className="text-cool-gray text-sm">Block 0x{metadataHex} not found. Read from radio to view this block.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-xl font-semibold text-yellow-400">Metadata Block 0x{metadataHex}</h3>
          <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
            Metadata 0x{metadataHex}
          </span>
          {blockAddress !== null && (
            <span className="px-2 py-1 bg-yellow-900/20 text-cool-gray text-xs rounded border border-yellow-600/20">
              Address: 0x{blockAddress.toString(16).toUpperCase()}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              downloadHexDump(blockData, `metadata-0x${metadataHex}-hexdump.txt`);
            }}
            className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
            title="Download hex dump"
          >
            📥 Hex
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              downloadBinary(blockData, `metadata-0x${metadataHex}.bin`);
            }}
            className="px-3 py-1 text-xs text-yellow-400 hover:text-yellow-300 border border-yellow-600/30 hover:border-yellow-400 rounded transition-colors"
            title="Download binary"
          >
            📥 Bin
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowBlock(!showBlock);
            }}
            className="text-sm text-yellow-400 hover:text-yellow-300"
          >
            {showBlock ? '▼ Hide' : '▶ Show'}
          </button>
        </div>
      </div>
      <p className="text-cool-gray text-sm mb-4">
        4KB block containing metadata 0x{metadataHex}
        {description ? ` - ${description}` : ''}
      </p>

      <div className={`space-y-6 ${showBlock ? '' : 'hidden'}`}>
        {/* Custom content sections (children) */}
        {children}

        {/* Standard Hex Dump Viewer */}
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-yellow-400">Hex Dump (Full Block 0x{metadataHex})</h3>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowHexDump(!showHexDump);
              }}
              className="text-xs text-yellow-400 hover:text-yellow-300"
            >
              {showHexDump ? '▼' : '▶'}
            </button>
          </div>
          <div className={`bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4 ${showHexDump ? '' : 'hidden'}`}>
            <div className="mb-4">
              <label className="block text-sm text-cool-gray mb-2">Inspect Offset (hex)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inspectOffset}
                  onChange={(e) => setInspectOffset(e.target.value)}
                  placeholder="0x000"
                  className="flex-1 px-3 py-2 bg-deep-gray border border-yellow-600/30 rounded text-white text-sm font-mono focus:outline-none focus:border-yellow-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    const offset = parseInt(inspectOffset.replace(/^0x/i, ''), 16);
                    if (!isNaN(offset) && offset >= 0 && offset < blockData.length) {
                      const element = document.getElementById(`${blockId}-${offset}`);
                      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  className="px-4 py-2 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50"
                >
                  Go
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="font-mono text-xs">
                {hexDumpRows}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
