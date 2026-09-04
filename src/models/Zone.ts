export interface Zone {
  id: string;                 // Unique identifier for UI (generated)
  name: string;                // Zone name (max 10 chars, written to radio)
  channels: number[];         // Array of channel numbers
  /**
   * Hidden from the radio's zone menu.
   *
   * The zone and its channels still exist and are still written; the radio just
   * does not offer it when cycling zones. Set per zone from the CPS's zone edit
   * dialog.
   *
   * Optional because only some radios have the concept — undefined means "this
   * radio has no hide flag", which must stay distinguishable from "not hidden".
   */
  hidden?: boolean;
}

