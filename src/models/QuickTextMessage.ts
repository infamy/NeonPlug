export interface QuickTextMessage {
  index: number;           // 0-based index in the message list
  text: string;            // Message text (null-terminated, 0xFF indicates end)
  flag: number;            // Flag/status byte (set to 0 when message is set)
  checkValue: number;      // 2-byte check value at offset +0x70
}

