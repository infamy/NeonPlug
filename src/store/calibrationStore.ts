import { create } from 'zustand';
import type { Calibration } from '../models/Calibration';

interface CalibrationState {
  calibration: Calibration | null;
  calibrationLoaded: boolean;
  setCalibration: (calibration: Calibration | null) => void;
  setCalibrationLoaded: (loaded: boolean) => void;
}

export const useCalibrationStore = create<CalibrationState>((set) => ({
  calibration: null,
  calibrationLoaded: false,
  setCalibration: (calibration) => set({ calibration, calibrationLoaded: true }),
  setCalibrationLoaded: (loaded) => set({ calibrationLoaded: loaded }),
}));

