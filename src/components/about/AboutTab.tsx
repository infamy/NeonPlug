import React, { useState } from 'react';
import { useDebugStore } from '../../store/debugStore';
import { RADIO_DESCRIPTORS } from '../../radios';
import { Card } from '../ui/Card';
import { SectionTitle } from '../ui/SectionTitle';
import { Button } from '../ui/Button';
import { ConfirmModal } from '../ui/ConfirmModal';
import { downloadOfflineAsZip } from '../../utils/offlineDownload';
import { VERSION_LABEL, COMMIT_HASH, BUILD_TIME, IS_RELEASE_BUILD, RELEASE_NOTES_URL } from '../../utils/version';
import { latestEntry } from '../../utils/changelog';
import changelogSource from '../../../CHANGELOG.md?raw';

const OFFLINE_FALLBACK_MESSAGE =
  'The latest tagged release is published as a single downloadable HTML file.\n\n' +
  'Click OK to download neonplug-latest.html from GitHub Releases.\n\n' +
  'Or build it locally using the instructions below.';

// Permanent redirect to the newest release's asset — the release workflow uploads
// every build twice, as neonplug-vX.Y.Z.html and again as neonplug-latest.html,
// so this URL never needs updating.
const OFFLINE_VERSION_URL =
  'https://github.com/infamy/NeonPlug/releases/latest/download/neonplug-latest.html';

const LATEST_RELEASE = latestEntry(changelogSource);

