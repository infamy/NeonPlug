/**
 * Boot / Startup image format utilities
 * 240×320 portrait, raw BGR565 (no header), 153600 bytes from V-Frame 0x0E base address
 */

/** Total pixel bytes: 240×320×2 = 153600. No header; base address from V-Frame 0x0E (e.g. 0x150000). */
export const BOOT_IMAGE_PIXEL_SIZE = 153600;

/** 37 full 4KB + 1 chunk of 2048 = 153600 bytes */
export const BOOT_IMAGE_FULL_BLOCKS = 37;
export const BOOT_IMAGE_LAST_CHUNK_SIZE = 2048;
export const BOOT_IMAGE_BLOCKS = 38; // 37 full + 1 short

export const BOOT_IMAGE = {
  /** Fallback / typical base address from V-Frame 0x0E; actual address comes from radio. */
  DEFAULT_BASE_ADDRESS: 0x150000,
  SIZE: BOOT_IMAGE_PIXEL_SIZE,
  PIXEL_SIZE: BOOT_IMAGE_PIXEL_SIZE,
  WIDTH: 240,
  HEIGHT: 320,
  BLOCKS: BOOT_IMAGE_BLOCKS,
  FULL_BLOCKS: BOOT_IMAGE_FULL_BLOCKS,
  FULL_BLOCK_SIZE: 4096,
  LAST_CHUNK_SIZE: BOOT_IMAGE_LAST_CHUNK_SIZE,
} as const;

export interface ParsedBootImage {
  /** Raw BGR565 pixel data (153600 bytes). No header. */
  bgr565: Uint8Array;
}

/**
 * Parse raw boot image data. Payload is 153600 bytes of raw BGR565 (no header).
 */
export function parseBootImageRaw(raw: Uint8Array): ParsedBootImage {
  if (raw.length < BOOT_IMAGE.SIZE) {
    throw new Error(
      `Boot image data too short: expected ${BOOT_IMAGE.SIZE}, got ${raw.length}`
    );
  }
  const bgr565 = raw.slice(0, BOOT_IMAGE.SIZE);
  return { bgr565 };
}

/**
 * Legacy: parse with optional header for backward compat. If data is 153600 bytes, treat as raw.
 */
export function parseBootImageHeader(raw: Uint8Array): ParsedBootImage & { description: string; hasValidEndMarker: boolean } {
  if (raw.length < BOOT_IMAGE.SIZE) {
    throw new Error(
      `Boot image data too short: expected ${BOOT_IMAGE.SIZE}, got ${raw.length}`
    );
  }
  const bgr565 = raw.slice(0, BOOT_IMAGE.SIZE);
  return {
    bgr565,
    description: '',
    hasValidEndMarker: false,
  };
}

/**
 * Convert RGB565 (little-endian, 2 bytes per pixel) to ImageData (RGBA).
 * Byte0: GGGBBBBB, Byte1: RRRRRGGG → R in high bits, B in low (standard RGB565).
 */
export function bgr565ToImageData(bgr565: Uint8Array): ImageData {
  if (bgr565.length !== BOOT_IMAGE.PIXEL_SIZE) {
    throw new Error(
      `Pixel data size must be ${BOOT_IMAGE.PIXEL_SIZE}, got ${bgr565.length}`
    );
  }
  const data = new Uint8ClampedArray(
    BOOT_IMAGE.WIDTH * BOOT_IMAGE.HEIGHT * 4
  );
  for (let i = 0; i < BOOT_IMAGE.PIXEL_SIZE; i += 2) {
    const low = bgr565[i]!;
    const high = bgr565[i + 1]!;
    const pixel = low | (high << 8);
    const r = ((pixel >> 11) & 0x1f) * (255 / 31);
    const g = ((pixel >> 5) & 0x3f) * (255 / 63);
    const b = (pixel & 0x1f) * (255 / 31);
    const out = (i / 2) * 4;
    data[out] = Math.round(r);
    data[out + 1] = Math.round(g);
    data[out + 2] = Math.round(b);
    data[out + 3] = 255;
  }
  return new ImageData(
    new Uint8ClampedArray(data),
    BOOT_IMAGE.WIDTH,
    BOOT_IMAGE.HEIGHT
  );
}

/** Alias for display: raw from radio is RGB565. */
export function rgb565ToImageData(rgb565: Uint8Array): ImageData {
  return bgr565ToImageData(rgb565);
}

/**
 * Convert ImageData (RGBA) to RGB565 for writing to radio (little-endian).
 * Same byte layout as read: R in high bits, B in low.
 */
export function imageDataToBgr565(imageData: ImageData): Uint8Array {
  if (
    imageData.width !== BOOT_IMAGE.WIDTH ||
    imageData.height !== BOOT_IMAGE.HEIGHT
  ) {
    throw new Error(
      `Image must be ${BOOT_IMAGE.WIDTH}×${BOOT_IMAGE.HEIGHT}, got ${imageData.width}×${imageData.height}`
    );
  }
  const out = new Uint8Array(BOOT_IMAGE.PIXEL_SIZE);
  const data = imageData.data;
  for (let i = 0; i < BOOT_IMAGE.WIDTH * BOOT_IMAGE.HEIGHT; i++) {
    const r = Math.min(31, (data[i * 4]! >> 3) & 0x1f);
    const g = Math.min(63, (data[i * 4 + 1]! >> 2) & 0x3f);
    const b = Math.min(31, (data[i * 4 + 2]! >> 3) & 0x1f);
    const pixel = (r << 11) | (g << 5) | b;
    out[i * 2] = pixel & 0xff;
    out[i * 2 + 1] = (pixel >> 8) & 0xff;
  }
  return out;
}

/** Alias for upload: we output BGR565 for radio. */
export function imageDataToRgb565(imageData: ImageData): Uint8Array {
  return imageDataToBgr565(imageData);
}

/**
 * Build full 153600-byte payload for radio (raw BGR565, no header).
 */
export function buildBootImagePayload(_description: string, bgr565: Uint8Array): Uint8Array {
  if (bgr565.length !== BOOT_IMAGE.PIXEL_SIZE) {
    throw new Error(
      `BGR565 size must be ${BOOT_IMAGE.PIXEL_SIZE}, got ${bgr565.length}`
    );
  }
  return new Uint8Array(bgr565);
}
