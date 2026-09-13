export interface Contact {
  id: number;                   // 1-250
  name: string;                // Max 16 chars
  dmrId: number;              // DMR ID (7 digits) / Talkgroup ID
  callSign?: string;           // Callsign (8 bytes, max 7 chars, stored at 0x14-0x1B)
  city?: string;               // City
  province?: string;           // Province/State
  country?: string;            // Country
  remark?: string;             // Additional remarks/notes
  /**
   * In the radio's Friends List.
   *
   * On the DA-7X2 this is not a separate list — it is the vendor's `MyFriend`
   * flag on the contact itself, and the CPS's Friends List is a filtered view.
   * Optional so radios without the concept stay distinguishable from "not a
   * friend".
   */
  isFriend?: boolean;
}

