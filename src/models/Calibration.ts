/**
 * Frequency Adjustment/Calibration Data
 * 
 * This data is read-only and used for radio calibration.
 * DO NOT MODIFY - This is factory calibration data.
 */

export interface CalibrationParameter {
  param: number;      // Parameter number (1-77)
  name: string;       // Human-readable parameter name
  frequency?: number;  // Frequency value (if applicable)
  value?: number;     // Calibration value (if applicable)
}

// Parameter name mapping (1-indexed)
export const CALIBRATION_PARAM_NAMES: Record<number, string> = {
  1: 'RX Freq Adjust',
  2: 'TX Freq Adjust',
  3: 'U 4FSK 1', 4: 'U 4FSK 2', 5: 'U 4FSK 3', 6: 'U 4FSK 4', 7: 'U 4FSK 5',
  8: 'V 4FSK 1', 9: 'V 4FSK 2', 10: 'V 4FSK 3', 11: 'V 4FSK 4', 12: 'V 4FSK 5',
  13: 'U Low Power 1', 14: 'U Low Power 2', 15: 'U Low Power 3', 16: 'U Low Power 4', 17: 'U Low Power 5',
  18: 'U Mid Power 1', 19: 'U Mid Power 2', 20: 'U Mid Power 3', 21: 'U Mid Power 4', 22: 'U Mid Power 5',
  23: 'U High Power 1', 24: 'U High Power 2', 25: 'U High Power 3', 26: 'U High Power 4', 27: 'U High Power 5',
  28: 'V Low Power 1', 29: 'V Low Power 2', 30: 'V Low Power 3', 31: 'V Low Power 4', 32: 'V Low Power 5',
  33: 'V Mid Power 1', 34: 'V Mid Power 2', 35: 'V Mid Power 3', 36: 'V Mid Power 4', 37: 'V Mid Power 5',
  38: 'V High Power 1', 39: 'V High Power 2', 40: 'V High Power 3', 41: 'V High Power 4', 42: 'V High Power 5',
  43: 'U Analog Mod Low', 44: 'U Analog Mod Mid', 45: 'U Analog Mod High',
  46: 'V Analog Mod Low', 47: 'V Analog Mod Mid', 48: 'V Analog Mod High',
  49: 'DCS Mod',
  50: 'CTCSS Mod',
  51: 'U SQL9 1', 52: 'U SQL9 2', 53: 'U SQL9 3', 54: 'U SQL9 4', 55: 'U SQL9 5',
  56: 'U SQL3 1', 57: 'U SQL3 2', 58: 'U SQL3 3', 59: 'U SQL3 4', 60: 'U SQL3 5',
  61: 'V SQL9 1', 62: 'V SQL9 2', 63: 'V SQL9 3', 64: 'V SQL9 4', 65: 'V SQL9 5',
  66: 'V SQL3 1', 67: 'V SQL3 2', 68: 'V SQL3 3', 69: 'V SQL3 4', 70: 'V SQL3 5',
  71: 'Battery Adjust',
  72: 'U RX Bit Error Low', 73: 'U RX Bit Error Mid', 74: 'U RX Bit Error High',
  75: 'V RX Bit Error Low', 76: 'V RX Bit Error Mid', 77: 'V RX Bit Error High',
};

export interface CalibrationData {
  // Frequency arrays (4 bytes each, BCD format "XXX.XXXXXX" MHz)
  frequencyArray1: Map<number, number>; // Indexed by param * 4, relative offset -4
  frequencyArray2: Map<number, number>; // Indexed by param * 4, offset 0x3C
  
  // Value arrays (2 bytes each)
  valueArray1: Map<number, number>; // Indexed by param * 2, offset 0x7E
  valueArray2: Map<number, number>; // Indexed by param * 2, offset 0x9E
  valueArray3: Map<number, number>; // Indexed by param * 2, offset 0xB0
}

export interface Calibration {
  blockAddress: number;
  data: CalibrationData;
}

