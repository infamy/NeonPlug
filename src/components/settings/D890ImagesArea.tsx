import React, { useRef, useState } from 'react';
import { useRadioStore } from '../../store/radioStore';
import { useRadioConnection } from '../../hooks/useRadioConnection';
import { D890ImagePreview } from '../diagnostics/D890ImagePreview';
import { SectionTitle } from '../ui/SectionTitle';
import {
  D890_IMAGE,
  D890_IMAGE_LABEL,
  encodeD890Image,
  IMAGE_WRITE_RISK,
  type D890ImageKind,
  type D890ImageFit,
} from '../../radios/d890uv/bootImage';

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

const ImageSlot: React.FC<ImageSlotProps> = ({ kind, fromRadio }) => {
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
      <h4 className="text-sm font-semibold text-neon-cyan mb-3">{D890_IMAGE_LABEL[kind]}</h4>

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
          className="px-3 py-1.5 text-xs bg-dark-charcoal border border-neon-cyan border-opacity-50 text-neon-cyan rounded hover:bg-neon-cyan hover:text-black transition-colors"
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
              className="bg-black border border-panel rounded px-2 py-1 text-neon-cyan text-xs"
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
              disabled
              title={IMAGE_WRITE_RISK}
              className="px-3 py-1.5 text-xs border border-panel text-muted rounded opacity-50 cursor-not-allowed"
            >
              Send to radio
            </button>
            <button
              type="button"
              onClick={() => { setStaged(null); setSource(null); }}
              className="px-3 py-1.5 text-xs text-muted hover:text-neon-cyan transition-colors"
            >
              Clear
            </button>
          </>
        )}
      </div>

      {source && (
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
 * written to this radio, and an image write lands in a 256 KB erase unit whose
 * other contents are unknown. Staging without sending is the useful half: it
 * exercises the encoder and shows the user precisely what would go out.
 */
/**
 * The custom power-on text — the alternative the boot image replaces.
 *
 * Lives here rather than in the settings grid for two reasons: it is the other
 * half of "what the radio shows at power on", and it sits at 0x3500900, outside
 * the settings block that `settingsMap.ts` covers.
 *
 * Read-only for now. The password is shown because the CPS shows it in clear on
 * the same tab; it is the radio's power-on lock, not a credential of the user's.
 */
const PowerOnText: React.FC = () => {
  const { d890PowerOnDisplay } = useRadioStore();
  if (!d890PowerOnDisplay) return null;
  const { line1, line2, password } = d890PowerOnDisplay;
  if (!line1 && !line2 && !password) return null;

  return (
    <div className="mb-6 bg-neon-cyan bg-opacity-5 border border-neon-cyan border-opacity-30 rounded-lg p-4">
      <h4 className="text-neon-cyan font-medium mb-1">Power-on Text</h4>
      <p className="text-cool-gray text-xs mb-3">
        Shown instead of the boot image when <em>Power On</em> is set to custom text.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
        <div>
          <div className="text-cool-gray mb-1">Line 1</div>
          <div className="text-white font-mono">{line1 || <span className="text-muted">—</span>}</div>
        </div>
        <div>
          <div className="text-cool-gray mb-1">Line 2</div>
          <div className="text-white font-mono">{line2 || <span className="text-muted">—</span>}</div>
        </div>
        <div>
          <div className="text-cool-gray mb-1">Power-on Password</div>
          <div className="text-white font-mono">{password || <span className="text-muted">Not set</span>}</div>
        </div>
      </div>
    </div>
  );
};

export const D890ImagesArea: React.FC = () => {
  const { d890Images } = useRadioStore();
  const { readD890Images, isConnecting } = useRadioConnection();
  const [readError, setReadError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [percent, setPercent] = useState(0);

  const onRead = async () => {
    setReadError(null);
    setPercent(0);
    try {
      await readD890Images((p, message) => {
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

      <PowerOnText />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void onRead()}
          disabled={isConnecting}
          className="px-4 py-2 bg-dark-charcoal border border-neon-cyan border-opacity-50 text-neon-cyan text-sm font-medium rounded hover:bg-neon-cyan hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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

      <div className="mb-6 p-3 bg-panel rounded border-panel">
        <p className="text-xs text-amber-400">
          Sending images to the radio is not enabled yet. You can choose a picture and
          see exactly how it would look, but NeonPlug has never written to this radio
          and these regions sit inside a 256&nbsp;KB erase block whose other contents
          are unknown — so the last step stays switched off until that is settled.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {ORDER.map((kind) => (
          <ImageSlot key={kind} kind={kind} fromRadio={d890Images?.[kind] ?? null} />
        ))}
      </div>
    </div>
  );
};
