import { D890_ADDR } from './constants';

/**
 * DA-7X2 boot image and the two standby "BK" pictures.
 *
 * All three are the same format at three addresses, driven by one vendor form
 * (`Frm_Pic`) with a selector global. 40960 bytes, 160x128, RGB565, big-endian,
 * column-major, no header and no palette.
 *
 * ⚠️ WRITE PATH IS UNVALIDATED. The format below is verified in both directions
 * from the vendor disassembly — decoder loop bounds and encoder divisors agree
 * independently — but **no image has ever been written to a radio** by this
 * project or by the analysis it came from. The encode/decode functions here are
 * pure and safe; sending their output to hardware is not. See `IMAGE_WRITE_RISK`.
 */

/** Every image is exactly this, in both directions. */
export const D890_IMAGE = {
  WIDTH: 160,
  HEIGHT: 128,
  /** 160 * 128 * 2 = 40960 = 0xA000. */
  BYTES: 0xa000,
  /** 40960 / 16 — one standard write frame per 16 bytes. */
  FRAMES: 0xa000 / 0x10,
} as const;

export type D890ImageKind = 'boot' | 'bk1' | 'bk2';

export const D890_IMAGE_ADDRESS: Record<D890ImageKind, number> = {
  boot: D890_ADDR.BOOT_IMAGE,
  bk1: D890_ADDR.STANDBY_BK1,
  bk2: D890_ADDR.STANDBY_BK2,
};

export const D890_IMAGE_LABEL: Record<D890ImageKind, string> = {
  boot: 'Boot',
  bk1: 'Standby Background',
  bk2: 'Standby Background Alternate',
};

/**
 * Why writing one of these is riskier than its size suggests.
 *
 * Shown to the user before any image write, and stated here so it cannot drift
 * away from the code that needs it.
 */
export const IMAGE_WRITE_RISK =
  'No image has ever been written to a DA-7X2 by this software. A failed or ' +
  'partial write leaves the picture region half-updated, which the radio may ' +
  'render as garbage until it is rewritten.';

/**
 * Byte index of pixel (x, y). Column-major: x strides by the full height.
 *
 * This is the unambiguous statement of the layout. It is equivalent to calling
 * the buffer a 128-wide portrait raster that the CPS presents rotated, but that
 * description invites off-by-one transposition bugs — prefer the formula.
 */
export function imageByteIndex(x: number, y: number): number {
  return (x * D890_IMAGE.HEIGHT + y) * 2;
}

