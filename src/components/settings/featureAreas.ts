/**
 * Settings areas that are a self-contained component, keyed by the feature that
 * turns them on.
 *
 * `SettingsTab` used to render each of these as its own hard-coded block —
 * import the component, test the feature flag, wrap it in a Card, hand-write an
 * anchor id that had to match the jump-nav chip. Six near-identical blocks, six
 * imports naming one radio, and an anchor that could silently stop matching.
 *
 * Registering them here means the tab renders whatever a radio declared without
 * importing any of it, and the anchor is derived from the same id the chip uses
 * rather than written twice.
 *
 * Not every feature belongs here. `bootImage`, `oneKeyOperation` and `gpsAprs`
 * are still inline in `SettingsTab` because they are large blocks wired to that
 * component's own state and handlers; extracting them is a separate change, and
 * a feature with no entry here simply keeps rendering by hand.
 */

import type { ComponentType } from 'react';
import type { SettingsFeature } from '../../types/settingsProfile';
import { D890RoamingArea } from './D890RoamingArea';
import { D890GpsRoamingArea } from './D890GpsRoamingArea';
import { D890SatellitesArea } from './D890SatellitesArea';
import { D890TonesArea } from './D890TonesArea';
import { D890EmergencyArea } from './D890EmergencyArea';
import { D890ImagesArea } from './D890ImagesArea';

export const FEATURE_AREAS: Partial<Record<SettingsFeature, ComponentType>> = {
  roaming: D890RoamingArea,
  gpsRoaming: D890GpsRoamingArea,
  satellites: D890SatellitesArea,
  toneLists: D890TonesArea,
  emergencyAlarm: D890EmergencyArea,
  // Read on demand from inside the area — 3 x 40 KB is larger than the rest of
  // this radio combined, so pictures are not part of the codeplug read.
  pictures: D890ImagesArea,
};
