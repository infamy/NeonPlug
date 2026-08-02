import React, { useState, ReactNode } from 'react';
import { HexDump } from './HexDump';
import { downloadHexDump, downloadBinary } from '../../utils/hexdump';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';

interface MetadataBlockDisplayProps {
  metadata: number;
  blockData: Uint8Array | null;
  blockAddress: number | null;
  description?: string;
  children?: ReactNode;
}

export const MetadataBlockDisplay: React.FC<MetadataBlockDisplayProps> = ({
  metadata,
  blockData,
  blockAddress,
  description,
  children,
}) => {
  const [showBlock, setShowBlock] = useState(false);
  const [showHexDump, setShowHexDump] = useState(false);
  const { caps } = useRadioCapabilities();

  const metadataHex = metadata.toString(16).toUpperCase().padStart(2, '0');
  const blockId = `block${metadataHex}`;
  // Per-radio hex annotations — radios without a layout render plain hex.
  const layout = caps?.diagnostics?.blockLayouts?.[metadata];

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
          <div className={showHexDump ? '' : 'hidden'}>
            <HexDump data={blockData} idPrefix={blockId} withOffsetJump layout={layout} />
          </div>
        </div>
      </div>
    </div>
  );
};
