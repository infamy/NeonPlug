import React, { useState, useRef, useEffect, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { AnalogEmergencyList } from '../digital/AnalogEmergencyList';
import { useRadioStore } from '../../store/radioStore';
import { useRadioCapabilities } from '../../hooks/useRadioCapabilities';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { parseBootImageHeader, rgb565ToImageData, imageDataToRgb565, buildBootImagePayload, BOOT_IMAGE } from '../../utils/bootImage';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useCalibrationStore } from '../../store/calibrationStore';
import { CALIBRATION_PARAM_NAMES } from '../../models/Calibration';
import { Modal } from '../ui/Modal';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import {
  ANALOG_CALL_TYPE_OPTIONS,
  ONE_TOUCH_CALL_TYPE_OPTIONS,
  DIGITAL_CALL_TYPE_OPTIONS,
  FUN_PLUS_OPERATE_MODE_OPTIONS,
  FUN_PLUS_MENU_SELECT_OPTIONS,
  FUN_PLUS_CALL_WAY_OPTIONS,
} from './settingsConstants';
import { formatAddress } from '../../utils/formatHelpers';
import { getSettingsProfileForModel } from '../../data/settingsProfiles';
import { SettingsFieldRenderer } from './fields';
import type { RadioSettings } from '../../models/RadioSettings';
import type { SettingsFieldDescriptor } from '../../types/settingsProfile';

/** Get value from settings by key; supports nested path (e.g. menuEnableFlags.zoneList) and lockKey mapping */
function getFieldValue(settings: RadioSettings | null, key: string): unknown {
  if (!settings) return undefined;
  if (key === 'lockKey') return settings.lockKey === 'Auto' ? 1 : 0;
  if (key.includes('.')) {
    const parts = key.split('.');
    let v: unknown = settings;
    for (const p of parts) v = (v as unknown as Record<string, unknown>)?.[p];
    return v;
  }
  return (settings as unknown as Record<string, unknown>)[key];
}

/** Build partial update for a field key; supports nested path and lockKey mapping */
function handleFieldChange(
  settings: RadioSettings | null,
  key: string,
  value: unknown,
  updateRadioSettings: (u: Partial<RadioSettings>) => void
): void {
  if (!settings) return;
  if (key === 'lockKey') {
    updateRadioSettings({ lockKey: value === 1 ? 'Auto' : 'Manual' });
    return;
  }
  if (key.includes('.')) {
    const [parent, ...rest] = key.split('.');
    const leaf = rest.join('.');
    const parentObj = (settings as unknown as Record<string, unknown>)[parent];
    const spread = typeof parentObj === 'object' && parentObj !== null ? { ...(parentObj as Record<string, unknown>) } : {};
    (spread as Record<string, unknown>)[leaf] = value;
    updateRadioSettings({ [parent]: spread } as Partial<RadioSettings>);
    return;
  }
  updateRadioSettings({ [key]: value } as Partial<RadioSettings>);
}