/** Pack 8-bit RGB into RGB565. */
export function rgbToRgb565(r: number, g: number, b: number): number {
  return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

/**
 * Unpack RGB565 to 8-bit RGB.
 *
 * The low bits are replicated into the gap rather than zero-filled, so white
 * stays 255 rather than decoding to 248. Zero-filling makes a round-trip darken
 * the image slightly every pass.
 */
export function rgb565ToRgb(pixel: number): { r: number; g: number; b: number } {
  const r5 = (pixel >> 11) & 0x1f;
  const g6 = (pixel >> 5) & 0x3f;
  const b5 = pixel & 0x1f;
  return {
    r: (r5 << 3) | (r5 >> 2),
    g: (g6 << 2) | (g6 >> 4),
    b: (b5 << 3) | (b5 >> 2),
  };
}

/**
 * How a source of the wrong shape is fitted to 160x128.
 *
 * `cover` is the default and the one to use. The vendor CPS uses `stretch` — it
 * scales both axes independently, so a square logo comes out visibly squashed on
 * the radio. That is a flaw in its write path, not a format requirement, and
 * there is no reason to reproduce it.
 *
 *  - `cover`   preserve aspect, fill the frame, crop the overflow (default)
 *  - `contain` preserve aspect, fit the whole image, pad with `background`
 *  - `stretch` ignore aspect and fill — bit-compatible with the vendor CPS
 */
export type D890ImageFit = 'cover' | 'contain' | 'stretch';

export interface EncodeImageOptions {
  fit?: D890ImageFit;
  /** Padding colour for `contain`. Defaults to black, which suits a boot screen. */
  background?: { r: number; g: number; b: number };
  /**
   * Which part of the source survives a `cover` crop, as 0..1 across each axis.
   * 0.5 is centred. Use this when the subject is off-centre rather than letting
   * the crop cut through it.
   */
  focusX?: number;
  focusY?: number;
}

/**
 * Resample RGBA source pixels to 160x128 and pack to the radio's buffer.
 *
 * Nearest-neighbour, matching the vendor's sampling. The fit mode is ours —
 * see `D890ImageFit` for why the default differs from what the CPS does.
 */
export function encodeD890Image(
  rgba: Uint8ClampedArray | Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  options: EncodeImageOptions = {}
): Uint8Array {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    throw new Error('D890 image source must have non-zero dimensions');
  }
  const expected = sourceWidth * sourceHeight * 4;
  if (rgba.length < expected) {
    throw new Error(
      `D890 image source is ${rgba.length} bytes, need ${expected} for ` +
        `${sourceWidth}x${sourceHeight} RGBA`
    );
  }

  const fit = options.fit ?? 'cover';
  const bg = options.background ?? { r: 0, g: 0, b: 0 };
  const focusX = Math.min(1, Math.max(0, options.focusX ?? 0.5));
  const focusY = Math.min(1, Math.max(0, options.focusY ?? 0.5));
  const targetAspect = D890_IMAGE.WIDTH / D890_IMAGE.HEIGHT;
  const sourceAspect = sourceWidth / sourceHeight;

  // The source rectangle that maps onto the frame, and where the frame sits.
  let cropW = sourceWidth;
  let cropH = sourceHeight;
  let cropX = 0;
  let cropY = 0;
  let drawX = 0;
  let drawY = 0;
  let drawW: number = D890_IMAGE.WIDTH;
  let drawH: number = D890_IMAGE.HEIGHT;

  if (fit === 'cover') {
    // Take the largest centred sub-rectangle of the source that has the frame's
    // aspect, so nothing is distorted and only the overflow is lost.
    if (sourceAspect > targetAspect) {
      cropW = sourceHeight * targetAspect;
      cropX = (sourceWidth - cropW) * focusX;
    } else {
      cropH = sourceWidth / targetAspect;
      cropY = (sourceHeight - cropH) * focusY;
    }
  } else if (fit === 'contain') {
    // Shrink the frame to the source's aspect and pad the rest.
    if (sourceAspect > targetAspect) {
      drawH = Math.round(D890_IMAGE.WIDTH / sourceAspect);
      drawY = Math.round((D890_IMAGE.HEIGHT - drawH) / 2);
    } else {
      drawW = Math.round(D890_IMAGE.HEIGHT * sourceAspect);
      drawX = Math.round((D890_IMAGE.WIDTH - drawW) / 2);
    }
  }

  const out = new Uint8Array(D890_IMAGE.BYTES);
  const pad = rgbToRgb565(bg.r, bg.g, bg.b);

  for (let x = 0; x < D890_IMAGE.WIDTH; x += 1) {
    for (let y = 0; y < D890_IMAGE.HEIGHT; y += 1) {
      let pixel: number;
      const inside = x >= drawX && x < drawX + drawW && y >= drawY && y < drawY + drawH;
      if (!inside) {
        pixel = pad;
      } else {
        const u = (x - drawX) / drawW;
        const v = (y - drawY) / drawH;
        const sx = Math.min(sourceWidth - 1, Math.floor(cropX + u * cropW));
        const sy = Math.min(sourceHeight - 1, Math.floor(cropY + v * cropH));
        const src = (sy * sourceWidth + sx) * 4;
        pixel = rgbToRgb565(rgba[src] ?? 0, rgba[src + 1] ?? 0, rgba[src + 2] ?? 0);
      }
      const dst = imageByteIndex(x, y);
      out[dst] = (pixel >> 8) & 0xff;
      out[dst + 1] = pixel & 0xff;
    }
  }
  return out;
}

/** Unpack a radio image buffer to 160x128 RGBA, for display. */
export function decodeD890Image(bytes: Uint8Array): Uint8ClampedArray {
  if (bytes.length < D890_IMAGE.BYTES) {
    throw new Error(
      `D890 image must be ${D890_IMAGE.BYTES} bytes, got ${bytes.length}`
    );
  }
  const out = new Uint8ClampedArray(D890_IMAGE.WIDTH * D890_IMAGE.HEIGHT * 4);
  for (let x = 0; x < D890_IMAGE.WIDTH; x += 1) {
    for (let y = 0; y < D890_IMAGE.HEIGHT; y += 1) {
      const src = imageByteIndex(x, y);
      const pixel = ((bytes[src] ?? 0) << 8) | (bytes[src + 1] ?? 0);
      const { r, g, b } = rgb565ToRgb(pixel);
      const dst = (y * D890_IMAGE.WIDTH + x) * 4;
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
      out[dst + 3] = 255;
    }
  }
  return out;
}

/**
 * Split an image buffer into the exact write frames it would need.
 *
 * Returned rather than sent, so the caller can inspect, diff or discard them.
 * Building the plan is free; executing it is the dangerous part.
 */
export function planImageWrite(
  kind: D890ImageKind,
  image: Uint8Array
): { address: number; data: Uint8Array }[] {
  if (image.length !== D890_IMAGE.BYTES) {
    throw new Error(
      `D890 ${kind} image must be exactly ${D890_IMAGE.BYTES} bytes, got ${image.length}`
    );
  }
  const base = D890_IMAGE_ADDRESS[kind];
  const frames: { address: number; data: Uint8Array }[] = [];
  for (let offset = 0; offset < image.length; offset += 0x10) {
    frames.push({ address: base + offset, data: image.subarray(offset, offset + 0x10) });
  }
  return frames;
}
