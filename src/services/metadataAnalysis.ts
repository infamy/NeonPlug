/**
 * Metadata Analysis Service
 * Analyzes discovered memory blocks to identify unknown metadata values
 * and provide insights into block usage patterns
 */

export interface MetadataSummary {
  metadata: number;
  hex: string;
  count: number;
  addresses: number[];
  type: string;
  sampleData?: {
    address: number;
    firstBytes: number[];
    asciiPreview: string;
  };
}

export interface MetadataAnalysis {
  totalBlocks: number;
  knownBlocks: number;
  unknownBlocks: number;
  emptyBlocks: number;
  summaries: MetadataSummary[];
  unknownMetadataValues: number[];
  blockTypeDistribution: Map<string, number>;
}

/**
 * Analyze all discovered block metadata
 */
export function analyzeMetadata(
  blockMetadata: Map<number, { metadata: number; type: string }>,
  blockData?: Map<number, Uint8Array>
): MetadataAnalysis {
  const summaries = new Map<number, MetadataSummary>();
  const blockTypeDistribution = new Map<string, number>();
  const unknownMetadataValues: number[] = [];
  
  let totalBlocks = 0;
  let knownBlocks = 0;
  let unknownBlocks = 0;
  let emptyBlocks = 0;

  // Group blocks by metadata value
  for (const [address, info] of blockMetadata.entries()) {
    totalBlocks++;
    
    // Count by type
    const typeCount = blockTypeDistribution.get(info.type) || 0;
    blockTypeDistribution.set(info.type, typeCount + 1);
    
    if (info.type === 'empty') {
      emptyBlocks++;
    } else if (info.type === 'unknown') {
      unknownBlocks++;
      if (!unknownMetadataValues.includes(info.metadata)) {
        unknownMetadataValues.push(info.metadata);
      }
    } else {
      knownBlocks++;
    }
    
    // Build summary for this metadata value
    if (!summaries.has(info.metadata)) {
      summaries.set(info.metadata, {
        metadata: info.metadata,
        hex: `0x${info.metadata.toString(16).padStart(2, '0').toUpperCase()}`,
        count: 0,
        addresses: [],
        type: info.type,
      });
    }
    
    const summary = summaries.get(info.metadata)!;
    summary.count++;
    summary.addresses.push(address);
    
    // Add sample data if available (first block of this metadata type)
    if (blockData && summary.sampleData === undefined) {
      const data = blockData.get(address);
      if (data && data.length > 0) {
        const firstBytes = Array.from(data.slice(0, 64)); // First 64 bytes
        const asciiPreview = Array.from(data.slice(0, 256))
          .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.')
          .join('')
          .substring(0, 128); // First 128 chars
        
        summary.sampleData = {
          address,
          firstBytes,
          asciiPreview,
        };
      }
    }
  }
  
  // Sort summaries by metadata value
  const sortedSummaries = Array.from(summaries.values())
    .sort((a, b) => a.metadata - b.metadata);
  
  // Sort unknown metadata values
  unknownMetadataValues.sort((a, b) => a - b);
  
  return {
    totalBlocks,
    knownBlocks,
    unknownBlocks,
    emptyBlocks,
    summaries: sortedSummaries,
    unknownMetadataValues,
    blockTypeDistribution,
  };
}

/**
 * Generate a human-readable report of metadata analysis
 */
export function generateMetadataReport(analysis: MetadataAnalysis): string {
  const lines: string[] = [];
  
  lines.push('='.repeat(80));
  lines.push('DM-32UV Memory Block Metadata Analysis');
  lines.push('='.repeat(80));
  lines.push('');
  
  // Summary statistics
  lines.push('Summary Statistics:');
  lines.push(`  Total Blocks: ${analysis.totalBlocks}`);
  lines.push(`  Known Blocks: ${analysis.knownBlocks} (${Math.round(analysis.knownBlocks / analysis.totalBlocks * 100)}%)`);
  lines.push(`  Unknown Blocks: ${analysis.unknownBlocks} (${Math.round(analysis.unknownBlocks / analysis.totalBlocks * 100)}%)`);
  lines.push(`  Empty Blocks: ${analysis.emptyBlocks} (${Math.round(analysis.emptyBlocks / analysis.totalBlocks * 100)}%)`);
  lines.push('');
  
  // Block type distribution
  lines.push('Block Type Distribution:');
  const sortedTypes = Array.from(analysis.blockTypeDistribution.entries())
    .sort((a, b) => b[1] - a[1]);
  for (const [type, count] of sortedTypes) {
    lines.push(`  ${type.padEnd(12)}: ${count.toString().padStart(4)} blocks`);
  }
  lines.push('');
  
  // Unknown metadata values
  if (analysis.unknownMetadataValues.length > 0) {
    lines.push('Unknown Metadata Values (need investigation):');
    for (const metadata of analysis.unknownMetadataValues) {
      const summary = analysis.summaries.find(s => s.metadata === metadata);
      if (summary) {
        lines.push(`  ${summary.hex} (${summary.metadata}): ${summary.count} block(s) at ${summary.addresses.map(a => `0x${a.toString(16)}`).join(', ')}`);
      }
    }
    lines.push('');
  }
  
  // All metadata summaries
  lines.push('All Metadata Values:');
  lines.push('');
  for (const summary of analysis.summaries) {
    if (summary.metadata === 0x00 || summary.metadata === 0xFF) {
      continue; // Skip empty blocks in detailed view
    }
    
    lines.push(`${summary.hex} (${summary.metadata.toString().padStart(3)}) - ${summary.type.padEnd(10)}: ${summary.count} block(s)`);
    lines.push(`  Addresses: ${summary.addresses.map(a => `0x${a.toString(16).padStart(6, '0')}`).join(', ')}`);
    
    if (summary.sampleData) {
      lines.push(`  Sample (first 16 bytes): ${summary.sampleData.firstBytes.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      const ascii = summary.sampleData.asciiPreview.substring(0, 64).replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      if (ascii.length > 0 && !/^\.+$/.test(ascii)) {
        lines.push(`  ASCII Preview: "${ascii}"`);
      }
    }
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Export metadata analysis as JSON
 */
export function exportMetadataAnalysis(analysis: MetadataAnalysis): string {
  return JSON.stringify(analysis, null, 2);
}



