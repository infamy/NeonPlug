import React, { useRef, useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useRadioSettingsStore } from '../../store/radioSettingsStore';
import { imageDisplayState } from '../../radios/d890uv/displaySelectors';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { D890ImagePreview } from '../diagnostics/D890ImagePreview';
import { SectionTitle } from '../ui/SectionTitle';
import {
  D890_IMAGE,
  D890_IMAGE_LABEL,
  encodeD890Image,
  type D890ImageKind,
  type D890ImageFit,
} from '../../radios/d890uv/bootImage';
import { BUTTON, FIELD } from '../ui/controlStyles';

const ORDER: D890ImageKind[] = ['boot', 'bk1', 'bk2'];

const FIT_LABEL: Record<D890ImageFit, string> = {
  cover: 'Fill and crop',
  contain: 'Fit whole image',
  stretch: 'Stretch to fill',
};

const FIT_HELP: Record<D890ImageFit, string> = {
  cover: 'Keeps the shape, fills the screen, trims the overflow.',
  contain: 'Keeps the shape and the whole picture, padding the gap with black.',
  stretch: 'Squashes the picture to fit. This is what the OEM software does.',
};

/** Decode any browser-readable image file to RGBA at its natural size. */
async function fileToRgba(
  file: File
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not read that image file.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not read that image file.');
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return { data, width: canvas.width, height: canvas.height };
  } finally {
    URL.revokeObjectURL(url);
  }
}

interface ImageSlotProps {
  kind: D890ImageKind;
  fromRadio: Uint8Array | null;
}

