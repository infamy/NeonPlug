import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useRadioStore } from '../../store/radioStore';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useContactsStore } from '../../store/contactsStore';

export const SettingsTab: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { settings, radioInfo } = useRadioStore();
  const { channels } = useChannelsStore();
  const { zones } = useZonesStore();
  const { contacts } = useContactsStore();

  const formatAddress = (addr?: number) => {
    if (addr === undefined) return 'N/A';
    return `0x${addr.toString(16).padStart(6, '0').toUpperCase()}`;
  };

  // Calculate usage statistics
  const channelUsage = {
    used: channels.length,
    total: 4000,
    percent: Math.round((channels.length / 4000) * 100),
  };

  const zoneUsage = {
    used: zones.length,
    total: 250, // Max zones per spec
    percent: Math.round((zones.length / 250) * 100),
  };

  const contactUsage = {
    used: contacts.length,
    total: 10000, // Max contacts per spec
    percent: Math.round((contacts.length / 10000) * 100),
  };

  return (
    <div className="h-full">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-neon-cyan">Radio Information</h2>
        <Button onClick={() => setIsModalOpen(true)}>
          Edit Settings
        </Button>
      </div>
      
      <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 space-y-6">
        {radioInfo ? (
          <>
            <div>
              <h3 className="text-lg font-semibold text-neon-cyan mb-3">Radio Details</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-cool-gray">Model:</span>
                  <div className="text-white font-mono">{radioInfo.model}</div>
                </div>
                <div>
                  <span className="text-cool-gray">Firmware:</span>
                  <div className="text-white font-mono">{radioInfo.firmware}</div>
                </div>
                {radioInfo.buildDate && (
                  <div>
                    <span className="text-cool-gray">Build Date:</span>
                    <div className="text-white font-mono">{radioInfo.buildDate}</div>
                  </div>
                )}
                {radioInfo.dspVersion && (
                  <div>
                    <span className="text-cool-gray">DSP Version:</span>
                    <div className="text-white font-mono">{radioInfo.dspVersion}</div>
                  </div>
                )}
                {radioInfo.radioVersion && (
                  <div>
                    <span className="text-cool-gray">Radio Version:</span>
                    <div className="text-white font-mono">{radioInfo.radioVersion}</div>
                  </div>
                )}
                {radioInfo.codeplugVersion && (
                  <div>
                    <span className="text-cool-gray">Codeplug Version:</span>
                    <div className="text-white font-mono">{radioInfo.codeplugVersion}</div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-neon-cyan mb-3">Memory Layout</h3>
              <div className="space-y-2 font-mono text-sm">
                <div className="flex justify-between">
                  <span className="text-cool-gray">Main Config:</span>
                  <span className="text-white">
                    {formatAddress(radioInfo.memoryLayout.configStart)} - {formatAddress(radioInfo.memoryLayout.configEnd)}
                  </span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-neon-cyan mb-3">Usage Statistics</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-cool-gray">Channels:</span>
                    <span className="text-white font-mono">
                      {channelUsage.used} / {channelUsage.total} ({channelUsage.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-deep-gray rounded-full h-2">
                    <div
                      className="bg-neon-cyan h-2 rounded-full transition-all"
                      style={{ width: `${channelUsage.percent}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-cool-gray">Zones:</span>
                    <span className="text-white font-mono">
                      {zoneUsage.used} / {zoneUsage.total} ({zoneUsage.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-deep-gray rounded-full h-2">
                    <div
                      className="bg-neon-cyan h-2 rounded-full transition-all"
                      style={{ width: `${zoneUsage.percent}%` }}
                    />
                  </div>
                </div>
                
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-cool-gray">Contacts:</span>
                    <span className="text-white font-mono">
                      {contactUsage.used} / {contactUsage.total} ({contactUsage.percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-deep-gray rounded-full h-2">
                    <div
                      className="bg-neon-cyan h-2 rounded-full transition-all"
                      style={{ width: `${contactUsage.percent}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {settings && (
              <div>
                <h3 className="text-lg font-semibold text-neon-cyan mb-3">Band Limits</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-cool-gray">VHF Range:</span>
                    <div className="text-white">
                      {settings.bandLimits.vhfMin.toFixed(4)} - {settings.bandLimits.vhfMax.toFixed(4)} MHz
                    </div>
                  </div>
                  <div>
                    <span className="text-cool-gray">UHF Range:</span>
                    <div className="text-white">
                      {settings.bandLimits.uhfMin.toFixed(4)} - {settings.bandLimits.uhfMax.toFixed(4)} MHz
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-cool-gray">No radio information available. Read from radio to view details.</p>
        )}
      </div>
      
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Radio Settings"
      >
        <p className="text-cool-gray">Settings editor coming soon...</p>
      </Modal>
    </div>
  );
};