export const AboutTab: React.FC = () => {
  const { debugMode, setDebugMode } = useDebugStore();
  const [offlineFallbackOpen, setOfflineFallbackOpen] = useState(false);

  return (
    <>
    <div className="h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neon-cyan mb-2">About NeonPlug</h2>
        <p className="text-cool-gray">
          Online Digital CPS — program your radio directly from your browser.
        </p>
      </div>

      <div className="space-y-6">
        {/* What's new — parsed from the bundled CHANGELOG.md so it works offline */}
        {LATEST_RELEASE && (
          <Card>
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <SectionTitle>What's New</SectionTitle>
              <span className="text-xs font-mono text-muted">
                {VERSION_LABEL}
                {LATEST_RELEASE.date && ` · ${LATEST_RELEASE.date}`}
              </span>
            </div>
            {!IS_RELEASE_BUILD && (
              <p className="text-xs text-muted mb-3">
                You're on a development build, which is ahead of the notes below.
              </p>
            )}
            <ul className="list-disc list-inside text-cool-gray text-sm space-y-1 ml-4">
              {LATEST_RELEASE.items.slice(0, 12).map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
            {LATEST_RELEASE.items.length > 12 && (
              <p className="text-xs text-muted mt-2">
                …and {LATEST_RELEASE.items.length - 12} more.
              </p>
            )}
            <p className="text-xs text-muted mt-3">
              <a
                href={RELEASE_NOTES_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="link-accent"
              >
                Full release notes and previous versions
              </a>
            </p>
          </Card>
        )}

        {/* Offline Version */}
        <Card>
          <SectionTitle>Offline Version</SectionTitle>
          <div className="space-y-4">
            <p className="text-cool-gray">
              Download a single-file version of NeonPlug that works completely offline. 
              This is a self-contained HTML file with all assets inlined - perfect for:
            </p>
            <ul className="list-disc list-inside text-cool-gray space-y-2 ml-4">
              <li>Running without an internet connection</li>
              <li>Portable use on any computer</li>
              <li>Backup and archival purposes</li>
            </ul>
            
            <div className="flex flex-col gap-3">
              <Button
                onClick={async () => {
                  try {
                    await downloadOfflineAsZip();
                  } catch {
                    setOfflineFallbackOpen(true);
                  }
                }}
                variant="primary"
                className="inline-flex items-center justify-center px-6 py-3"
              >
                📥 Download Offline Version (ZIP)
              </Button>
              
              <p className="text-xs text-muted">
                Downloads a ZIP containing neonplug.html. Unzip and open the HTML file in your browser.
                {typeof window !== 'undefined' && window.location.hostname === 'localhost' && (
                  <> From the dev server the downloaded file is the dev build (not standalone). For a single-file offline build, use the live site or run <code className="text-neon-cyan">npm run build:single</code>.</>
                )}
                {' '}If the button doesn't work, visit the{' '}
                <a href="https://infamy.github.io/NeonPlug/" target="_blank" rel="noopener noreferrer" className="link-accent">live version</a>{' '}
                and use your browser's "Save Page As" feature.
              </p>
            </div>

            <Card variant="subdued" className="mt-4 border-opacity-30">
              <SectionTitle as="h4" size="sm">Building Locally</SectionTitle>
              <p className="text-cool-gray text-sm mb-2">
                To build your own offline version from source:
              </p>
              <pre className="bg-black rounded p-3 text-xs text-neon-cyan overflow-x-auto">
                <code>git clone https://github.com/infamy/NeonPlug.git
cd NeonPlug
npm install
npm run build:single</code>
              </pre>
              <p className="text-cool-gray text-xs mt-2">
                The single-file HTML will be in the <code className="text-neon-cyan">dist/index.html</code> file.
              </p>
            </Card>

            <Card variant="subdued" className="mt-4 border-opacity-30">
              <SectionTitle as="h4" size="sm">Using the Offline Version</SectionTitle>
              <ul className="list-disc list-inside text-cool-gray text-sm space-y-1 ml-4">
                <li>Simply open the downloaded <code className="text-neon-cyan">neonplug.html</code> file in any modern web browser</li>
                <li>No server or internet connection required - everything is in one file</li>
                <li>The Web Serial API will still work for connecting to your radio</li>
                <li>All features work exactly the same as the online version</li>
              </ul>
            </Card>
          </div>
        </Card>

        {/* Project Info */}
        <Card>
          <SectionTitle>Project Information</SectionTitle>
          <div className="space-y-3 text-cool-gray">
            <p>
              <span className="text-neon-cyan font-semibold">NeonPlug</span> is a next-generation, web-based Channel Programming Software (CPS). Built with a cyberpunk neon-themed UI, it provides an intuitive interface for managing channels, zones, scan lists, contacts, and radio settings — all from your browser, with no drivers or software to install.
            </p>
            <p>
              Each radio's full protocol is implemented natively, enabling read and write operations via the Web Serial API and — where supported — Bluetooth Low Energy (BLE).
            </p>
          </div>
        </Card>

        {/* Supported Radios */}
        <Card>
          <SectionTitle>Supported Radios</SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-neon-cyan border-opacity-30">
                  <th className="text-left py-2 pr-4 text-neon-cyan font-semibold">Radio</th>
                  <th className="text-left py-2 pr-4 text-neon-cyan font-semibold">Manufacturer</th>
                  <th className="text-left py-2 text-neon-cyan font-semibold">Connection</th>
                </tr>
              </thead>
              <tbody>
                {RADIO_DESCRIPTORS.map((d) => (
                  <tr key={d.modelIds[0]} className="border-b border-neon-cyan border-opacity-10">
                    <td className="py-2 pr-4 text-white font-medium">
                      {d.icon} {d.modelIds.join(' / ')}
                    </td>
                    <td className="py-2 pr-4 text-cool-gray">{d.group ?? '—'}</td>
                    <td className="py-2 text-cool-gray">
                      {d.supportsBle ? 'USB or BLE' : 'USB'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Codeplug format */}
        <Card>
          <SectionTitle>Codeplug format (.neonplug)</SectionTitle>
          <p className="text-cool-gray text-sm">
            The codeplug file is a zipped JSON archive. You can unzip it to inspect the contents in a semi-human-readable way (e.g. <code className="text-neon-cyan">codeplug.json</code> inside the zip). Editing the JSON directly is not recommended—use NeonPlug’s import/export and in-app editing instead, to avoid invalid data or corruption.
          </p>
        </Card>

        {/* Links */}
        <Card>
          <SectionTitle>Links</SectionTitle>
          <div className="space-y-3">
            <div>
              <span className="text-cool-gray">NeonPlug Repository: </span>
              <a
                href="https://github.com/infamy/NeonPlug"
                target="_blank"
                rel="noopener noreferrer"
                className="link-accent"
              >
                https://github.com/infamy/NeonPlug
              </a>
            </div>
            <div>
              <span className="text-cool-gray">DM-32UV Protocol Specification: </span>
              <a
                href="https://github.com/infamy/DM32-Protocol-Spec"
                target="_blank"
                rel="noopener noreferrer"
                className="link-accent"
              >
                https://github.com/infamy/DM32-Protocol-Spec
              </a>
            </div>
          </div>
        </Card>

        {/* Credits */}
        <Card>
          <SectionTitle>Credits</SectionTitle>
          <div className="space-y-3 text-cool-gray">
            <p>
              <span className="text-neon-cyan font-semibold">Developer:</span>{' '}
              <a
                href="https://github.com/infamy"
                target="_blank"
                rel="noopener noreferrer"
                className="link-accent"
              >
                infamy
              </a>
            </p>
            <p>
              Radio protocols were implemented through reverse engineering — serial port captures,
              analysis of official CPS software, and reference to open-source projects including
              CHIRP. The DM-32UV protocol specification is documented separately.
            </p>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-cool-gray">
                Built with React, TypeScript, Vite, and Tailwind CSS
              </p>
              <div className="text-xs text-cool-gray font-mono">
                <div>
                  <span className="text-cool-gray">Version: </span>
                  <span className="text-neon-cyan">{VERSION_LABEL}</span>
                  {!IS_RELEASE_BUILD && (
                    <span className="text-muted"> (development build)</span>
                  )}
                </div>
                <div className="mt-1">
                  <span className="text-cool-gray">Commit: </span>
                  <span className="text-neon-cyan">{COMMIT_HASH}</span>
                </div>
                {BUILD_TIME && (
                  <div className="mt-1">
                    <span className="text-cool-gray">Built: </span>
                    <span className="text-neon-cyan">
                      {new Date(BUILD_TIME).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Data Sources & Attribution */}
        <Card>
          <SectionTitle>Data Sources & Attribution</SectionTitle>
          <div className="space-y-4 text-cool-gray">
            <p className="text-sm">
              NeonPlug uses data from the following sources. We are grateful to these organizations and projects for making their data available.
            </p>
            
            <div className="space-y-3">
              <div>
                <SectionTitle as="h4" size="sm" className="mb-1">RadioID.net</SectionTitle>
                <p className="text-sm mb-2">
                  DMR contact database and API for downloading contacts by country.
                </p>
                <a
                  href="https://radioid.net"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-accent text-sm"
                >
                  https://radioid.net
                </a>
              </div>

              <div>
                <SectionTitle as="h4" size="sm" className="mb-1">TAFL Database</SectionTitle>
                <p className="text-sm mb-2">
                  Canadian radio frequency license data from the Technical Acceptance and Frequency List (TAFL), 
                  maintained by Innovation, Science and Economic Development Canada (ISED).
                </p>
                <a
                  href="https://ised-isde.canada.ca/site/spectrum-management-telecommunications/en"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-accent text-sm"
                >
                  ISED Spectrum Management
                </a>
              </div>

              <div>
                <SectionTitle as="h4" size="sm" className="mb-1">Airport Frequency Data</SectionTitle>
                <p className="text-sm mb-2">
                  Airport communication frequencies and location data from open aviation databases, 
                  including ICAO-compliant frequency information.
                </p>
                <div className="space-y-1">
                  <a
                    href="https://frequency.icao.int"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-accent block text-sm"
                  >
                    ICAO Frequency Finder
                  </a>
                  <a
                    href="https://airportmap.de/data"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="link-accent block text-sm"
                  >
                    Airportmap Open Databases
                  </a>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-neon-cyan border-opacity-20">
              <p className="text-xs text-cool-gray italic">
                Data accuracy and completeness may vary. Always verify critical frequency information 
                with official sources before use.
              </p>
            </div>
          </div>
        </Card>

        {/* License */}
        <Card>
          <SectionTitle>License</SectionTitle>
          <p className="text-cool-gray text-sm">
            This software is provided "as is" without warranty. Use at your own risk. 
            Ensure compliance with local radio regulations and manufacturer warranties.
          </p>
        </Card>

        {/* Debug Mode */}
        <div className="bg-deep-gray rounded-lg border border-yellow-600/30 p-6">
          <h3 className="text-lg font-semibold text-yellow-400 mb-4">Debug Mode</h3>
          <div className="space-y-3">
            <p className="text-cool-gray text-sm">
              Enable debug mode to access diagnostic tools for inspecting raw memory blocks and verifying field parsing.
            </p>
            <button
              type="button"
              onClick={() => setDebugMode(!debugMode)}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                debugMode
                  ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-600/30 hover:bg-yellow-900/50'
                  : 'bg-yellow-900/20 text-yellow-500 border border-yellow-600/20 hover:bg-yellow-900/30'
              }`}
            >
              {debugMode ? '✓ Debug Mode Enabled' : 'Enable Debug Mode'}
            </button>
            {debugMode && (
              <p className="text-xs text-yellow-400">
                Debug mode is enabled. The Diagnostics tab (🐛) is now visible in the navigation bar.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
    <ConfirmModal
      isOpen={offlineFallbackOpen}
      onClose={() => setOfflineFallbackOpen(false)}
      onConfirm={() => window.open(OFFLINE_VERSION_URL, '_blank')}
      title="Download offline version"
      message={OFFLINE_FALLBACK_MESSAGE}
      confirmLabel="OK"
      variant="alert"
    />
    </>
  );
};

