import React, { useState, useMemo } from 'react';
import { useAlert } from '../../hooks/useAlert';
import { useRadioStore } from '../../store/radioStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { MetadataBlockDisplay } from './MetadataBlockDisplay';
import { CollapsibleSection } from './CollapsibleSection';
import { OffsetInspector } from './OffsetInspector';
import { FieldVerificationTable } from './FieldVerificationTable';
import { DebugExportsCard } from './DebugExportsCard';
import { LogViewerPanel } from './LogViewerPanel';
import { ExpectedWriteDataPanel } from './ExpectedWriteDataPanel';
import { ChannelParserPanel } from './ChannelParserPanel';
import { CpsComparisonPanel } from './CpsComparisonPanel';
import { BootImagePanel } from './BootImagePanel';
import { ContactBlocksPanel } from './ContactBlocksPanel';
import { ContactWriteBlocksPanel } from './ContactWriteBlocksPanel';
import { TxContactStructureReference } from './TxContactStructureReference';
import { QuickContactsBlockDetails } from './QuickContactsBlockDetails';
import { TalkGroupsBlockDetails } from './TalkGroupsBlockDetails';
import { RegionDumpPanel } from './RegionDumpPanel';
import { RecordLayoutPanel } from './RecordLayoutPanel';
import { MemoryImagePanel } from './MemoryImagePanel';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { EmptyState } from '../ui/EmptyState';
import { ConfirmModal } from '../ui/ConfirmModal';

