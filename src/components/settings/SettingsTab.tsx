import React, { useState, useRef, useEffect, useCallback } from 'react';
import Cropper, { Area } from 'react-easy-crop';
import { useRadioStore } from '../../store/radioStore';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { parseBootImageHeader, rgb565ToImageData, imageDataToRgb565, buildBootImagePayload, BOOT_IMAGE } from '../../utils/bootImage';
import { useChannelsStore } from '../../store/channelsStore';
import { useZonesStore } from '../../store/zonesStore';
import { useContactsStore } from '../../store/contactsStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { useCalibrationStore } from '../../store/calibrationStore';
import { getContactCapacityWithFallback, isFirmware049OrNewer } from '../../utils/firmware';
import { CALIBRATION_PARAM_NAMES } from '../../models/Calibration';
import { Modal } from '../ui/Modal';
import {
  COLOR_OPTIONS,
  UTC_ZONE_OPTIONS,
  POWER_ON_INTERFACE_OPTIONS,
  AUTO_POWER_OFF_OPTIONS,
  BUTTON_FUNCTION_OPTIONS,
  ANALOG_CALL_TYPE_OPTIONS,
  ONE_TOUCH_CALL_TYPE_OPTIONS,
  DIGITAL_CALL_TYPE_OPTIONS,
  FUN_PLUS_OPERATE_MODE_OPTIONS,
  FUN_PLUS_MENU_SELECT_OPTIONS,
  FUN_PLUS_CALL_WAY_OPTIONS,
  getColorHex,
} from './settingsConstants';
import { formatAddress } from '../../utils/formatHelpers';

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

  const EXPECTED_FIRMWARE = 'DM32.01.L01.048';
  const isNewerFirmware = radioInfo?.firmware && isFirmware049OrNewer(radioInfo.firmware);
  const needsFirmwareUpdate = radioInfo?.firmware && radioInfo.firmware !== EXPECTED_FIRMWARE && !isNewerFirmware;


  // Calculate usage statistics (exclude VFO channels)
  const vfoCount = (radioSettings?.vfoA ? 1 : 0) + (radioSettings?.vfoB ? 1 : 0);
  const channelUsage = {
    used: channels.length - vfoCount,
    total: 4000,
    percent: Math.round(((channels.length - vfoCount) / 4000) * 100),
  };

  const zoneUsage = {
    used: zones.length,
    total: 250, // Max zones per spec
    percent: Math.round((zones.length / 250) * 100),
  };

  // Get contact capacity based on firmware: 150k for L01, 50k otherwise
  const contactCapacity = radioInfo 
    ? getContactCapacityWithFallback(
        radioInfo.vframes.get(0x0F),
        radioInfo.firmware
      )
    : 50000;
  const contactUsage = {
    used: contacts.length,
    total: contactCapacity,
    percent: contactsLoaded ? Math.round((contacts.length / contactCapacity) * 100) : 0,
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
        <h2 className="text-2xl font-bold text-neon-cyan">Settings</h2>
        <p className="text-cool-gray text-sm mt-1">Radio information, memory usage, and configuration</p>
      </div>

      {!radioInfo ? (
        <div className="bg-deep-gray rounded-lg border border-neon-cyan border-opacity-30 p-8 text-center">
          <p className="text-cool-gray">No radio information available. Read from radio to view details.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Device Information Section */}
          <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
              Device Information
            </h3>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <span className="text-cool-gray text-sm block mb-1">Model</span>
                <div className="text-white font-mono">{radioInfo.model}</div>
              </div>
              <div>
                <span className="text-cool-gray text-sm block mb-1">Firmware</span>
                <div className="text-white font-mono flex items-center space-x-2">
                  <span>{radioInfo.firmware}</span>
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
              {radioInfo.buildDate && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">Build Date</span>
                  <div className="text-white font-mono">{radioInfo.buildDate}</div>
                </div>
              )}
              {radioInfo.dspVersion && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">DSP Version</span>
                  <div className="text-white font-mono text-sm">{radioInfo.dspVersion}</div>
                </div>
              )}
              {radioInfo.radioVersion && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">Radio Version</span>
                  <div className="text-white font-mono text-sm">{radioInfo.radioVersion}</div>
                </div>
              )}
              {radioInfo.codeplugVersion && (
                <div>
                  <span className="text-cool-gray text-sm block mb-1">Codeplug Version</span>
                  <div className="text-white font-mono text-sm">{radioInfo.codeplugVersion}</div>
                </div>
              )}
            </div>
          </div>

          {/* Memory & Storage Section */}
          <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
              Memory & Storage
            </h3>
            <div className="space-y-6 mt-4">
              <div>
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Memory Layout</h4>
                <div className="space-y-2 font-mono text-sm">
                  <div className="flex justify-between items-center py-2 px-3 bg-dark-charcoal rounded">
                    <span className="text-cool-gray">Configuration Region:</span>
                    <span className="text-white">
                      {formatAddress(radioInfo.memoryLayout.configStart)} - {formatAddress(radioInfo.memoryLayout.configEnd)}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Usage Statistics</h4>
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
                </div>
              </div>
            </div>
          </div>

          {/* Boot / Startup Image Section */}
          <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
            <h3 className="text-lg font-semibold text-neon-cyan mb-2 pb-2 border-b border-neon-cyan border-opacity-20">
              Boot / Startup Image
            </h3>
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
          </div>

          {/* Radio Configuration Section */}
          <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
            <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
              Radio Configuration
            </h3>
            {radioSettings && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-4">
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Power On Display</h4>
                  <div className="space-y-4">
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Line 1</label>
                        <input
                          type="text"
                          value={radioSettings.powerOnDisplayLine1}
                          onChange={(e) => updateRadioSettings({ powerOnDisplayLine1: e.target.value.substring(0, 14) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                          maxLength={14}
                          placeholder="Enter boot text line 1"
                        />
                      </div>
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Line 2</label>
                        <input
                          type="text"
                          value={radioSettings.powerOnDisplayLine2}
                          onChange={(e) => updateRadioSettings({ powerOnDisplayLine2: e.target.value.substring(0, 14) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                          maxLength={14}
                          placeholder="Enter boot text line 2"
                        />
                      </div>
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Power On Interface</label>
                        <select
                          value={radioSettings.powerOnInterface}
                          onChange={(e) => updateRadioSettings({ powerOnInterface: parseInt(e.target.value) })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {POWER_ON_INTERFACE_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="allowReset"
                          checked={radioSettings.allowReset}
                          onChange={(e) => updateRadioSettings({ allowReset: e.target.checked })}
                          className="w-4 h-4 text-neon-cyan bg-dark-charcoal border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor="allowReset" className="text-cool-gray text-sm">Allow Reset</label>
                      </div>
                      <div>
                        <label className="block text-cool-gray text-sm mb-2">Auto Power Off</label>
                        <select
                          value={radioSettings.autoPowerOff ?? 0}
                          onChange={(e) => updateRadioSettings({ autoPowerOff: parseInt(e.target.value) || 0 })}
                          className="w-full bg-dark-charcoal border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {AUTO_POWER_OFF_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Display Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Callsign Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.callsignColor}
                          onChange={(e) => updateRadioSettings({ callsignColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-9 h-9 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.callsignColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Standby Text Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.standbyTextColor}
                          onChange={(e) => updateRadioSettings({ standbyTextColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-9 h-9 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.standbyTextColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Channel A Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.channelAColor}
                          onChange={(e) => updateRadioSettings({ channelAColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-9 h-9 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.channelAColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Channel B Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.channelBColor}
                          onChange={(e) => updateRadioSettings({ channelBColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-10 h-10 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.channelBColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Zone A Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.zoneAColor}
                          onChange={(e) => updateRadioSettings({ zoneAColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-10 h-10 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.zoneAColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Zone B Color</label>
                      <div className="flex items-center gap-2">
                        <select
                          value={radioSettings.zoneBColor}
                          onChange={(e) => updateRadioSettings({ zoneBColor: parseInt(e.target.value) || 0 })}
                          className="flex-1 bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                        >
                          {COLOR_OPTIONS.map(color => (
                            <option key={color.value} value={color.value}>{color.label}</option>
                          ))}
                        </select>
                        <div
                          className="w-10 h-10 rounded border border-neon-cyan border-opacity-30 flex-shrink-0"
                          style={{ backgroundColor: getColorHex(radioSettings.zoneBColor) }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">
                        Backlight Brightness: {radioSettings.backlightBrightness}
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="6"
                        value={radioSettings.backlightBrightness}
                        onChange={(e) => updateRadioSettings({ backlightBrightness: parseInt(e.target.value) || 1 })}
                        className="w-full h-2 bg-deep-gray rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                        style={{
                          background: `linear-gradient(to right, #00FFFF 0%, #00FFFF ${((radioSettings.backlightBrightness - 1) / 5) * 100}%, #1a1a1a ${((radioSettings.backlightBrightness - 1) / 5) * 100}%, #1a1a1a 100%)`
                        }}
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Auto Backlight Duration (s)</label>
                      <input
                        type="number"
                        min="5"
                        max="30"
                        step="5"
                        value={radioSettings.autoBacklightDuration}
                        onChange={(e) => updateRadioSettings({ autoBacklightDuration: parseInt(e.target.value) || 5 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Menu Exit Time (s)</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={radioSettings.menuExitTime}
                        onChange={(e) => updateRadioSettings({ menuExitTime: parseInt(e.target.value) || 1 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Time & GPS</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">UTC Zone</label>
                      <select
                        value={radioSettings.utcZone}
                        onChange={(e) => updateRadioSettings({ utcZone: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      >
                        {UTC_ZONE_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Measure Period Interval (s)</label>
                      <input
                        type="number"
                        min="5"
                        value={radioSettings.measurePeriodInterval}
                        onChange={(e) => updateRadioSettings({ measurePeriodInterval: parseInt(e.target.value) || 5 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div className="pt-2 mt-2 border-t border-neon-cyan border-opacity-20">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="gpsAprsSwitch"
                          checked={(radioSettings.gpsAprsFlags & 0x01) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.gpsAprsFlags | 0x01
                              : radioSettings.gpsAprsFlags & ~0x01;
                            updateRadioSettings({ gpsAprsFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor="gpsAprsSwitch" className="text-cool-gray text-sm">GPS/APRS Switch</label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Digital Settings</h4>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Call Hold Time (s)</label>
                      <input
                        type="number"
                        min="0"
                        max="61"
                        value={radioSettings.callHoldTime}
                        onChange={(e) => updateRadioSettings({ callHoldTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Remote Monitor Time (s)</label>
                      <input
                        type="number"
                        min="0"
                        value={radioSettings.remoteMonitorTime}
                        onChange={(e) => updateRadioSettings({ remoteMonitorTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Active Wait Time (ms)</label>
                      <input
                        type="number"
                        min="1"
                        value={radioSettings.activeWaitTime}
                        onChange={(e) => updateRadioSettings({ activeWaitTime: parseInt(e.target.value) || 1 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Active Retries Time</label>
                      <input
                        type="number"
                        min="1"
                        value={radioSettings.activeRetriesTime}
                        onChange={(e) => updateRadioSettings({ activeRetriesTime: parseInt(e.target.value) || 1 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">Pre-Carrier Time (ms)</label>
                      <input
                        type="number"
                        min="0"
                        value={radioSettings.preCarrierTime}
                        onChange={(e) => updateRadioSettings({ preCarrierTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                    <div>
                      <label className="block text-cool-gray text-sm mb-2">TX Dwell Time (s)</label>
                      <input
                        type="number"
                        min="0"
                        value={radioSettings.txDwellTime}
                        onChange={(e) => updateRadioSettings({ txDwellTime: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Alert Tones</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Key Tone' },
                      { bit: 1, label: 'SMS Alert' },
                      { bit: 2, label: 'Group Call Tone' },
                      { bit: 3, label: 'Private Call Tone' },
                      { bit: 4, label: 'Call End Tone' },
                      { bit: 5, label: 'Talk Permit Tone' },
                      { bit: 6, label: 'StartUp Sound' },
                      { bit: 7, label: 'Voice Prompt' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`alertTone${bit}`}
                          checked={(radioSettings.alertToneFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.alertToneFlags | (1 << bit)
                              : radioSettings.alertToneFlags & ~(1 << bit);
                            updateRadioSettings({ alertToneFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`alertTone${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-neon-cyan border-opacity-20">
                      <p className="text-cool-gray text-xs mb-2">Additional:</p>
                      {[
                        { bit: 0, label: 'Battery Low' },
                        { bit: 1, label: 'Analog TX End Tone' },
                        { bit: 2, label: 'Analog TX Alert Tone' },
                      ].map(({ bit, label }) => (
                        <div key={bit} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`alertToneCont${bit}`}
                            checked={(radioSettings.alertToneFlagsCont & (1 << bit)) !== 0}
                            onChange={(e) => {
                              const newValue = e.target.checked
                                ? radioSettings.alertToneFlagsCont | (1 << bit)
                                : radioSettings.alertToneFlagsCont & ~(1 << bit);
                              updateRadioSettings({ alertToneFlagsCont: newValue });
                            }}
                            className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                          />
                          <label htmlFor={`alertToneCont${bit}`} className="text-cool-gray text-sm">{label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Display Flags</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Volume Change Prompt' },
                      { bit: 1, label: 'Time Display' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`displayFlag${bit}`}
                          checked={(radioSettings.displayFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.displayFlags | (1 << bit)
                              : radioSettings.displayFlags & ~(1 << bit);
                            updateRadioSettings({ displayFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`displayFlag${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                    <div className="mt-3 pt-3 border-t border-neon-cyan border-opacity-20">
                      <label className="block text-cool-gray text-sm mb-2">Data Display Format</label>
                      <select
                        value={radioSettings.dataDisplayFormat}
                        onChange={(e) => updateRadioSettings({ dataDisplayFormat: parseInt(e.target.value) || 0 })}
                        className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                      >
                        <option value={0}>yyy/m/d (Format 0)</option>
                        <option value={1}>d/m/yyy (Format 1)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Work Mode</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Only Channel Mode' },
                      { bit: 1, label: 'Distance Unit' },
                      { bit: 2, label: 'GPS Mode' },
                      { bit: 3, label: 'Speed Unit' },
                      { bit: 4, label: 'GPS Display Format' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`workMode${bit}`}
                          checked={(radioSettings.workModeFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.workModeFlags | (1 << bit)
                              : radioSettings.workModeFlags & ~(1 << bit);
                            updateRadioSettings({ workModeFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`workMode${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">Digital Flags</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'Radio Disable Decode' },
                      { bit: 1, label: 'Remote Monitor Decode' },
                      { bit: 2, label: 'Call Alert Decode' },
                      { bit: 3, label: 'Radio Enable Decode' },
                      { bit: 4, label: 'Radio Check Decode' },
                      { bit: 5, label: 'Data Service' },
                      { bit: 6, label: 'Missed Call Alert' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`digitalFlag${bit}`}
                          checked={(radioSettings.digitalSettingsFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.digitalSettingsFlags | (1 << bit)
                              : radioSettings.digitalSettingsFlags & ~(1 << bit);
                            updateRadioSettings({ digitalSettingsFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`digitalFlag${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                    <div className="pt-2 mt-2 border-t border-neon-cyan border-opacity-20">
                      <p className="text-cool-gray text-xs mb-2">Additional:</p>
                      {[
                        { bit: 0, label: 'Name Data Format' },
                        { bit: 1, label: 'Send TX Name' },
                        { bit: 2, label: 'Name Display Priority' },
                      ].map(({ bit, label }) => (
                        <div key={bit} className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`digitalCont${bit}`}
                            checked={(radioSettings.digitalSettingsCont & (1 << bit)) !== 0}
                            onChange={(e) => {
                              const newValue = e.target.checked
                                ? radioSettings.digitalSettingsCont | (1 << bit)
                                : radioSettings.digitalSettingsCont & ~(1 << bit);
                              updateRadioSettings({ digitalSettingsCont: newValue });
                            }}
                            className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                          />
                          <label htmlFor={`digitalCont${bit}`} className="text-cool-gray text-sm">{label}</label>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-3">VFO/Embedded</h4>
                  <div className="space-y-2">
                    {[
                      { bit: 0, label: 'A Range Mode' },
                      { bit: 1, label: 'B Range Mode' },
                      { bit: 2, label: 'A Display Mode' },
                      { bit: 3, label: 'B Display Mode' },
                      { bit: 4, label: 'Main Channel Setting' },
                      { bit: 5, label: 'Hold Mode' },
                      { bit: 6, label: 'Dual Watch Mode' },
                    ].map(({ bit, label }) => (
                      <div key={bit} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id={`vfoFlag${bit}`}
                          checked={(radioSettings.vfoEmbeddedFlags & (1 << bit)) !== 0}
                          onChange={(e) => {
                            const newValue = e.target.checked
                              ? radioSettings.vfoEmbeddedFlags | (1 << bit)
                              : radioSettings.vfoEmbeddedFlags & ~(1 << bit);
                            updateRadioSettings({ vfoEmbeddedFlags: newValue });
                          }}
                          className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                        />
                        <label htmlFor={`vfoFlag${bit}`} className="text-cool-gray text-sm">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}
          </div>

          {/* Menu Items Section */}
          {radioSettings && (
            <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 mt-6">
              <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
                Menu Items
              </h3>
              <p className="text-cool-gray text-sm mb-4">Enable or disable menu items on the radio</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Zones Section */}
              <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Zones</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuZoneList"
                      checked={radioSettings.menuEnableFlags?.zoneList ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          zoneList: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuZoneList" className="text-cool-gray text-sm">Zone List</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuNewZone"
                      checked={radioSettings.menuEnableFlags?.newZone ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          newZone: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuNewZone" className="text-cool-gray text-sm">New Zone</label>
                  </div>
                </div>
              </div>

              {/* Digital Features Section */}
              <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Digital Features</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuCallAlert"
                      checked={radioSettings.menuEnableFlags?.callAlert ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          callAlert: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuCallAlert" className="text-cool-gray text-sm">Call Alert</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRadioCheck"
                      checked={radioSettings.menuEnableFlags?.radioCheck ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          radioCheck: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRadioCheck" className="text-cool-gray text-sm">Radio Check</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRemoteMonitor"
                      checked={radioSettings.menuEnableFlags?.remoteMonitor ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          remoteMonitor: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRemoteMonitor" className="text-cool-gray text-sm">Remote Monitor</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRadioEnable"
                      checked={radioSettings.menuEnableFlags?.radioEnable ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          radioEnable: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRadioEnable" className="text-cool-gray text-sm">Radio Enable</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRadioDisable"
                      checked={radioSettings.menuEnableFlags?.radioDisable ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          radioDisable: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRadioDisable" className="text-cool-gray text-sm">Radio Disable</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuMeasurePeriod"
                      checked={radioSettings.menuEnableFlags?.measurePeriod ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          measurePeriod: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuMeasurePeriod" className="text-cool-gray text-sm">Measure Period</label>
                  </div>
                </div>
              </div>

              {/* Display/UI Section */}
              <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Display/UI</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* Inverted: bit=0 means enabled, so we invert the display */}
                    <input
                      type="checkbox"
                      id="menuTalkaround"
                      checked={radioSettings.menuEnableFlags?.talkaround ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          talkaround: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuTalkaround" className="text-cool-gray text-sm">Talkaround</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuAlertTone"
                      checked={radioSettings.menuEnableFlags?.alertTone ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          alertTone: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuAlertTone" className="text-cool-gray text-sm">Alert Tone</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuTxPower"
                      checked={radioSettings.menuEnableFlags?.txPower ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          txPower: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuTxPower" className="text-cool-gray text-sm">TX Power</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuStartDisplay"
                      checked={radioSettings.menuEnableFlags?.startDisplay ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          startDisplay: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuStartDisplay" className="text-cool-gray text-sm">Start Display</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuLangSelect"
                      checked={radioSettings.menuEnableFlags?.langSelect ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          langSelect: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuLangSelect" className="text-cool-gray text-sm">Lang Select</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuMatchPrivate"
                      checked={radioSettings.menuEnableFlags?.matchPrivate ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          matchPrivate: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuMatchPrivate" className="text-cool-gray text-sm">Match Private</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuMatchGroup"
                      checked={radioSettings.menuEnableFlags?.matchGroup ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          matchGroup: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuMatchGroup" className="text-cool-gray text-sm">Match Group</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuDisplayMode"
                      checked={radioSettings.menuEnableFlags?.displayMode ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          displayMode: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuDisplayMode" className="text-cool-gray text-sm">Display Mode</label>
                  </div>
                </div>
              </div>

              {/* Communication Section */}
              <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Communication</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {/* Inverted: bit=0 means enabled, so we invert the display */}
                    <input
                      type="checkbox"
                      id="menuSmsFormat"
                      checked={radioSettings.menuEnableFlags?.smsFormat ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          smsFormat: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuSmsFormat" className="text-cool-gray text-sm">SMS Format</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuSubChannelMode"
                      checked={radioSettings.menuEnableFlags?.subChannelMode ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          subChannelMode: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuSubChannelMode" className="text-cool-gray text-sm">Sub Channel Mode</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuPowerSave"
                      checked={radioSettings.menuEnableFlags?.powerSave ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          powerSave: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuPowerSave" className="text-cool-gray text-sm">Power Save</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuFmRadio"
                      checked={radioSettings.menuEnableFlags?.fmRadio ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          fmRadio: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuFmRadio" className="text-cool-gray text-sm">FM Radio</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuGps"
                      checked={radioSettings.menuEnableFlags?.gps ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          gps: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuGps" className="text-cool-gray text-sm">GPS</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuAprs"
                      checked={radioSettings.menuEnableFlags?.aprs ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          aprs: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuAprs" className="text-cool-gray text-sm">APRS</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRecord"
                      checked={radioSettings.menuEnableFlags?.record ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          record: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRecord" className="text-cool-gray text-sm">Record</label>
                  </div>
                </div>
              </div>

              {/* Contacts Section */}
              <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">CSV Contacts</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuAddContact"
                      checked={radioSettings.menuEnableFlags?.addContact ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          addContact: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuAddContact" className="text-cool-gray text-sm">Add Contact</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuDelContact"
                      checked={radioSettings.menuEnableFlags?.delContact ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          delContact: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuDelContact" className="text-cool-gray text-sm">Del Contact</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuEditContact"
                      checked={radioSettings.menuEnableFlags?.editContact ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          editContact: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuEditContact" className="text-cool-gray text-sm">Edit Contact</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuSendMessage"
                      checked={radioSettings.menuEnableFlags?.sendMessage ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          sendMessage: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuSendMessage" className="text-cool-gray text-sm">Send Message</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuFunctionality"
                      checked={radioSettings.menuEnableFlags?.functionality ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          functionality: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuFunctionality" className="text-cool-gray text-sm">Functionality</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuManualDial"
                      checked={radioSettings.menuEnableFlags?.manualDial ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          manualDial: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuManualDial" className="text-cool-gray text-sm">Manual Dial</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuCsvContacts"
                      checked={radioSettings.menuEnableFlags?.csvContacts ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          csvContacts: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuCsvContacts" className="text-cool-gray text-sm">CSV Contacts</label>
                  </div>
                </div>
              </div>

              {/* Call Log Section */}
              <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Call Log</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuMissedCall"
                      checked={radioSettings.menuEnableFlags?.missedCall ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          missedCall: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuMissedCall" className="text-cool-gray text-sm">Missed Call</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuAnsweredCall"
                      checked={radioSettings.menuEnableFlags?.answeredCall ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          answeredCall: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuAnsweredCall" className="text-cool-gray text-sm">Answered Call</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuSentCall"
                      checked={radioSettings.menuEnableFlags?.sentCall ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          sentCall: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuSentCall" className="text-cool-gray text-sm">Sent Call</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuDelLog"
                      checked={radioSettings.menuEnableFlags?.delLog ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          delLog: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuDelLog" className="text-cool-gray text-sm">Del Log</label>
                  </div>
                </div>
              </div>

              {/* Program Section */}
              <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Program</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRxFrequency"
                      checked={radioSettings.menuEnableFlags?.rxFrequency ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          rxFrequency: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRxFrequency" className="text-cool-gray text-sm">RX Frequency</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuTxFrequency"
                      checked={radioSettings.menuEnableFlags?.txFrequency ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          txFrequency: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuTxFrequency" className="text-cool-gray text-sm">TX Frequency</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuCtcDcs"
                      checked={radioSettings.menuEnableFlags?.ctcDcs ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          ctcDcs: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuCtcDcs" className="text-cool-gray text-sm">CTC/DCS</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuTxContact"
                      checked={radioSettings.menuEnableFlags?.txContact ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          txContact: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuTxContact" className="text-cool-gray text-sm">TX Contact</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuColorCode"
                      checked={radioSettings.menuEnableFlags?.colorCode ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          colorCode: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuColorCode" className="text-cool-gray text-sm">Color Code</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuTimeSlot"
                      checked={radioSettings.menuEnableFlags?.timeSlot ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          timeSlot: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuTimeSlot" className="text-cool-gray text-sm">Time Slot</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRadioId"
                      checked={radioSettings.menuEnableFlags?.radioId ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          radioId: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRadioId" className="text-cool-gray text-sm">Radio ID</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRadioName"
                      checked={radioSettings.menuEnableFlags?.radioName ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          radioName: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRadioName" className="text-cool-gray text-sm">Radio Name</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuChannelType"
                      checked={radioSettings.menuEnableFlags?.channelType ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...(radioSettings.menuEnableFlags || {}),
                          channelType: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuChannelType" className="text-cool-gray text-sm">Channel Type</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuTdmaDirectMode"
                      checked={radioSettings.menuEnableFlags?.tdmaDirectMode ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          tdmaDirectMode: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuTdmaDirectMode" className="text-cool-gray text-sm">TDMA Direct Mode</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuRxGroupList"
                      checked={radioSettings.menuEnableFlags?.rxGroupList ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          rxGroupList: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuRxGroupList" className="text-cool-gray text-sm">RX Group List</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuAddChannel"
                      checked={radioSettings.menuEnableFlags?.addChannel ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          addChannel: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuAddChannel" className="text-cool-gray text-sm">Add Channel</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="menuChannelName"
                      checked={radioSettings.menuEnableFlags?.channelName ?? false}
                      onChange={(e) => updateRadioSettings({
                        menuEnableFlags: {
                          ...radioSettings.menuEnableFlags,
                          channelName: e.target.checked
                        }
                      })}
                      className="w-4 h-4 text-neon-cyan bg-deep-gray border-neon-cyan rounded focus:ring-neon-cyan"
                    />
                    <label htmlFor="menuChannelName" className="text-cool-gray text-sm">Channel Name</label>
                  </div>
                </div>
              </div>
            </div>
            </div>
          )}

          {/* Keys & Buttons Section */}
          {radioSettings && (
            <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 mt-6">
              <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
                Button Settings
              </h3>
              
              {/* Key Lock Settings */}
              <div className="mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div>
                    <label className="block text-cool-gray text-sm mb-2">Lock Key</label>
                    <select
                      value={radioSettings.lockKey || 'Manual'}
                      onChange={(e) => updateRadioSettings({ lockKey: e.target.value as 'Manual' | 'Auto' })}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    >
                      <option value="Manual">Manual</option>
                      <option value="Auto">Auto</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-cool-gray text-sm mb-2">Knob Lock</label>
                    <select
                      value={radioSettings.knobLock ? 'On' : 'Off'}
                      onChange={(e) => updateRadioSettings({ knobLock: e.target.value === 'On' })}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    >
                      <option value="Off">Off</option>
                      <option value="On">On</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-cool-gray text-sm mb-2">Side Key Lock</label>
                    <select
                      value={radioSettings.sideKeyLock ? 'On' : 'Off'}
                      onChange={(e) => updateRadioSettings({ sideKeyLock: e.target.value === 'On' })}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    >
                      <option value="Off">Off</option>
                      <option value="On">On</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-cool-gray text-sm mb-2">Auto Keypad Lock Delay Time (s)</label>
                    <input
                      type="number"
                      min="5"
                      max="60"
                      value={radioSettings.autoKeypadLockDelayTime ?? 5}
                      onChange={(e) => updateRadioSettings({ autoKeypadLockDelayTime: parseInt(e.target.value) || 5 })}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    />
                  </div>
                  <div>
                    <label className="block text-cool-gray text-sm mb-2">Long Press Time</label>
                    <input
                      type="number"
                      min="1"
                      max="5"
                      value={radioSettings.longPressTime ?? 3}
                      onChange={(e) => updateRadioSettings({ longPressTime: parseInt(e.target.value) || 1 })}
                      className="w-full bg-deep-gray border border-neon-cyan border-opacity-30 rounded px-3 py-2 text-white focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan"
                    />
                    <p className="text-xs text-cool-gray mt-1">1 = shortest, 5 = longest</p>
                  </div>
                </div>
              </div>

              {/* Button Functions */}
              <div className="mt-6 pt-6 border-t border-neon-cyan border-opacity-20">              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* SK1 Button Functions */}
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-4">SK1 Button</h4>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="sk1Short" className="block text-sm text-cool-gray mb-2">
                        Short Press
                      </label>
                      <select
                        id="sk1Short"
                        value={radioSettings.sk1Short ?? 0}
                        onChange={(e) => updateRadioSettings({ sk1Short: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="sk1Long" className="block text-sm text-cool-gray mb-2">
                        Long Press
                      </label>
                      <select
                        id="sk1Long"
                        value={radioSettings.sk1Long ?? 0}
                        onChange={(e) => updateRadioSettings({ sk1Long: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* SK2 Button Functions */}
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-4">SK2 Button</h4>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="sk2Short" className="block text-sm text-cool-gray mb-2">
                        Short Press
                      </label>
                      <select
                        id="sk2Short"
                        value={radioSettings.sk2Short ?? 0}
                        onChange={(e) => updateRadioSettings({ sk2Short: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="sk2Long" className="block text-sm text-cool-gray mb-2">
                        Long Press
                      </label>
                      <select
                        id="sk2Long"
                        value={radioSettings.sk2Long ?? 0}
                        onChange={(e) => updateRadioSettings({ sk2Long: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* P1 Button Functions */}
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-4">P1 Button</h4>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="p1Short" className="block text-sm text-cool-gray mb-2">
                        Short Press
                      </label>
                      <select
                        id="p1Short"
                        value={radioSettings.p1Short ?? 0}
                        onChange={(e) => updateRadioSettings({ p1Short: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="p1Long" className="block text-sm text-cool-gray mb-2">
                        Long Press
                      </label>
                      <select
                        id="p1Long"
                        value={radioSettings.p1Long ?? 0}
                        onChange={(e) => updateRadioSettings({ p1Long: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* P2 Button Functions */}
                <div className="bg-dark-charcoal rounded-lg border border-neon-cyan border-opacity-20 p-4">
                  <h4 className="text-md font-semibold text-neon-cyan mb-4">P2 Button</h4>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="p2Short" className="block text-sm text-cool-gray mb-2">
                        Short Press
                      </label>
                      <select
                        id="p2Short"
                        value={radioSettings.p2Short ?? 0}
                        onChange={(e) => updateRadioSettings({ p2Short: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="p2Long" className="block text-sm text-cool-gray mb-2">
                        Long Press
                      </label>
                      <select
                        id="p2Long"
                        value={radioSettings.p2Long ?? 0}
                        onChange={(e) => updateRadioSettings({ p2Long: parseInt(e.target.value) || 0 })}
                        className="w-full px-3 py-2 bg-deep-gray border border-neon-cyan border-opacity-30 rounded text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                      >
                        {BUTTON_FUNCTION_OPTIONS.map(option => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}

          {/* One Key Operation */}
          {radioSettings && (
            <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6 mt-6">
              <h3 className="text-lg font-semibold text-neon-cyan mb-4 pb-2 border-b border-neon-cyan border-opacity-20">
                One Key Operation
              </h3>

              {/* Analog Call */}
              <div className="mb-6">
                <h4 className="text-md font-semibold text-neon-cyan mb-3">Analog Call</h4>
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
              <h4 className="text-md font-semibold text-neon-cyan mb-3">One Touch Call</h4>
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
              <h4 className="text-md font-semibold text-neon-cyan mb-3">Fun+ (Function Key Shortcuts)</h4>
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
          </div>
          )}
        </div>
      )}

      {/* Calibration Data Section - Read Only */}
      {calibrationLoaded && (
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-semibold text-yellow-400">Frequency Calibration Data</h3>
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
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">Frequency Array 1</h4>
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
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">Frequency Array 2</h4>
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
                  <h4 className="text-md font-semibold text-yellow-400 mb-2">Calibration Values</h4>
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
        </div>
      )}
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

