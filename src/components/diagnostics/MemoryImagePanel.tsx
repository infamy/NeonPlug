import React, { useState } from 'react';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { HexDump } from './HexDump';
import { EmptyState } from '../ui/EmptyState';
import { useRadioStore } from '../../store/radioStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import type { MemoryRegionSpec } from '../../types/radioCapabilities';

/**
 * Whole memory-image viewer for clone radios (FT-65 family, UV5R-Mini).
 *
 * These radios read one contiguous image rather than the DM-32's metadata-tagged
 * blocks, so none of the block inspectors apply to them and they used to land on
 * a permanently empty Diagnostics tab. This renders the image cached by the last
 * Read, annotated with the radio's own region map.
 *
 * Reads from `radioStore.cachedMemoryImage` — no live connection, no I/O. The
 * image is populated by `useRadioConnection` from `protocol.getMemoryImage()`
 * after a successful read.
 */

interface MemoryImagePanelProps {
  showAlert: (message: string, title?: string) => void;
}

/** Slice a region out of the image, clamped so a bad spec can't throw. */
function sliceRegion(image: Uint8Array, region: MemoryRegionSpec): Uint8Array | null {
  if (region.start >= image.length) return null;
  const end = Math.min(region.start + region.length, image.length);
  return image.subarray(region.start, end);
}

export const MemoryImagePanel: React.FC<MemoryImagePanelProps> = () => {
  const { cachedMemoryImage } = useRadioStore();
  const { caps, model } = useRadioCapabilities();
  const [expanded, setExpanded] = useState<string | null>(null);

  const regions = caps?.memoryRegions;
  // Capability-gated, never model-gated (golden rule #3).
  if (!regions || regions.length === 0) return null;

  const image = cachedMemoryImage?.image ?? null;
  const imageModel = cachedMemoryImage?.model ?? null;

  // The cached image is model-tagged; showing one radio's bytes while another is
  // selected would be actively misleading, so say so instead.
  const staleImage = image !== null && imageModel !== null && model !== null && imageModel !== model;

  return (
    <Card className="!border-yellow-600/30 mb-6">
      <SectionTitle>Memory image</SectionTitle>
      <p className="text-cool-gray text-sm mb-4">
        The full clone image from the last Read, annotated with this radio&apos;s memory map.
      </p>

      {!image && (
        <EmptyState message="No memory image cached. Read from the radio to populate it." />
      )}

      {image && staleImage && (
        <EmptyState
          message={`The cached image is from ${imageModel}, but ${model} is selected. Read from the radio to refresh it.`}
        />
      )}

      {image && !staleImage && (
        <>
          <div className="text-xs text-muted font-mono mb-4">
            {imageModel} · {image.length} bytes (0x{image.length.toString(16)})
          </div>

          <div className="space-y-2">
            {regions.map((region) => {
              const bytes = sliceRegion(image, region);
              const key = `${region.label}-${region.start}`;
              const isOpen = expanded === key;
              return (
                <div key={key} className="border border-panel rounded">
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : key)}
                    className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-deep-gray/40 transition-colors"
                  >
                    <span className="text-sm text-neon-cyan">{region.label}</span>
                    <span className="text-xs text-muted font-mono">
                      0x{region.start.toString(16)}–0x{(region.start + region.length).toString(16)}
                      {bytes ? ` · ${bytes.length} B` : ' · outside image'}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-3 pb-3">
                      {region.notes && (
                        <p className="text-xs text-muted mb-2">{region.notes}</p>
                      )}
                      {bytes ? (
                        <HexDump
                          data={bytes}
                          idPrefix={`memimg-${region.start.toString(16)}`}
                          downloadName={`${imageModel}-${region.label.replace(/\W+/g, '-').toLowerCase()}-0x${region.start.toString(16)}`}
                          scrollable
                        />
                      ) : (
                        <p className="text-xs text-yellow-400">
                          This region starts past the end of the cached image — the map and
                          the radio disagree.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setExpanded(expanded === '__full__' ? null : '__full__')}
              className="text-sm link-accent"
            >
              {expanded === '__full__' ? 'Hide' : 'Show'} full image ({image.length} bytes)
            </button>
            {expanded === '__full__' && (
              <div className="mt-2">
                <HexDump
                  data={image}
                  idPrefix="memimg-full"
                  downloadName={`${imageModel}-full-image`}
                  withOffsetJump
                  scrollable
                />
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
};
