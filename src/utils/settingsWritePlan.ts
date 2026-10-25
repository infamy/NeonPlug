/**
 * Whether a write sends the radio's settings.
 *
 * Settings used to go out only when one had been edited since the read. Reading
 * radio A and writing that codeplug unchanged to radio B then copied A's
 * channels and none of its settings, while editing a single setting first
 * copied all of them (#206). The vendor CPS writes the settings every time.
 *
 * A radio opts in with the `writesSettingsOnEveryWrite` capability and gets its
 * settings on every write. The changed fields still go with them: the DM-32
 * lays them over the settings block it holds from the read and sends the whole
 * block, so with none changed it sends that block as read. Buffered writers
 * (clone images, the DA-7X2) and radios that have not opted in keep the old
 * rule.
 */
export function shouldWriteSettings(
  hasSettings: boolean,
  changedFieldCount: number,
  writesSettingsOnEveryWrite: boolean | undefined,
  bufferedSettingsWrite: boolean | undefined
): boolean {
  if (!hasSettings) return false;
  if (writesSettingsOnEveryWrite && !bufferedSettingsWrite) return true;
  return changedFieldCount > 0;
}
