/**
 * Codeplug Snapshots Service
 * Stores recent reads/writes/imports in localStorage with pako compression.
 */

import { compressText, decompressText } from '../utils/compression';
import type { CodeplugData } from './codeplugExport';
import { codeplugToJsonSafe, jsonSafeToCodeplug, CodeplugFormatError } from './codeplugExport';

const STORAGE_KEY = 'neonplug-codeplug-snapshots';
const MAX_SNAPSHOTS = 50;

export type SnapshotEventType = 'read' | 'write' | 'import';

export interface SnapshotEntry {
  id: string;
  timestamp: string;
  label: string;
  source?: string;
  eventType?: SnapshotEventType;
  radioModel?: string;
  data: string; // base64 of pako-deflated JSON
}

export interface SaveSnapshotOptions {
  eventType: SnapshotEventType;
  radioModel?: string;
  fileName?: string;
}

interface StoredSnapshots {
  snapshots: SnapshotEntry[];
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function compress(data: CodeplugData): Promise<string> {
  const jsonSafe = codeplugToJsonSafe(data);
  const jsonString = JSON.stringify(jsonSafe);
  const deflated = await compressText(jsonString);
  return uint8ArrayToBase64(deflated);
}

async function decompress(
  base64: string,
  opts?: { allowNewerFormat?: boolean }
): Promise<CodeplugData> {
  const deflated = base64ToUint8Array(base64);
  const jsonString = await decompressText(deflated);
  const raw = JSON.parse(jsonString) as Record<string, unknown>;
  return jsonSafeToCodeplug(raw, opts);
}

function loadFromStorage(): StoredSnapshots {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { snapshots: [] };
    const parsed = JSON.parse(raw) as StoredSnapshots;
    return Array.isArray(parsed?.snapshots) ? parsed : { snapshots: [] };
  } catch {
    return { snapshots: [] };
  }
}

function saveToStorage(stored: StoredSnapshots): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  } catch (err) {
    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      // Drop oldest snapshots and retry once
      const trimmed = {
        snapshots: stored.snapshots.slice(0, Math.floor(stored.snapshots.length / 2)),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      } catch {
        // Ignore - storage full
      }
    }
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function buildSnapshotLabel(options: SaveSnapshotOptions): string {
  const { eventType, radioModel, fileName } = options;
  const model = radioModel ?? 'unknown radio';
  switch (eventType) {
    case 'read':
      return `Read from ${model}`;
    case 'write':
      return `Write to ${model}`;
    case 'import':
      return fileName ? `Import: ${fileName} (${model})` : `Import (${model})`;
    default:
      return 'Codeplug';
  }
}

/** Save a codeplug snapshot. Skips empty codeplugs (0 channels, 0 zones). */
export async function saveSnapshot(data: CodeplugData, options: SaveSnapshotOptions): Promise<void> {
  if (data.channels.length === 0 && data.zones.length === 0) return;

  const radioModel = options.radioModel ?? data.radioInfo?.model;
  const label = buildSnapshotLabel({ ...options, radioModel });
  const compressed = await compress(data);
  const stored = loadFromStorage();
  const entry: SnapshotEntry = {
    id: generateId(),
    timestamp: new Date().toISOString(),
    label,
    source: options.fileName ?? radioModel,
    eventType: options.eventType,
    radioModel: radioModel ?? options.radioModel,
    data: compressed,
  };
  const snapshots = [entry, ...stored.snapshots].slice(0, MAX_SNAPSHOTS);
  saveToStorage({ snapshots });
}

/** Return metadata for all snapshots (newest first). */
export function getSnapshots(): Omit<SnapshotEntry, 'data'>[] {
  const stored = loadFromStorage();
  return stored.snapshots.map(({ id, timestamp, label, source, eventType, radioModel }) => ({
    id,
    timestamp,
    label,
    source,
    eventType,
    radioModel,
  }));
}

/**
 * Load and decompress full codeplug data for a snapshot.
 *
 * Returns `null` for a missing or undecodable entry (unchanged), but
 * **propagates `CodeplugFormatError`** so callers can show the warning and offer
 * the override. Swallowing it here made Restore a silent dead button.
 *
 * This matters more than it looks: `/` (release) and `/dev/` (main) are the same
 * origin and share this store, so format skew is reachable without anyone
 * exchanging a file.
 */
export async function getSnapshotData(
  id: string,
  opts?: { allowNewerFormat?: boolean }
): Promise<CodeplugData | null> {
  const stored = loadFromStorage();
  const entry = stored.snapshots.find((s) => s.id === id);
  if (!entry) return null;
  try {
    return await decompress(entry.data, opts);
  } catch (error) {
    if (error instanceof CodeplugFormatError) throw error;
    return null;
  }
}

/** Remove a single snapshot. */
export function deleteSnapshot(id: string): void {
  const stored = loadFromStorage();
  const snapshots = stored.snapshots.filter((s) => s.id !== id);
  saveToStorage({ snapshots });
}

/** Remove all snapshots. */
export function clearSnapshots(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
}
