import React from 'react';

export const AboutTab: React.FC = () => {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-neon-cyan mb-2">About NeonPlug</h2>
        <p className="text-cool-gray">
          Channel Programming Software for the Baofeng DM-32UV radio
        </p>
      </div>

      <div className="space-y-6">
        {/* Offline Version */}
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
          <h3 className="text-lg font-semibold text-neon-cyan mb-4">Offline Version</h3>
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
              <button
                onClick={async () => {
                  try {
                    // Try to download from GitHub Pages
                    const response = await fetch('https://infamy.github.io/NeonPlug/');
                    if (!response.ok) throw new Error('Not available');
                    
                    const html = await response.text();
                    const blob = new Blob([html], { type: 'text/html' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'neonplug.html';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  } catch (error) {
                    // Fallback: open GitHub Pages in new tab with instructions
                    const confirmed = window.confirm(
                      'The offline version is available on GitHub Pages.\n\n' +
                      'Click OK to open it, then:\n' +
                      '1. Right-click on the page\n' +
                      '2. Select "Save As" or "Save Page As"\n' +
                      '3. Save as "neonplug.html"\n\n' +
                      'Or build it locally using the instructions below.'
                    );
                    if (confirmed) {
                      window.open('https://infamy.github.io/NeonPlug/', '_blank');
                    }
                  }
                }}
                className="inline-flex items-center justify-center px-6 py-3 bg-electric-purple text-white rounded-lg hover:bg-opacity-90 transition-colors font-semibold"
              >
                📥 Download Offline Version
              </button>
              
              <p className="text-xs text-gray-500">
                Downloads the single-file HTML version. If the button doesn't work, visit the{' '}
                <a href="https://infamy.github.io/NeonPlug/" target="_blank" rel="noopener noreferrer" className="text-electric-purple hover:text-neon-magenta underline">live version</a>{' '}
                and use your browser's "Save Page As" feature.
              </p>
            </div>

            <div className="mt-4 p-4 bg-dark-charcoal rounded border border-neon-cyan border-opacity-30">
              <h4 className="text-neon-cyan font-semibold mb-2 text-sm">Building Locally</h4>
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
            </div>

            <div className="mt-4 p-4 bg-dark-charcoal rounded border border-neon-cyan border-opacity-30">
              <h4 className="text-neon-cyan font-semibold mb-2 text-sm">Using the Offline Version</h4>
              <ul className="list-disc list-inside text-cool-gray text-sm space-y-1 ml-4">
                <li>Simply open the downloaded <code className="text-neon-cyan">neonplug.html</code> file in any modern web browser</li>
                <li>No server or internet connection required - everything is in one file</li>
                <li>The Web Serial API will still work for connecting to your radio</li>
                <li>All features work exactly the same as the online version</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Project Info */}
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
          <h3 className="text-lg font-semibold text-neon-cyan mb-4">Project Information</h3>
          <div className="space-y-3 text-cool-gray">
            <p>
              <span className="text-neon-cyan font-semibold">NeonPlug</span> is a web-based Channel Programming Software (CPS) 
              for the Baofeng DM-32UV radio. Built with a modern cyberpunk neon-themed UI, it provides 
              an intuitive interface for managing channels, zones, scan lists, contacts, and radio settings.
            </p>
            <p>
              This software implements the DM-32UV serial protocol specification, enabling full read and write 
              operations directly from your web browser using the Web Serial API.
            </p>
          </div>
        </div>

        {/* Links */}
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
          <h3 className="text-lg font-semibold text-neon-cyan mb-4">Links</h3>
          <div className="space-y-3">
            <div>
              <span className="text-cool-gray">NeonPlug Repository: </span>
              <a
                href="https://github.com/infamy/NeonPlug"
                target="_blank"
                rel="noopener noreferrer"
                className="text-electric-purple hover:text-neon-magenta transition-colors underline"
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
                className="text-electric-purple hover:text-neon-magenta transition-colors underline"
              >
                https://github.com/infamy/DM32-Protocol-Spec
              </a>
            </div>
          </div>
        </div>

        {/* Credits */}
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
          <h3 className="text-lg font-semibold text-neon-cyan mb-4">Credits</h3>
          <div className="space-y-3 text-cool-gray">
            <p>
              <span className="text-neon-cyan font-semibold">Developer:</span>{' '}
              <a
                href="https://github.com/infamy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-electric-purple hover:text-neon-magenta transition-colors underline"
              >
                infamy
              </a>
            </p>
            <p>
              This project implements the DM-32UV protocol specification, which was reverse-engineered 
              through analysis of serial port captures and the official CPS software.
            </p>
            <div className="mt-4 space-y-2">
              <p className="text-sm text-gray-500">
                Built with React, TypeScript, Vite, and Tailwind CSS
              </p>
              <div className="text-xs text-gray-600 font-mono">
                <div>
                  <span className="text-cool-gray">Version: </span>
                  <span className="text-neon-cyan">
                    {typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev'}
                  </span>
                </div>
                {typeof __BUILD_TIME__ !== 'undefined' && (
                  <div className="mt-1">
                    <span className="text-cool-gray">Built: </span>
                    <span className="text-neon-cyan">
                      {new Date(__BUILD_TIME__).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* License */}
        <div className="bg-deep-gray rounded-lg border border-neon-cyan p-6">
          <h3 className="text-lg font-semibold text-neon-cyan mb-4">License</h3>
          <p className="text-cool-gray text-sm">
            This software is provided "as is" without warranty. Use at your own risk. 
            Ensure compliance with local radio regulations and manufacturer warranties.
          </p>
        </div>
      </div>
    </div>
  );
};