export const DiagnosticsTab: React.FC = () => {
  const { rawRadioSettingsData, blockMetadata, blockData } = useRadioStore();
  const { settings: radioSettings } = useRadioSettingsStore();
  const { caps } = useRadioCapabilities();
  // Per-radio hex annotations for the offset inspectors below.
  const blockLayouts = caps?.diagnostics?.blockLayouts;
  // Shared between ChannelParserPanel and CpsComparisonPanel.
  const [selectedChannelNumber, setSelectedChannelNumber] = useState<number>(1);
  const { alertOpen, alertMessage, alertTitle, showAlert, closeAlert } = useAlert();

  // Find block with metadata 0x41
  const block41Address = useMemo(() => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === 0x41) {
        return address;
      }
    }
    return null;
  }, [blockMetadata]);

  const block41Data = (block41Address !== null ? blockData.get(block41Address) : null) ?? null;

  // Helper function to find block data by metadata number
  const getBlockByMetadata = (metadataNum: number): { data: Uint8Array | null; address: number | null } => {
    for (const [address, metadata] of blockMetadata.entries()) {
      if (metadata.metadata === metadataNum) {
        return {
          data: blockData.get(address) || null,
          address
        };
      }
    }
    return { data: null, address: null };
  };

  const block02 = getBlockByMetadata(0x02);
  const block10 = getBlockByMetadata(0x10); // Digital Emergency Systems and Encryption Keys
  const block06 = getBlockByMetadata(0x06);
  const block0A = getBlockByMetadata(0x0A);
  const block0B = getBlockByMetadata(0x0B);
  const block0F = getBlockByMetadata(0x0F);
  const block11 = getBlockByMetadata(0x11); // Scan Lists
  const block42 = getBlockByMetadata(0x42);
  const block43 = getBlockByMetadata(0x43);
  const block44 = getBlockByMetadata(0x44);
  const block67 = getBlockByMetadata(0x67);

  if (!radioSettings || !rawRadioSettingsData) {
    // Everything below this point inspects DM-32 clone blocks, which only exist
    // for radios with a block layout. The simpler radios (and the sparse,
    // address-addressed D890 family) never populate rawRadioSettingsData, so
    // without this they would land on a permanently empty tab. Show the
    // radio-agnostic tools instead — capability-gated, never model-gated.
    const hasGenericTools =
      caps?.supportsRawRegionDump === true ||
      (caps?.memoryRegions?.length ?? 0) > 0;

    return (
      <>
      <div className="h-full overflow-y-auto">
        <div className="p-6">
          <div className="mb-6">
            <SectionTitle as="h2" size="xl" bold className="text-2xl !text-yellow-400">Diagnostics & Debug</SectionTitle>
            <p className="text-cool-gray text-sm mt-1">
              {hasGenericTools
                ? 'Raw memory inspection and debug exports'
                : 'Radio settings diagnostic tools'}
            </p>
          </div>

          {/* Debug Export Section - Always visible */}
          <DebugExportsCard showAlert={showAlert} />

          {/* Radio-agnostic tools, each capability-gated so they appear only
              where they apply: clone radios with a contiguous image get the
              image viewer, sparse address-addressed radios get the region dump. */}
          <MemoryImagePanel showAlert={showAlert} />
          <RegionDumpPanel showAlert={showAlert} />
          {/* Byte maps and the protocol reference for sparse address-addressed
              radios. Renders with no radio connected, which is when it is most
              useful — the clone-block panels below have nothing to show for a
              radio with no contiguous image, which is what left this tab nearly
              empty for the DA-7X2. */}
          <RecordLayoutPanel />

          {!hasGenericTools && (
            <Card className="!border-yellow-600/30">
              <EmptyState message="No radio settings data available. Read from radio to view diagnostics." />
            </Card>
          )}

          <LogViewerPanel />
        </div>
      </div>
      <ConfirmModal
        isOpen={alertOpen}
        onClose={closeAlert}
        title={alertTitle}
        message={alertMessage}
        confirmLabel="OK"
        variant="alert"
      />
      </>
    );
  }

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <SectionTitle as="h2" size="xl" bold className="text-2xl !text-yellow-400">Diagnostics & Debug</SectionTitle>
            <p className="text-cool-gray text-sm mt-1">Inspect raw memory offsets and verify field parsing</p>
          </div>
        </div>
      </div>

      {/* Debug Export Section */}
      <DebugExportsCard showAlert={showAlert} />

      {/* Boot Image (Raw) - from Settings read */}
      <BootImagePanel />

      {/* Metadata Block 0x02 (Calibration) */}
      <MetadataBlockDisplay
        metadata={0x02}
        blockData={block02.data}
        blockAddress={block02.address}
        description="Calibration data"
      />

      {/* Metadata Block 0x04 - Radio Settings */}
      <MetadataBlockDisplay
        metadata={0x04}
        blockData={rawRadioSettingsData}
        blockAddress={null}
        description="Radio configuration settings"
      >
        {/* Offset Inspector */}
        <CollapsibleSection title="Offset Inspector">
          {rawRadioSettingsData && (
            <OffsetInspector
              data={rawRadioSettingsData}
              idPrefix="offset"
              placeholder="0x120"
              layout={blockLayouts?.[0x04]}
            />
          )}
        </CollapsibleSection>

        {/* Field Verification Table */}
        <CollapsibleSection title="Field Verification">
          {rawRadioSettingsData && !caps?.diagnostics && (
            <p className="text-cool-gray">Field verification not available for this radio.</p>
          )}
          {rawRadioSettingsData && caps?.diagnostics && (() => {
            try {
              const parsed = caps.diagnostics.parseRadioSettings(rawRadioSettingsData);
              const fields = [
                { name: 'Power On Interface', offset: 0x00, parsed: parsed.powerOnInterface, ui: radioSettings?.powerOnInterface, rawHex: rawRadioSettingsData[0x00] },
                { name: 'Backlight Brightness', offset: 0x30, parsed: parsed.backlightBrightness, ui: radioSettings?.backlightBrightness, rawHex: rawRadioSettingsData[0x30] },
                { name: 'Callsign Color', offset: 0x34, parsed: parsed.callsignColor, ui: radioSettings?.callsignColor, rawHex: rawRadioSettingsData[0x34] },
                { name: 'Standby Text Color', offset: 0x35, parsed: parsed.standbyTextColor, ui: radioSettings?.standbyTextColor, rawHex: rawRadioSettingsData[0x35] },
                { name: 'Channel A Color', offset: 0x38, parsed: parsed.channelAColor, ui: radioSettings?.channelAColor, rawHex: rawRadioSettingsData[0x38] },
                { name: 'Channel B Color', offset: 0x39, parsed: parsed.channelBColor, ui: radioSettings?.channelBColor, rawHex: rawRadioSettingsData[0x39] },
                { name: 'Zone A Color', offset: 0x3A, parsed: parsed.zoneAColor, ui: radioSettings?.zoneAColor, rawHex: rawRadioSettingsData[0x3A] },
                { name: 'Zone B Color', offset: 0x3B, parsed: parsed.zoneBColor, ui: radioSettings?.zoneBColor, rawHex: rawRadioSettingsData[0x3B] },
                { name: 'UTC Zone', offset: 0x41, parsed: parsed.utcZone, ui: radioSettings?.utcZone, rawHex: rawRadioSettingsData[0x41] },
                { name: 'Lock Key', offset: 0x85, parsed: parsed.lockKey, ui: radioSettings?.lockKey, isBit: true, rawHex: rawRadioSettingsData[0x85] },
                { name: 'Auto Keypad Lock Delay', offset: 0x86, parsed: parsed.autoKeypadLockDelayTime, ui: radioSettings?.autoKeypadLockDelayTime, rawHex: rawRadioSettingsData[0x86] },
                { name: 'SK1 Short', offset: 0x87, parsed: parsed.sk1Short, ui: radioSettings?.sk1Short, rawHex: rawRadioSettingsData[0x87] },
                { name: 'SK1 Long', offset: 0x88, parsed: parsed.sk1Long, ui: radioSettings?.sk1Long, rawHex: rawRadioSettingsData[0x88] },
                { name: 'SK2 Short', offset: 0x89, parsed: parsed.sk2Short, ui: radioSettings?.sk2Short, rawHex: rawRadioSettingsData[0x89] },
                { name: 'SK2 Long', offset: 0x8A, parsed: parsed.sk2Long, ui: radioSettings?.sk2Long, rawHex: rawRadioSettingsData[0x8A] },
                { name: 'P1 Short', offset: 0x8D, parsed: parsed.p1Short, ui: radioSettings?.p1Short, rawHex: rawRadioSettingsData[0x8D] },
                { name: 'P1 Long', offset: 0x8E, parsed: parsed.p1Long, ui: radioSettings?.p1Long, rawHex: rawRadioSettingsData[0x8E] },
                { name: 'P2 Short', offset: 0x8F, parsed: parsed.p2Short, ui: radioSettings?.p2Short, rawHex: rawRadioSettingsData[0x8F] },
                { name: 'P2 Long', offset: 0x90, parsed: parsed.p2Long, ui: radioSettings?.p2Long, rawHex: rawRadioSettingsData[0x90] },
                { name: 'Long Press Time', offset: 0x93, parsed: parsed.longPressTime, ui: radioSettings?.longPressTime, rawHex: rawRadioSettingsData[0x93] },
              ];
              return <FieldVerificationTable fields={fields} data={rawRadioSettingsData} />;
            } catch (err) {
              return (
                <div className="bg-dark-charcoal rounded-lg border border-yellow-600/20 p-4">
                  <div className="text-red-400 text-center">
                    Error parsing: {err instanceof Error ? err.message : String(err)}
                  </div>
                </div>
              );
            }
          })()}
        </CollapsibleSection>

      </MetadataBlockDisplay>

      {/* Metadata Block 0x06 (Config Section 4 - Talk Groups Counter) */}
      <MetadataBlockDisplay
        metadata={0x06}
        blockData={block06.data}
        blockAddress={block06.address}
        description="Config Section 4 - Talk Groups counter at offset 0x1FF"
      />

      {/* Metadata Block 0x0A (Quick Messages) */}
      <MetadataBlockDisplay
        metadata={0x0A}
        blockData={block0A.data}
        blockAddress={block0A.address}
        description="Quick Messages"
      />

      {/* Metadata Block 0x0B - Quick Access Contact List */}
      <MetadataBlockDisplay
        metadata={0x0B}
        blockData={block0B.data}
        blockAddress={block0B.address}
        description="Quick Access Contact List"
      >
        {block0B.data && (
          <QuickContactsBlockDetails data={block0B.data} />
        )}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x0F (RX Groups) */}
      <MetadataBlockDisplay
        metadata={0x0F}
        blockData={block0F.data}
        blockAddress={block0F.address}
        description="RX Groups"
      />

      {/* Metadata Block 0x10 (Digital Emergency Systems and Encryption Keys) */}
      <MetadataBlockDisplay
        metadata={0x10}
        blockData={block10.data}
        blockAddress={block10.address}
        description="Digital Emergency Systems and Encryption Keys"
      />

      {/* Metadata Block 0x11 (Scan Lists) */}
      <MetadataBlockDisplay
        metadata={0x11}
        blockData={block11.data}
        blockAddress={block11.address}
        description="Scan Lists"
      />

      {/* Metadata Block 0x41 */}
      <MetadataBlockDisplay
        metadata={0x41}
        blockData={block41Data}
        blockAddress={block41Address}
      >
            {/* Offset Inspector for Block 0x41 */}
            <CollapsibleSection title="Offset Inspector (Block 0x41)">
              {block41Data && (
                <OffsetInspector
                  data={block41Data}
                  idPrefix="offset41"
                  placeholder="0x000"
                  layout={blockLayouts?.[0x41]}
                />
              )}
            </CollapsibleSection>

            {/* Field Verification for Block 0x41 */}
            <CollapsibleSection title="Field Verification (Block 0x41)">
              {block41Data && radioSettings && (
                <FieldVerificationTable
                  fields={[
                    { 
                      name: 'VFO A Channel (4001)', 
                      offset: 0x0F9F, 
                      parsed: radioSettings.vfoA?.name || 'N/A', 
                      ui: radioSettings.vfoA?.name || 'N/A',
                      rawHex: block41Data[0x0F9F] || 0
                    },
                    { 
                      name: 'VFO A RX Frequency', 
                      offset: 0x0FAF, 
                      parsed: radioSettings.vfoA?.rxFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoA?.rxFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FAF] || 0
                    },
                    { 
                      name: 'VFO A TX Frequency', 
                      offset: 0x0FB3, 
                      parsed: radioSettings.vfoA?.txFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoA?.txFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FB3] || 0
                    },
                    { 
                      name: 'VFO B Channel (4002)', 
                      offset: 0x0FCF, 
                      parsed: radioSettings.vfoB?.name || 'N/A', 
                      ui: radioSettings.vfoB?.name || 'N/A',
                      rawHex: block41Data[0x0FCF] || 0
                    },
                    { 
                      name: 'VFO B RX Frequency', 
                      offset: 0x0FDF, 
                      parsed: radioSettings.vfoB?.rxFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoB?.rxFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FDF] || 0
                    },
                    { 
                      name: 'VFO B TX Frequency', 
                      offset: 0x0FE3, 
                      parsed: radioSettings.vfoB?.txFrequency?.toFixed(4) || 'N/A', 
                      ui: radioSettings.vfoB?.txFrequency?.toFixed(4) || 'N/A',
                      rawHex: block41Data[0x0FE3] || 0
                    },
                  ]}
                  data={block41Data}
                />
              )}
            </CollapsibleSection>

      </MetadataBlockDisplay>

      {/* Metadata Block 0x42 (TX Contact - Channels 1-2048) */}
      <MetadataBlockDisplay
        metadata={0x42}
        blockData={block42.data}
        blockAddress={block42.address}
        description="TX Contact for Channels 1-2048 (2 bytes per channel: Talk Group Index)"
      >
        {block42.data && (
          <TxContactStructureReference variant="0x42" data={block42.data} />
        )}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x43 (TX Contact - Channels 2049+ and VFOs) */}
      <MetadataBlockDisplay
        metadata={0x43}
        blockData={block43.data}
        blockAddress={block43.address}
        description="TX Contact for Channels 2049+ and VFOs (2 bytes per channel: Talk Group Index)"
      >
        {block43.data && (
          <TxContactStructureReference variant="0x43" data={block43.data} />
        )}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x44 (Talk Groups) */}
      <MetadataBlockDisplay
        metadata={0x44}
        blockData={block44.data}
        blockAddress={block44.address}
        description="Talk Groups (DMR Group IDs)"
      >
        {block44.data && (
          <TalkGroupsBlockDetails data={block44.data} quickAccessData={block0B.data} />
        )}
      </MetadataBlockDisplay>

      {/* Metadata Block 0x67 */}
      <MetadataBlockDisplay
        metadata={0x67}
        blockData={block67.data}
        blockAddress={block67.address}
      />

      {/* Contact Blocks */}
      <ContactBlocksPanel showAlert={showAlert} />

      {/* Contact Write Blocks */}
      <ContactWriteBlocksPanel />

      {/* Channel Parser */}
      <ChannelParserPanel
        selectedChannelNumber={selectedChannelNumber}
        setSelectedChannelNumber={setSelectedChannelNumber}
        block41Data={block41Data}
        block41Address={block41Address}
      />

      {/* CPS CSV Comparison */}
      <CpsComparisonPanel
        selectedChannelNumber={selectedChannelNumber}
        setSelectedChannelNumber={setSelectedChannelNumber}
        showAlert={showAlert}
      />

      {/* Expected Write Data Section */}
      <ExpectedWriteDataPanel showAlert={showAlert} />

      {/* Logs Viewer */}
      <LogViewerPanel />

    </div>
    <ConfirmModal
      isOpen={alertOpen}
      onClose={closeAlert}
      title={alertTitle}
      message={alertMessage}
      confirmLabel="OK"
      variant="alert"
    />
    </>
  );
};

