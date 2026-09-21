export interface QuickTextMessage {
  index: number;           // 0-based index in the message list
  text: string;            // Message text (null-terminated, 0xFF indicates end)
  flag: number;            // Flag/status byte (set to 0 when message is set)
  checkValue: number;      // 2-byte check value at offset +0x70
  /**
   * Hardware slot, on radios that place messages by slot rather than by list
   * position. On the DA-7X2 it is the pre-defined SMS TEXT slot — what a hot
   * key's Content byte and an SMS envelope both point at — so it has to survive
   * the store renumbering `index` to array order. Absent on the DM-32, whose
   * encoder places messages by array order and never reads it.
   */
  slot?: number;
}