/** Scroll to a settings section, the same way the jump-nav chips do. */
function jumpToSettingsSection(id: string) {
  document
    .getElementById(`settings-section-${id}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/**
 * Whether the radio is currently set to show THIS picture, and where to change it.
 *
 * Renders nothing when settings have not been read: "we do not know" must not
 * look like "not shown", or someone with no codeplug loaded is told their
 * picture is disabled.
 */
const DisplayBadge: React.FC<{ kind: D890ImageKind }> = ({ kind }) => {
  const { settings } = useRadioSettingsStore();
  const state = imageDisplayState(
    kind,
    settings?.radioSpecific as Record<string, unknown> | undefined
  );
  if (!state) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          state.shown
            ? 'px-2 py-0.5 text-[11px] rounded-full bg-neon-cyan text-black font-medium'
            : 'px-2 py-0.5 text-[11px] rounded-full border border-panel text-muted'
        }
      >
        {state.shown ? state.role : 'Not shown'}
      </span>
      {state.reason && <span className="text-[11px] text-muted">{state.reason}</span>}
      <button
        type="button"
        onClick={() => jumpToSettingsSection('display')}
        className={`${BUTTON.link} text-[11px] hover:underline`}
      >
        {state.setting} →
      </button>
    </div>
  );
};

const ImageSlot: React.FC<ImageSlotProps> = ({ kind, fromRadio }) => {
  const { writePicture, isConnecting } = useRadioConnection();
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [sendPercent, setSendPercent] = useState(0);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [staged, setStaged] = useState<Uint8Array | null>(null);
  const [fit, setFit] = useState<D890ImageFit>('cover');
  const [source, setSource] = useState<{ data: Uint8ClampedArray; width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restage = (
    src: { data: Uint8ClampedArray; width: number; height: number },
    mode: D890ImageFit
  ) => {
    try {
      setStaged(encodeD890Image(src.data, src.width, src.height, { fit: mode }));
      setError(null);
    } catch (e) {
      setStaged(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onSend = async () => {
    if (!staged) return;
    setSending(true);
    setError(null);
    try {
      await writePicture(kind, staged, (percent, label) => {
        setSendPercent(percent);
        setSendStatus(label);
      });
      // No read-back: reading mid-write reboots this radio, and comparing
      // inside the same session compares against pre-write contents anyway.
      setSendStatus('Sent. Read the radio in a moment to confirm.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSendStatus(null);
    } finally {
      setSending(false);
    }
  };

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    try {
      const src = await fileToRgba(file);
      setSource(src);
      restage(src, fit);
    } catch (e) {
      setSource(null);
      setStaged(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const blank = fromRadio?.every((b) => b === 0xff) ?? false;

  return (
    <div className="p-4 bg-dark-charcoal rounded-lg border-panel">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h4 className="text-sm font-semibold text-neon-cyan">{D890_IMAGE_LABEL[kind]}</h4>
        <DisplayBadge kind={kind} />
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <div>
          <p className="text-xs text-muted mb-2">
            On the radio{blank ? ' — not set' : ''}
          </p>
          {fromRadio ? (
            <D890ImagePreview kind={kind} data={fromRadio} hideHeading />
          ) : (
            <p className="text-xs text-muted">Not read.</p>
          )}
        </div>

        {staged && (
          <div>
            <p className="text-xs text-neon-cyan mb-2">Ready to send</p>
            <D890ImagePreview kind={kind} data={staged} hideHeading />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            void onPick(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className={`${BUTTON.outline} px-3 py-1.5 text-xs border rounded`}
        >
          Choose image…
        </button>

        {source && (
          <label className="text-xs text-muted flex items-center gap-2">
            Sizing
            <select
              value={fit}
              onChange={(e) => {
                const mode = e.target.value as D890ImageFit;
                setFit(mode);
                restage(source, mode);
              }}
              className={`${FIELD} border rounded px-2 py-1 text-neon-cyan text-xs`}
            >
              {(Object.keys(FIT_LABEL) as D890ImageFit[]).map((m) => (
                <option key={m} value={m}>{FIT_LABEL[m]}</option>
              ))}
            </select>
          </label>
        )}

        {staged && (
          <>
            <button
              type="button"
              onClick={() => void onSend()}
              disabled={sending || isConnecting}
              title={`Write this picture to the radio (${D890_IMAGE.BYTES.toLocaleString()} bytes)`}
              className={`${BUTTON.outline} px-3 py-1.5 text-xs border rounded`}
            >
              {sending ? 'Sending…' : 'Send to radio'}
            </button>
            <button
              type="button"
              disabled={sending}
              onClick={() => { setStaged(null); setSource(null); setSendStatus(null); }}
              className={`${BUTTON.subtle} px-3 py-1.5 text-xs`}
            >
              Clear
            </button>
            {sendStatus && <span className="text-xs text-muted">{sendStatus}</span>}
          </>
        )}
      </div>

      {sending && (
        <div className="mt-3">
          <div className="h-1.5 bg-black bg-opacity-40 rounded overflow-hidden">
            <div
              className="h-full bg-neon-cyan transition-[width] duration-200"
              style={{ width: `${Math.max(0, Math.min(100, sendPercent))}%` }}
            />
          </div>
          <p className="text-xs text-muted mt-1 tabular-nums">
            {Math.round(sendPercent)}% — {Math.round((sendPercent / 100) * D890_IMAGE.FRAMES)}
            {' of '}{D890_IMAGE.FRAMES} frames
          </p>
        </div>
      )}

      {source && !sending && (
        <p className="text-xs text-muted mt-2">
          {source.width}×{source.height} → {D890_IMAGE.WIDTH}×{D890_IMAGE.HEIGHT}. {FIT_HELP[fit]}
        </p>
      )}
      {error && <p className="text-xs text-amber-400 mt-2">{error}</p>}
    </div>
  );
};

/**
 * The DA-7X2's three pictures, as a Settings area rather than a tab.
 *
 * They are read with the codeplug, so this shows what is already in hand — no
 * "read from radio" button, unlike the DM-32 section, where the image is a
 * separate and much slower trip.
 *
 * Sending is deliberately disabled. The format is confirmed on hardware in both
 * directions and `encodeD890Image` produces the exact bytes, so everything up to
 * the final step works and can be checked by eye — but NeonPlug has never
 * written to this radio, and an image write lands in a region whose
 * other contents are unknown. Staging without sending is the useful half: it
 * exercises the encoder and shows the user precisely what would go out.
 */
export const D890ImagesArea: React.FC = () => {
  const { tables } = useRadioStore();
  const { readPictures, isConnecting } = useRadioConnection();
  const [readError, setReadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);

  const onRead = async () => {
    setReadError(null);
    setPercent(0);
    try {
      await readPictures((p, message) => {
        setPercent(p);
        setStatus(message);
      });
    } catch (e) {
      setReadError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatus(null);
      setPercent(0);
    }
  };

  return (
    <div>
      <SectionTitle size="lg" underline>Boot &amp; Standby Backgrounds</SectionTitle>
      <p className="text-cool-gray text-sm mb-6">
        All three are {D890_IMAGE.WIDTH}×{D890_IMAGE.HEIGHT}. They are read on request
        rather than with the codeplug — together they are larger than everything else
        on the radio put together, and waiting for them on every read is not worth it.
        {' '}The boot image only appears if <em>Power On</em> is set to Image rather
        than custom text.
      </p>


      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onRead()}
          disabled={isConnecting}
          className={`${BUTTON.outline} px-4 py-2 border text-sm font-medium rounded`}
          title="Read the three pictures from the radio"
        >
          {isConnecting ? 'Reading…' : 'Read from radio'}
        </button>
        {readError && <span className="text-xs text-amber-400">{readError}</span>}
      </div>

      {isConnecting && (
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-xs text-neon-cyan">{status ?? 'Reading…'}</span>
            <span className="text-xs text-muted font-mono">{Math.round(percent)}%</span>
          </div>
          <div className="h-1.5 w-full bg-dark-charcoal rounded overflow-hidden">
            <div
              className="h-full bg-neon-cyan transition-[width] duration-150"
              style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
          </div>
        </div>
      )}


      <div className="flex flex-col gap-4">
        {ORDER.map((kind) => (
          <ImageSlot key={kind} kind={kind} fromRadio={tables.pictures?.[kind] ?? null} />
        ))}
      </div>
    </div>
  );
};
