/**
 * CTCSS/DCS Constants
 * Standard CTCSS frequencies and DCS codes for radio programming
 */

/**
 * Standard CTCSS frequencies (Hz)
 * These are the standard CTCSS tones used in amateur radio and commercial applications
 * The user can modify this list if their radio supports different frequencies
 */
export const CTCSS_FREQUENCIES: number[] = [
  67.0,  69.3,  71.9,  74.4,  77.0,  79.7,  82.5,  85.4,
  88.5,  91.5,  94.8,  97.4, 100.0, 103.5, 107.2, 110.9,
  114.8, 118.8, 123.0, 127.3, 131.8, 136.5, 141.3, 146.2,
  151.4, 156.7, 159.8, 162.2, 167.9, 173.8, 179.9, 186.2,
  192.8, 203.5, 210.7, 218.1, 225.7, 233.6, 241.8, 250.3
];

/**
 * Standard DCS codes
 * DCS (Digital Coded Squelch) codes supported by the radio
 * Each code can have Normal (N) or Inverted (P) polarity
 */
export const DCS_CODES: number[] = [
  23, 25, 26, 31, 32, 36, 43, 47, 51, 53, 54, 65, 71, 72, 73, 74,
  114, 115, 116, 122, 125, 131, 132, 134, 143, 145, 152, 155, 156, 162, 165, 172, 174,
  205, 212, 223, 225, 226, 243, 244, 245, 246, 251, 252, 255, 261, 263, 265, 266, 271, 274,
  306, 311, 315, 325, 331, 332, 343, 346, 351, 356, 364, 365, 371,
  411, 412, 413, 423, 431, 432, 445, 446, 452, 454, 455, 462, 464, 465, 466,
  503, 506, 516, 523, 526, 532, 546, 565,
  606, 612, 624, 627, 631, 632, 654, 662, 664,
  703, 712, 723, 731, 732, 734, 743, 754
];

/**
 * Format CTCSS frequency for display
 */
export function formatCTCSSFrequency(frequency: number): string {
  return `${frequency.toFixed(1)} Hz`;
}

/**
 * Format DCS code for display
 */
export function formatDCSCode(code: number, polarity?: 'N' | 'P'): string {
  const codeStr = code.toString().padStart(3, '0');
  return polarity ? `D${codeStr}${polarity}` : `D${codeStr}`;
}
