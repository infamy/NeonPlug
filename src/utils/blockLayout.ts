/**
 * Resolver for declarative block layouts (caps.diagnostics.blockLayouts).
 * Pure functions — shared by the Diagnostics hex viewer, offset lookup,
 * and layout legends.
 */
import type { BlockFieldSpec, BlockLayoutSpec } from '../types/radioCapabilities';

export interface ResolvedField {
  spec: BlockFieldSpec;
  /** Occurrence index for repeated fields (0 for singles). */
  index: number;
  /** Byte offset where this occurrence starts. */
  start: number;
}

/** Find the field covering `offset`, if any. Earlier fields win on overlap. */
export function resolveFieldAt(layout: BlockLayoutSpec, offset: number): ResolvedField | null {
  for (const spec of layout.fields) {
    if (offset < spec.at) continue;
    const len = spec.len ?? 1;
    const count = spec.repeat?.count ?? 1;
    const stride = spec.repeat?.stride ?? len;
    const rel = offset - spec.at;
    const index = Math.floor(rel / stride);
    if (index >= count) continue;
    if (rel - index * stride < len) {
      return { spec, index, start: spec.at + index * stride };
    }
  }
  return null;
}

/** Human-readable one-liner for a resolved field (tooltips, offset lookup). */
export function describeField(resolved: ResolvedField, block: Uint8Array): string {
  const { spec, index, start } = resolved;
  const len = spec.len ?? 1;
  const label = spec.repeat ? `${spec.name} #${index + 1}` : spec.name;
  const bits = spec.bits ? ` [bits ${spec.bits[0]}–${spec.bits[1]}]` : '';
  let decoded = '';
  if (spec.decode) {
    try {
      decoded = ` = ${spec.decode(block.subarray(start, start + len), index)}`;
    } catch {
      decoded = ' = <decode error>';
    }
  }
  return `${label}${bits} @ 0x${start.toString(16).toUpperCase().padStart(2, '0')}${decoded}`;
}
