export function isValidDMRId(dmrId: number): boolean {
  // DMR ID is typically 7 digits
  return dmrId >= 1 && dmrId <= 9999999;
}

export function isValidColorCode(colorCode: number): boolean {
  return colorCode >= 0 && colorCode <= 15;
}

export function isValidTimeSlot(timeSlot: number): boolean {
  return timeSlot === 1 || timeSlot === 2;
}