export const SettingsTab: React.FC = () => {
  const { radioInfo, bootImageRaw } = useRadioStore();
  const { readBootImage, writeBootImage, isConnecting } = useRadioConnection();
  const [bootImageProgress, setBootImageProgress] = useState(0);
  const [bootImageMessage, setBootImageMessage] = useState('');
  const [bootImageError, setBootImageError] = useState<string | null>(null);
  const [pendingBootImagePayload, setPendingBootImagePayload] = useState<Uint8Array | null>(null);
  const [bootImageDragOver, setBootImageDragOver] = useState(false);
  const [bootImageCropUrl, setBootImageCropUrl] = useState<string | null>(null);
  const [bootImageCropPixels, setBootImageCropPixels] = useState<Area | null>(null);
  const [bootImageCrop, setBootImageCrop] = useState({ x: 0, y: 0 });
  const [bootImageZoom, setBootImageZoom] = useState(1);
  const [showBootImageCropModal, setShowBootImageCropModal] = useState(false);
  const bootImageCanvasRef = useRef<HTMLCanvasElement>(null);
  const uploadCanvasRef = useRef<HTMLCanvasElement>(null);
  const bootImageFileInputRef = useRef<HTMLInputElement>(null);
  const { channels } = useChannelsStore();
  const { zones } = useZonesStore();
  const { contacts, contactsLoaded } = useContactsStore();
  const { settings: radioSettings, updateSettings: updateRadioSettings } = useRadioSettingsStore();
  const { calibration, calibrationLoaded } = useCalibrationStore();
  const [showCalibration, setShowCalibration] = useState(false);
  const [showFirmwareWarning, setShowFirmwareWarning] = useState(false);

  const { caps, model: effectiveModel } = useRadioCapabilities();
  const EXPECTED_FIRMWARE = 'DM32.01.L01.048';
  const hasRealFirmware = !!(radioInfo?.firmware && radioInfo.firmware !== '-' && radioInfo.firmware.trim() !== '');
  const isNewerFirmware = !!(hasRealFirmware && caps?.isFirmware049OrNewer?.(radioInfo!.firmware));
  const needsFirmwareUpdate = hasRealFirmware && radioInfo!.firmware !== EXPECTED_FIRMWARE && !isNewerFirmware;

  /** Display value for device info fields; show "-" when unknown (e.g. after convert). */
  const deviceValue = (v: string | undefined) => (v && v.trim() && v !== '-' ? v : '-');

  // Usage statistics: totals from current radio capabilities (converted codeplug shows target radio limits)
  const maxChannels = caps?.maxChannels ?? 4000;
  const maxZones = caps?.maxZones ?? (caps?.supportsZones ? 250 : 0);
  const maxContacts = caps?.supportsContacts ? (radioInfo?.maxContacts ?? 50000) : 0;
  const vfoCount = (radioSettings?.vfoA ? 1 : 0) + (radioSettings?.vfoB ? 1 : 0);
  const channelUsage = {
    used: channels.length - vfoCount,
    total: maxChannels,
    percent: maxChannels > 0 ? Math.round(((channels.length - vfoCount) / maxChannels) * 100) : 0,
  };

  const zoneUsage = {
    used: zones.length,
    total: maxZones,
    percent: maxZones > 0 ? Math.round((zones.length / maxZones) * 100) : 0,
  };

  const contactUsage = {
    used: contacts.length,
    total: maxContacts,
    percent: maxContacts > 0 && contactsLoaded ? Math.round((contacts.length / maxContacts) * 100) : 0,
    loaded: contactsLoaded,
  };

  // Draw radio image on left canvas when bootImageRaw changes
  useEffect(() => {
    if (!bootImageRaw || bootImageRaw.length < BOOT_IMAGE.SIZE || !bootImageCanvasRef.current) return;
    try {
      const parsed = parseBootImageHeader(bootImageRaw);
      const imageData = rgb565ToImageData(parsed.bgr565);
      const canvas = bootImageCanvasRef.current;
      canvas.width = BOOT_IMAGE.WIDTH;
      canvas.height = BOOT_IMAGE.HEIGHT;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const bitmap = new ImageData(imageData.data, imageData.width, imageData.height);
        ctx.putImageData(bitmap, 0, 0);
      }
    } catch {
      // Ignore draw errors
    }
  }, [bootImageRaw]);

  // Draw uploaded image on right canvas when pendingBootImagePayload changes
  useEffect(() => {
    if (!pendingBootImagePayload || pendingBootImagePayload.length < BOOT_IMAGE.SIZE || !uploadCanvasRef.current) return;
    try {
      const parsed = parseBootImageHeader(pendingBootImagePayload);
      const imageData = rgb565ToImageData(parsed.bgr565);
      const canvas = uploadCanvasRef.current;
      canvas.width = BOOT_IMAGE.WIDTH;
      canvas.height = BOOT_IMAGE.HEIGHT;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const bitmap = new ImageData(imageData.data, imageData.width, imageData.height);
        ctx.putImageData(bitmap, 0, 0);
      }
    } catch {
      // Ignore draw errors
    }
  }, [pendingBootImagePayload]);

  const handleReadBootImage = async () => {
    setBootImageError(null);
    setBootImageProgress(0);
    setBootImageMessage('Starting...');
    try {
      await readBootImage((progress, message) => {
        setBootImageProgress(progress);
        setBootImageMessage(message);
      });
    } catch (err) {
      setBootImageError(err instanceof Error ? err.message : 'Failed to read boot image');
    } finally {
      setBootImageProgress(100);
      setBootImageMessage('');
    }
  };

  const handleWriteBootImageToRadio = async () => {
    if (!pendingBootImagePayload || pendingBootImagePayload.length !== BOOT_IMAGE.SIZE) return;
    setBootImageError(null);
    setBootImageProgress(0);
    setBootImageMessage('Starting...');
    try {
      await writeBootImage(pendingBootImagePayload, (progress, message) => {
        setBootImageProgress(progress);
        setBootImageMessage(message);
      });
      setPendingBootImagePayload(null);
    } catch (err) {
      setBootImageError(err instanceof Error ? err.message : 'Failed to write boot image');
    } finally {
      setBootImageProgress(100);
      setBootImageMessage('');
    }
  };


  const BOOT_IMAGE_ASPECT = BOOT_IMAGE.WIDTH / BOOT_IMAGE.HEIGHT;

  const getDefaultCropArea = useCallback((imgWidth: number, imgHeight: number): Area => {
    const imgAspect = imgWidth / imgHeight;
    let cropW: number;
    let cropH: number;
    if (imgAspect > BOOT_IMAGE_ASPECT) {
      cropH = imgHeight;
      cropW = imgHeight * BOOT_IMAGE_ASPECT;
    } else {
      cropW = imgWidth;
      cropH = imgWidth / BOOT_IMAGE_ASPECT;
    }
    return {
      x: Math.round((imgWidth - cropW) / 2),
      y: Math.round((imgHeight - cropH) / 2),
      width: Math.round(cropW),
      height: Math.round(cropH),
    };
  }, []);

  const processBootImageFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      setBootImageError('Please choose an image file');
      return;
    }
    setBootImageError(null);
    if (bootImageCropUrl) URL.revokeObjectURL(bootImageCropUrl);
    const url = URL.createObjectURL(file);
    setBootImageCropUrl(url);
    setBootImageCropPixels(null);
    setBootImageCrop({ x: 0, y: 0 });
    setBootImageZoom(1);
    setShowBootImageCropModal(true);
  }, [bootImageCropUrl]);

  const closeBootImageCropModal = useCallback(() => {
    if (bootImageCropUrl) {
      URL.revokeObjectURL(bootImageCropUrl);
      setBootImageCropUrl(null);
    }
    setBootImageCropPixels(null);
    setBootImageCrop({ x: 0, y: 0 });
    setBootImageZoom(1);
    setShowBootImageCropModal(false);
  }, [bootImageCropUrl]);

  const handleBootImageCropComplete = useCallback((_croppedArea: Area, croppedAreaPixels: Area) => {
    setBootImageCropPixels(croppedAreaPixels);
  }, []);

  const applyBootImageCrop = useCallback(() => {
    if (!bootImageCropUrl) return;
    const img = new Image();
    img.onload = () => {
      try {
        const area = bootImageCropPixels ?? getDefaultCropArea(img.naturalWidth, img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = BOOT_IMAGE.WIDTH;
        canvas.height = BOOT_IMAGE.HEIGHT;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          closeBootImageCropModal();
          return;
        }
        ctx.drawImage(
          img,
          area.x, area.y, area.width, area.height,
          0, 0, BOOT_IMAGE.WIDTH, BOOT_IMAGE.HEIGHT
        );
        const imageData = ctx.getImageData(0, 0, BOOT_IMAGE.WIDTH, BOOT_IMAGE.HEIGHT);
        const rgb565 = imageDataToRgb565(imageData);
        const payload = buildBootImagePayload('', rgb565);
        setPendingBootImagePayload(payload);
      } catch (err) {
        setBootImageError(err instanceof Error ? err.message : 'Failed to apply crop');
      }
      closeBootImageCropModal();
    };
    img.onerror = () => {
      setBootImageError('Failed to load image');
      closeBootImageCropModal();
    };
    img.src = bootImageCropUrl;
  }, [bootImageCropUrl, bootImageCropPixels, getDefaultCropArea, closeBootImageCropModal]);

  const handleUploadBootImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    processBootImageFile(file);
  };

  const handleBootImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setBootImageDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    processBootImageFile(file);
  };

  const handleBootImageDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBootImageDragOver(true);
  };

  const handleBootImageDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setBootImageDragOver(false);
  };

  return (
    <div className="h-full overflow-y-auto">
      {/* Boot image crop modal */}
      <Modal
        isOpen={showBootImageCropModal}
        onClose={closeBootImageCropModal}
        title="Crop boot image (240×320)"
      >
        {bootImageCropUrl && (
          <>
            <p className="text-cool-gray text-sm mb-3">
              Drag the image up, down, or sideways to pan; use the slider to zoom. The frame is 240×320. Click Apply when done.
            </p>
            <div className="relative w-full h-[360px] rounded-lg overflow-hidden bg-dark-charcoal mb-4">
              <Cropper
                image={bootImageCropUrl}
                crop={bootImageCrop}
                zoom={bootImageZoom}
                aspect={BOOT_IMAGE_ASPECT}
                onCropChange={setBootImageCrop}
                onZoomChange={setBootImageZoom}
                onCropComplete={handleBootImageCropComplete}
                cropShape="rect"
                showGrid={true}
                objectFit="contain"
                restrictPosition={false}
                style={{ containerStyle: { backgroundColor: '#121212' } }}
              />
            </div>
            <div className="flex flex-col gap-2 mb-4">
              <label className="text-cool-gray text-sm">Zoom</label>
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.1}
                value={bootImageZoom}
                onChange={(e) => setBootImageZoom(Number(e.target.value))}
                className="w-full accent-neon-cyan"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeBootImageCropModal}
                className="px-4 py-2 bg-dark-charcoal border border-neon-cyan border-opacity-50 text-neon-cyan text-sm font-medium rounded hover:bg-neon-cyan hover:text-black transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBootImageCrop}
                className="px-4 py-2 bg-neon-cyan text-black text-sm font-medium rounded hover:bg-cyan-300 transition-colors"
              >
                Apply
              </button>
            </div>
          </>
        )}
      </Modal>

      <div className="mb-6">
        <SectionTitle as="h2" size="xl" bold className="text-2xl">Settings</SectionTitle>
        <p className="text-cool-gray text-sm mt-1">Radio information, memory usage, and configuration</p>
      </div>

      {!radioInfo ? (
        <Card variant="subdued" className="border-opacity-30 text-center">
          <p className="text-cool-gray">No radio information available. Read from radio to view details.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Device Information Section */}
          <Card>
            <SectionTitle underline>Device Information</SectionTitle>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <span className="text-cool-gray text-sm block mb-1">Model</span>
                <div className="text-white font-mono">{radioInfo.model}</div>
              </div>
              <div>
                <span className="text-cool-gray text-sm block mb-1">Firmware</span>
                <div className="text-white font-mono flex items-center space-x-2">
                  <span>{deviceValue(radioInfo.firmware)}</span>
                  {(needsFirmwareUpdate || isNewerFirmware) && (
                    <button
                      onClick={() => setShowFirmwareWarning(true)}
                      className="text-yellow-400 hover:text-yellow-300 transition-colors cursor-pointer"
                      title={isNewerFirmware ? "Firmware version not recommended" : "Firmware update recommended"}
                    >
                      ⚠️
                    </button>
                  )}
                </div>
              </div>
              <div>
                <span className="text-cool-gray text-sm block mb-1">Build Date</span>
                <div className="text-white font-mono">{deviceValue(radioInfo.buildDate)}</div>
              </div>
              <div>
                <span className="text-cool-gray text-sm block mb-1">DSP Version</span>
                <div className="text-white font-mono text-sm">{deviceValue(radioInfo.dspVersion)}</div>
              </div>
              <div>
                <span className="text-cool-gray text-sm block mb-1">Radio Version</span>
                <div className="text-white font-mono text-sm">{deviceValue(radioInfo.radioVersion)}</div>
              </div>
              <div>
                <span className="text-cool-gray text-sm block mb-1">Codeplug Version</span>
                <div className="text-white font-mono text-sm">{deviceValue(radioInfo.codeplugVersion)}</div>
              </div>
            </div>
          </Card>

          {/* Memory & Storage Section */}
          <Card>
            <SectionTitle underline>Memory & Storage</SectionTitle>
            <div className="space-y-6 mt-4">
              {radioInfo?.memoryLayout && (
                <div>
                  <SectionTitle as="h4" size="md">Memory Layout</SectionTitle>
                  <div className="space-y-2 font-mono text-sm">
                    <div className="flex justify-between items-center py-2 px-3 bg-dark-charcoal rounded">
                      <span className="text-cool-gray">Configuration Region:</span>
                      <span className="text-white">
                        {formatAddress(radioInfo.memoryLayout.configStart)} - {formatAddress(radioInfo.memoryLayout.configEnd)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <SectionTitle as="h4" size="md">Usage Statistics</SectionTitle>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-cool-gray">Channels</span>
                      <span className="text-white font-mono text-sm">
                        {channelUsage.used} / {channelUsage.total} ({channelUsage.percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-dark-charcoal rounded-full h-2.5">
                      <div
                        className="bg-neon-cyan h-2.5 rounded-full transition-all"
                        style={{ width: `${channelUsage.percent}%` }}
                      />
                    </div>
                  </div>

                  {caps?.supportsZones !== false && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-cool-gray">Zones</span>
                      <span className="text-white font-mono text-sm">
                        {zoneUsage.used} / {zoneUsage.total} ({zoneUsage.percent}%)
                      </span>
                    </div>
                    <div className="w-full bg-dark-charcoal rounded-full h-2.5">
                      <div
                        className="bg-neon-cyan h-2.5 rounded-full transition-all"
                        style={{ width: `${zoneUsage.percent}%` }}
                      />
                    </div>
                  </div>
                  )}

                  {caps?.supportsContacts !== false && (
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-cool-gray">CSV Contacts</span>
                      <span className="text-white font-mono text-sm">
                        {contactUsage.loaded
                          ? `${contactUsage.used} / ${contactUsage.total.toLocaleString()} (${contactUsage.percent}%)`
                          : `unknown / ${contactUsage.total.toLocaleString()}`
                        }
                      </span>
                    </div>
                    {contactUsage.loaded && (
                      <div className="w-full bg-dark-charcoal rounded-full h-2.5">
                        <div
                          className="bg-neon-cyan h-2.5 rounded-full transition-all"
                          style={{ width: `${contactUsage.percent}%` }}
                        />
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Boot / Startup Image Section - only when profile declares bootImage feature */}
          {(() => {
            const profile = getSettingsProfileForModel(effectiveModel);
            return profile?.features?.includes('bootImage');
          })() && (
          <Card>
            <SectionTitle size="lg" underline>Boot / Startup Image</SectionTitle>
            <p className="text-cool-gray text-sm mb-6">
              Optionally read from the radio to see the current image, then import your image (drag and drop or click Import). It will be resized to 240×320 portrait. When it looks right, send it to the radio.
            </p>

            <div className="flex flex-col gap-6">
              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleReadBootImage}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-dark-charcoal border border-neon-cyan border-opacity-50 text-neon-cyan text-sm font-medium rounded hover:bg-neon-cyan hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Read current boot image from radio (optional)"
                >
                  Read from radio
                </button>
                <input
                  ref={bootImageFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadBootImage}
                />
                <button
                  type="button"
                  onClick={() => bootImageFileInputRef.current?.click()}
                  disabled={isConnecting}
                  className="px-4 py-2 bg-neon-cyan text-black text-sm font-medium rounded hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Choose an image; it will be resized to 240×320"
                >
                  Import
                </button>
                <span className="text-cool-gray text-sm">→</span>
                <button
                  type="button"
                  onClick={handleWriteBootImageToRadio}
                  disabled={isConnecting || !pendingBootImagePayload || pendingBootImagePayload.length !== BOOT_IMAGE.SIZE}
                  className="px-4 py-2 bg-neon-cyan text-black text-sm font-medium rounded hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Send your image to the radio"
                >
                  Write to radio
                </button>
              </div>

              {isConnecting && bootImageMessage && (
                <div className="flex items-center gap-3 max-w-sm">
                  <div className="flex-1 bg-dark-charcoal rounded-full h-2">
                    <div
                      className="bg-neon-cyan h-2 rounded-full transition-all"
                      style={{ width: `${bootImageProgress}%` }}
                    />
                  </div>
                  <span className="text-cool-gray text-sm truncate flex-shrink min-w-0" title={bootImageMessage}>{bootImageMessage}</span>
                </div>
              )}
              {bootImageError && (
                <p className="text-red-400 text-sm">{bootImageError}</p>
              )}

              {/* Previews side by side */}
              <div className="flex flex-wrap gap-8 items-start">
                <div className="flex flex-col gap-2">
                  <p className="text-cool-gray text-sm font-medium">On radio</p>
                  {bootImageRaw && bootImageRaw.length >= BOOT_IMAGE.SIZE ? (
                    <>
                      <canvas
                        ref={bootImageCanvasRef}
                        width={BOOT_IMAGE.WIDTH}
                        height={BOOT_IMAGE.HEIGHT}
                        className="border border-neon-cyan border-opacity-30 rounded bg-black"
                        style={{ width: 240, height: 320, imageRendering: 'pixelated' }}
                      />
                      <p className="text-cool-gray text-xs">Current boot image (read from radio)</p>
                    </>
                  ) : (
                    <div className="w-[240px] h-[320px] border border-neon-cyan border-opacity-20 rounded bg-dark-charcoal flex items-center justify-center text-cool-gray text-sm text-center px-2">
                      Optional: click &quot;Read from radio&quot; to view
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <p className="text-cool-gray text-sm font-medium">Import</p>
                  {pendingBootImagePayload && pendingBootImagePayload.length >= BOOT_IMAGE.SIZE ? (
                    <>
                      <canvas
                        ref={uploadCanvasRef}
                        width={BOOT_IMAGE.WIDTH}
                        height={BOOT_IMAGE.HEIGHT}
                        className="border border-neon-cyan border-opacity-30 rounded bg-black"
                        style={{ width: 240, height: 320, imageRendering: 'pixelated' }}
                      />
                      <p className="text-cyan-300 text-xs">Ready to send. Click &quot;Write to radio&quot; when you&apos;re happy with it.</p>
                    </>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      aria-label="Import boot image: drop file or click to choose"
                      onClick={() => bootImageFileInputRef.current?.click()}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') bootImageFileInputRef.current?.click(); }}
                      onDragOver={handleBootImageDragOver}
                      onDragLeave={handleBootImageDragLeave}
                      onDrop={handleBootImageDrop}
                      className={`w-[240px] h-[320px] border rounded bg-dark-charcoal flex flex-col items-center justify-center text-cool-gray text-sm text-center px-3 cursor-pointer transition-colors ${
                        bootImageDragOver
                          ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                          : 'border-neon-cyan border-opacity-20 hover:border-neon-cyan/50'
                      }`}
                    >
                      <span className="mb-1">Drop image here</span>
                      <span>or click Import</span>
                      <span className="text-xs mt-2 opacity-80">(resized to 240×320)</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
          )}

          {/* Radio Configuration - profile-driven */}
          {(() => {
            const profile = getSettingsProfileForModel(effectiveModel);
            if (!profile) {
              return radioSettings ? (
                <Card>
                  <p className="text-cool-gray">Settings not available for this radio.</p>
                </Card>
              ) : null;
            }
            if (!radioSettings) return null;
            return (
              <Card>
                <SectionTitle underline>Radio Configuration</SectionTitle>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                  {profile.sections.map((section) => (
                    <Card key={section.id} variant="subdued" padding="tight">
                      <SectionTitle as="h4" size="md">{section.title}</SectionTitle>
                      <div className="space-y-3">
                        {section.fields.map((field) => (
                          <SettingsFieldRenderer
                            key={field.key}
                            field={field as SettingsFieldDescriptor}
                            value={getFieldValue(radioSettings, field.key)}
                            onChange={(v) => handleFieldChange(radioSettings, field.key, v, updateRadioSettings)}
                          />
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              </Card>
            );
          })()}

          {/* One Key Operation (DM-32 only; UV5R-Mini uses uv5rMiniSettings, FT-65 uses ft65Settings) */}
          {radioSettings && !radioSettings.uv5rMiniSettings && !radioSettings.ft65Settings && (
            <Card className="mt-6">
              <SectionTitle underline>One Key Operation</SectionTitle>

              {/* Analog Call */}
              <div className="mb-6">
                <SectionTitle as="h4" size="md">Analog Call</SectionTitle>
                <p className="text-cool-gray text-sm mb-4">Configure 4 analog call shortcuts</p>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b border-neon-cyan border-opacity-30">
                        <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Entry</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Call Type</th>
                        <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Call ID/No</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[0, 1, 2, 3].map((index) => {
                        const entry = radioSettings.analogCall?.[index] || { callType: 0, callId: 0 };
                        return (
                          <tr key={index} className="border-b border-neon-cyan border-opacity-10 hover:bg-dark-charcoal">
                            <td className="py-2 px-3 text-cool-gray">Analog Call {index + 1}</td>
                            <td className="py-2 px-3">
                              <select
                                value={entry.callType ?? 0}
                                onChange={(e) => {
                                  const newAnalogCall = [...(radioSettings.analogCall || Array(4).fill({ callType: 0, callId: 0 }))];
                                  newAnalogCall[index] = { ...entry, callType: parseInt(e.target.value) || 0 };
                                  updateRadioSettings({ analogCall: newAnalogCall });
                                }}
                                className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan"
                              >
                                {ANALOG_CALL_TYPE_OPTIONS.map(option => (
                                  <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                min="0"
                                max="255"
                                value={entry.callId ?? 0}
                                onChange={(e) => {
                                  const newAnalogCall = [...(radioSettings.analogCall || Array(4).fill({ callType: 0, callId: 0 }))];
                                  newAnalogCall[index] = { ...entry, callId: parseInt(e.target.value) || 0 };
                                  updateRadioSettings({ analogCall: newAnalogCall });
                                }}
                                className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* One Touch Call */}
              <div className="mb-6 pt-6 border-t border-neon-cyan border-opacity-20">
                <SectionTitle as="h4" size="md">One Touch Call</SectionTitle>
                <p className="text-cool-gray text-sm mb-4">Configure 5 one-touch call shortcuts</p>
                <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neon-cyan border-opacity-30">
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Entry</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Call Type</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Call Object (Contact ID)</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Digital Call Type</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">SMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2, 3, 4].map((index) => {
                      const entry = radioSettings.oneTouchCall?.[index] || { callType: 0, callObject: 0, digitalCallType: 0, sms: 0 };
                      return (
                        <tr key={index} className="border-b border-neon-cyan border-opacity-10 hover:bg-dark-charcoal">
                          <td className="py-2 px-3 text-cool-gray">One Touch Call {index + 1}</td>
                          <td className="py-2 px-3">
                            <select
                              value={entry.callType ?? 0}
                              onChange={(e) => {
                                const newOneTouchCall = [...(radioSettings.oneTouchCall || Array(5).fill({ callType: 0, callObject: 0, digitalCallType: 0, sms: 0 }))];
                                newOneTouchCall[index] = { ...entry, callType: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ oneTouchCall: newOneTouchCall });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan"
                            >
                              {ONE_TOUCH_CALL_TYPE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max="65535"
                              value={entry.callObject ?? 0}
                              onChange={(e) => {
                                const newOneTouchCall = [...(radioSettings.oneTouchCall || Array(5).fill({ callType: 0, callObject: 0, digitalCallType: 0, sms: 0 }))];
                                newOneTouchCall[index] = { ...entry, callObject: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ oneTouchCall: newOneTouchCall });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                            />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={entry.digitalCallType ?? 0}
                              onChange={(e) => {
                                const newOneTouchCall = [...(radioSettings.oneTouchCall || Array(5).fill({ callType: 0, callObject: 0, digitalCallType: 0, sms: 0 }))];
                                newOneTouchCall[index] = { ...entry, digitalCallType: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ oneTouchCall: newOneTouchCall });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan"
                            >
                              {DIGITAL_CALL_TYPE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max="255"
                              value={entry.sms ?? 0}
                              onChange={(e) => {
                                const newOneTouchCall = [...(radioSettings.oneTouchCall || Array(5).fill({ callType: 0, callObject: 0, digitalCallType: 0, sms: 0 }))];
                                newOneTouchCall[index] = { ...entry, sms: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ oneTouchCall: newOneTouchCall });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                            />
                          </td>
                        </tr>
                      );
                    })}
                    </tbody>
                </table>
              </div>
              </div>

              {/* Fun+ */}
              <div className="pt-6 border-t border-neon-cyan border-opacity-20">
                <SectionTitle as="h4" size="md">Fun+ (Function Key Shortcuts)</SectionTitle>
                <p className="text-cool-gray text-sm mb-4">Configure 10 function key shortcuts (Fun+0 through Fun+9)</p>
                <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-neon-cyan border-opacity-30">
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Entry</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Operate Mode</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Menu Select</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Call Way</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Call Object</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Digital Call Type</th>
                      <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">SMS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((index) => {
                      const entry = radioSettings.funPlus?.[index] || { operateMode: 0, menuSelect: 0, callWay: 0, callObject: 0, digitalCallType: 0, sms: 0 };
                      return (
                        <tr key={index} className="border-b border-neon-cyan border-opacity-10 hover:bg-dark-charcoal">
                          <td className="py-2 px-3 text-cool-gray">Fun+{index}</td>
                          <td className="py-2 px-3">
                            <select
                              value={entry.operateMode ?? 0}
                              onChange={(e) => {
                                const newFunPlus = [...(radioSettings.funPlus || Array(10).fill(null).map(() => ({ operateMode: 0, menuSelect: 0, callWay: 0, callObject: 0, digitalCallType: 0, sms: 0 })))];
                                newFunPlus[index] = { ...entry, operateMode: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ funPlus: newFunPlus });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan"
                            >
                              {FUN_PLUS_OPERATE_MODE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={entry.menuSelect ?? 0}
                              onChange={(e) => {
                                const newFunPlus = [...(radioSettings.funPlus || Array(10).fill(null).map(() => ({ operateMode: 0, menuSelect: 0, callWay: 0, callObject: 0, digitalCallType: 0, sms: 0 })))];
                                newFunPlus[index] = { ...entry, menuSelect: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ funPlus: newFunPlus });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={entry.operateMode !== 1}
                            >
                              {FUN_PLUS_MENU_SELECT_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={entry.callWay ?? 0}
                              onChange={(e) => {
                                const newFunPlus = [...(radioSettings.funPlus || Array(10).fill(null).map(() => ({ operateMode: 0, menuSelect: 0, callWay: 0, callObject: 0, digitalCallType: 0, sms: 0 })))];
                                newFunPlus[index] = { ...entry, callWay: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ funPlus: newFunPlus });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={entry.operateMode !== 0}
                            >
                              {FUN_PLUS_CALL_WAY_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max="255"
                              value={entry.callObject ?? 0}
                              onChange={(e) => {
                                const newFunPlus = [...(radioSettings.funPlus || Array(10).fill(null).map(() => ({ operateMode: 0, menuSelect: 0, callWay: 0, callObject: 0, digitalCallType: 0, sms: 0 })))];
                                newFunPlus[index] = { ...entry, callObject: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ funPlus: newFunPlus });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={entry.operateMode !== 0}
                            />
                          </td>
                          <td className="py-2 px-3">
                            <select
                              value={entry.digitalCallType ?? 0}
                              onChange={(e) => {
                                const newFunPlus = [...(radioSettings.funPlus || Array(10).fill(null).map(() => ({ operateMode: 0, menuSelect: 0, callWay: 0, callObject: 0, digitalCallType: 0, sms: 0 })))];
                                newFunPlus[index] = { ...entry, digitalCallType: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ funPlus: newFunPlus });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-neon-cyan disabled:opacity-50 disabled:cursor-not-allowed"
                              disabled={entry.operateMode !== 0 || entry.callWay !== 2}
                            >
                              {DIGITAL_CALL_TYPE_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="py-2 px-3">
                            <input
                              type="number"
                              min="0"
                              max="255"
                              value={entry.sms ?? 0}
                              onChange={(e) => {
                                const newFunPlus = [...(radioSettings.funPlus || Array(10).fill(null).map(() => ({ operateMode: 0, menuSelect: 0, callWay: 0, callObject: 0, digitalCallType: 0, sms: 0 })))];
                                newFunPlus[index] = { ...entry, sms: parseInt(e.target.value) || 0 };
                                updateRadioSettings({ funPlus: newFunPlus });
                              }}
                              className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
          )}

          {/* GPS & APRS Settings */}
          {radioSettings && !radioSettings.uv5rMiniSettings && !radioSettings.ft65Settings && (
            <Card className="mt-6">
              <SectionTitle underline>GPS & APRS</SectionTitle>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                {/* GPS Settings */}
                <div>
                  <SectionTitle as="h4" size="md" className="mb-3">GPS Settings</SectionTitle>
                  <div className="space-y-3">
                    {([
                      { key: 'gpsEnabled', label: 'GPS Switch', type: 'checkbox' },
                      { key: 'gpsMode', label: 'GPS Mode', type: 'select', optionsId: 'gpsMode' },
                      { key: 'distanceUnit', label: 'Distance Unit', type: 'select', optionsId: 'distanceUnit' },
                      { key: 'speedUnit', label: 'Speed Unit', type: 'select', optionsId: 'speedUnit' },
                      { key: 'gpsDisplayFormat', label: 'GPS Display Format', type: 'select', optionsId: 'gpsDisplayFormat' },
                      { key: 'utcZone', label: 'UTC Zone', type: 'select', optionsId: 'utcZone' },
                      { key: 'gpsReportInterval', label: 'Report Interval (sec)', type: 'number', min: 5, max: 255 },
                    ] as SettingsFieldDescriptor[]).map((field) => (
                      <SettingsFieldRenderer
                        key={field.key}
                        field={field}
                        value={getFieldValue(radioSettings, field.key)}
                        onChange={(v) => handleFieldChange(radioSettings, field.key, v, updateRadioSettings)}
                      />
                    ))}
                  </div>

                  <SectionTitle as="h4" size="md" className="mt-6 mb-3">GPS Position</SectionTitle>
                  <div className="space-y-3">
                    {([
                      { key: 'latitude', label: 'Latitude', type: 'text', maxLength: 9 },
                      { key: 'latitudeDirection', label: 'N / S', type: 'select', optionsId: 'latitudeDirection' },
                      { key: 'longitude', label: 'Longitude', type: 'text', maxLength: 9 },
                      { key: 'longitudeDirection', label: 'E / W', type: 'select', optionsId: 'longitudeDirection' },
                    ] as SettingsFieldDescriptor[]).map((field) => (
                      <SettingsFieldRenderer
                        key={field.key}
                        field={field}
                        value={getFieldValue(radioSettings, field.key)}
                        onChange={(v) => handleFieldChange(radioSettings, field.key, v, updateRadioSettings)}
                      />
                    ))}
                  </div>
                </div>

                {/* APRS Settings */}
                <div>
                  <SectionTitle as="h4" size="md" className="mb-3">APRS Settings</SectionTitle>
                  <div className="space-y-3">
                    {([
                      { key: 'aprsScheduledSendTime', label: 'Scheduled Send Time', type: 'select', optionsId: 'aprsScheduledSendTime' },
                      { key: 'aprsFixedBeacon', label: 'Fixed Beacon', type: 'checkbox' },
                      { key: 'aprsRepeaterActiveDelay', label: 'Repeater Active Delay', type: 'select', optionsId: 'aprsRepeaterActiveDelay' },
                      { key: 'aprsCallType', label: 'Upload Call Type', type: 'select', optionsId: 'aprsCallType' },
                    ] as SettingsFieldDescriptor[]).map((field) => (
                      <SettingsFieldRenderer
                        key={field.key}
                        field={field}
                        value={getFieldValue(radioSettings, field.key)}
                        onChange={(v) => handleFieldChange(radioSettings, field.key, v, updateRadioSettings)}
                      />
                    ))}

                    {/* Upload Destination DMR ID */}
                    <div>
                      <label className="block text-cool-gray text-sm mb-1">Upload Destination DMR ID</label>
                      <p className="text-cool-gray text-xs mb-2">DMR ID of the APRS gateway or talk group to send position reports to (0 = unset)</p>
                      <input
                        type="number"
                        min={0}
                        max={16776415}
                        value={radioSettings.aprsUploadId ?? 0}
                        onChange={(e) => updateRadioSettings({ aprsUploadId: Math.max(0, Math.min(16776415, parseInt(e.target.value) || 0)) })}
                        className="w-full px-3 py-2 bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        placeholder="0 = unset"
                      />
                    </div>
                  </div>

                  <SectionTitle as="h4" size="md" className="mt-6 mb-3">APRS Report Channels</SectionTitle>
                  <p className="text-cool-gray text-sm mb-3">Channel numbers to report APRS data on (0 = current channel)</p>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b border-neon-cyan border-opacity-30">
                          <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Slot</th>
                          <th className="text-left py-2 px-3 text-sm font-semibold text-neon-cyan">Channel #</th>
                        </tr>
                      </thead>
                      <tbody>
                        {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((n) => {
                          const key = `aprsReportChannel${n}` as keyof typeof radioSettings;
                          return (
                            <tr key={n} className="border-b border-neon-cyan border-opacity-10 hover:bg-dark-charcoal">
                              <td className="py-2 px-3 text-cool-gray">Channel {n}</td>
                              <td className="py-2 px-3">
                                <input
                                  type="number"
                                  min={0}
                                  max={4000}
                                  value={(radioSettings[key] as number) ?? 0}
                                  onChange={(e) => updateRadioSettings({ [key]: parseInt(e.target.value) || 0 } as Partial<RadioSettings>)}
                                  className="w-full px-2 py-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white text-sm focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Calibration Data Section - Read Only */}
      {calibrationLoaded && (
        <Card className="mt-6 !border-yellow-600/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <SectionTitle className="!text-yellow-400">Frequency Calibration Data</SectionTitle>
              <span className="px-2 py-1 bg-yellow-900/30 text-yellow-400 text-xs rounded border border-yellow-600/30">
                READ-ONLY
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowCalibration(!showCalibration)}
              className="px-3 py-1 bg-yellow-900/30 text-yellow-400 text-sm rounded border border-yellow-600/30 hover:bg-yellow-900/50 transition-colors"
            >
              {showCalibration ? 'Hide' : 'Show'}
            </button>
          </div>
          {showCalibration && (
            <>
          
          <div className="mb-4 p-3 bg-yellow-900/10 border border-yellow-600/20 rounded">
            <p className="text-yellow-300 text-sm">
              <strong>⚠️ Display Only:</strong> This is factory calibration data for your radio. 
              These values are used for frequency adjustment and should not be modified. 
              Changing these values may cause your radio to operate outside of its specifications.
            </p>
          </div>

          {calibration ? (
            <div className="space-y-4">
              {/* Frequency Array 1 */}
              {calibration.data.frequencyArray1.size > 0 && (
                <div>
                  <SectionTitle as="h4" size="md" className="!text-yellow-400 mb-2">Frequency Array 1</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {Array.from(calibration.data.frequencyArray1.entries())
                      .sort(([a], [b]) => a - b)
                      .map(([param, value]) => {
                        const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                        return (
                          <div key={param} className="bg-dark-charcoal p-2 rounded">
                            <span className="text-cool-gray">{paramName}:</span>
                            <div className="text-white font-mono">{value}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Frequency Array 2 */}
              {calibration.data.frequencyArray2.size > 0 && (
                <div>
                  <SectionTitle as="h4" size="md" className="!text-yellow-400 mb-2">Frequency Array 2</SectionTitle>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm">
                    {Array.from(calibration.data.frequencyArray2.entries())
                      .sort(([a], [b]) => a - b)
                      .map(([param, value]) => {
                        const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                        return (
                          <div key={param} className="bg-dark-charcoal p-2 rounded">
                            <span className="text-cool-gray">{paramName}:</span>
                            <div className="text-white font-mono">{value}</div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Value Arrays */}
              {(calibration.data.valueArray1.size > 0 || 
                calibration.data.valueArray2.size > 0 || 
                calibration.data.valueArray3.size > 0) && (
                <div>
                  <SectionTitle as="h4" size="md" className="!text-yellow-400 mb-2">Calibration Values</SectionTitle>
                  <div className="space-y-3">
                    {calibration.data.valueArray1.size > 0 && (
                      <div>
                        <span className="text-cool-gray text-sm font-semibold">Value Array 1:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm mt-2">
                          {Array.from(calibration.data.valueArray1.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([param, value]) => {
                              const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                              return (
                                <div key={param} className="bg-dark-charcoal p-2 rounded">
                                  <span className="text-cool-gray text-xs">{paramName}:</span>
                                  <div className="text-white font-mono">{value}</div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    {calibration.data.valueArray2.size > 0 && (
                      <div>
                        <span className="text-cool-gray text-sm font-semibold">Value Array 2:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm mt-2">
                          {Array.from(calibration.data.valueArray2.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([param, value]) => {
                              const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                              return (
                                <div key={param} className="bg-dark-charcoal p-2 rounded">
                                  <span className="text-cool-gray text-xs">{paramName}:</span>
                                  <div className="text-white font-mono">{value}</div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                    {calibration.data.valueArray3.size > 0 && (
                      <div>
                        <span className="text-cool-gray text-sm font-semibold">Value Array 3:</span>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 text-sm mt-2">
                          {Array.from(calibration.data.valueArray3.entries())
                            .sort(([a], [b]) => a - b)
                            .map(([param, value]) => {
                              const paramName = CALIBRATION_PARAM_NAMES[param] || `Param ${param}`;
                              return (
                                <div key={param} className="bg-dark-charcoal p-2 rounded">
                                  <span className="text-cool-gray text-xs">{paramName}:</span>
                                  <div className="text-white font-mono">{value}</div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="text-xs text-cool-gray mt-4">
                Block Address: 0x{calibration.blockAddress.toString(16).padStart(6, '0').toUpperCase()}
              </div>
            </div>
          ) : (
            <p className="text-cool-gray">No calibration data found on the radio.</p>
          )}
            </>
          )}
        </Card>
      )}
      {caps?.supportsAnalogEmergency && <AnalogEmergencyList />}

      <Modal
        isOpen={showFirmwareWarning}
        onClose={() => setShowFirmwareWarning(false)}
        title={isNewerFirmware ? "Firmware Version Not Recommended" : "Firmware Update Recommended"}
      >
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <span className="text-yellow-400 text-2xl">⚠️</span>
            <div className="flex-1">
              {isNewerFirmware ? (
                <>
                  <p className="text-white mb-2">
                    Your radio firmware version is <span className="font-mono text-neon-cyan">{radioInfo?.firmware}</span>, 
                    which is not recommended and has not been tested with this software.
                  </p>
                  <p className="text-cool-gray">
                    This firmware version (049 or newer) may have compatibility issues or untested behavior. 
                    Use at your own risk.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-white mb-2">
                    Your radio firmware version is <span className="font-mono text-neon-cyan">{radioInfo?.firmware}</span>, 
                    but the recommended version is <span className="font-mono text-neon-cyan">{EXPECTED_FIRMWARE}</span>.
                  </p>
                  <p className="text-cool-gray">
                    We recommend updating your firmware to ensure compatibility with all features and bug fixes. 
                    Please check the official Baofeng website or your radio's documentation for firmware update instructions.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

