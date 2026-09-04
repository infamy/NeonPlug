import React, { useEffect, useRef } from 'react';
import {
  D890_IMAGE,
  decodeD890Image,
  type D890ImageKind,
  D890_IMAGE_LABEL,
} from '../../radios/d890uv/bootImage';

interface D890ImagePreviewProps {
  kind: D890ImageKind;
  data: Uint8Array;
  /** Suppress the label when the caller already names the image. */
  hideHeading?: boolean;
}

/**
 * Render a boot / BK image.
 *
 * Format confirmed on hardware 2026-08-30 — 160x128, RGB565, big-endian,
 * column-major — by writing known pictures through the vendor CPS and reading
 * them back. See `bootImage.ts` for what each capture established.
 *
 * Read-only: `encodeD890Image` can build the bytes, but NeonPlug has never
 * written to this radio and an image write lands in a region whose
 * other contents are unknown.
 */
export const D890ImagePreview: React.FC<D890ImagePreviewProps> = ({ kind, data, hideHeading }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length < D890_IMAGE.BYTES) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    try {
      const rgba = decodeD890Image(data);
      // Fill a canvas-owned ImageData rather than constructing one around our
      // buffer: the ImageData constructor demands a Uint8ClampedArray backed by
      // a plain ArrayBuffer, which our decoder's return type does not promise.
      const img = ctx.createImageData(D890_IMAGE.WIDTH, D890_IMAGE.HEIGHT);
      img.data.set(rgba);
      ctx.putImageData(img, 0, 0);
    } catch {
      // A short or malformed buffer is not worth an error dialog — the hex dump
      // below it still tells the user everything the radio actually sent.
    }
  }, [data]);

  const short = data.length < D890_IMAGE.BYTES;

  return (
    <div className="mt-4 p-4 bg-dark-charcoal rounded-lg border-panel">
      {!hideHeading && (
        <div className="flex items-baseline justify-between mb-3">
          <h4 className="text-sm font-semibold text-neon-cyan">
            {D890_IMAGE_LABEL[kind]}
          </h4>
          <span className="text-xs text-muted">
            {D890_IMAGE.WIDTH}×{D890_IMAGE.HEIGHT}
          </span>
        </div>
      )}

      {short ? (
        <p className="text-xs text-amber-400">
          Only {data.length.toLocaleString()} of {D890_IMAGE.BYTES.toLocaleString()} bytes
          were read, so the image cannot be decoded. Dump the whole region to see it.
        </p>
      ) : (
        <canvas
          ref={canvasRef}
          width={D890_IMAGE.WIDTH}
          height={D890_IMAGE.HEIGHT}
          className="border-panel rounded"
          style={{ width: D890_IMAGE.WIDTH * 2, height: D890_IMAGE.HEIGHT * 2, imageRendering: 'pixelated' }}
        />
      )}
    </div>
  );
};
