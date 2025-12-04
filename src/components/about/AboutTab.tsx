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
            <p className="text-sm text-gray-500 mt-4">
              Built with React, TypeScript, Vite, and Tailwind CSS
            </p>
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

