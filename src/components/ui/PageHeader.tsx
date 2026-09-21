/**
 * The title at the top of a tab — one component, so every tab's header matches.
 *
 * Before this, tabs built their headers two ways and drifted three ways:
 *
 *   - Channels, Zones and Scan Lists used a raw `<h2 className="text-2xl …">`
 *     and rendered at 24px.
 *   - Digital, Settings, Channel Wizard and Diagnostics used
 *     `<SectionTitle size="xl" className="text-2xl">` — asking for 24px on top
 *     of the preset's own `text-xl`, which won, so they rendered at 20px while
 *     plainly meaning not to.
 *   - Digital, Channel Wizard and Diagnostics also sat inside an extra `p-6`
 *     wrapper INSIDE <main>'s p-6, putting their titles 48px in instead of 24.
 *   - Descriptions came at 14px on some tabs and 16px on others.
 *
 * This owns the size outright rather than adding to someone else's, and the
 * tabs no longer carry their own padding.
 */

import React from 'react';

interface PageHeaderProps {
  title: string;
  /** One line under the title saying what the tab is for. */
  description?: React.ReactNode;
  /** The right-hand side: counts, view switches, add buttons. */
  actions?: React.ReactNode;
  /** Diagnostics is yellow on purpose — it marks a developer-only screen. */
  tone?: 'default' | 'caution';
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  actions,
  tone = 'default',
  className = '',
}) => (
  <div className={`mb-5 flex items-center justify-between gap-4 shrink-0 ${className}`}>
    <div className="min-w-0">
      <h2 className={`text-2xl font-bold ${tone === 'caution' ? 'text-yellow-400' : 'text-neon-cyan'}`}>
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-cool-gray">{description}</p>}
    </div>
    {actions && <div className="flex items-center gap-4 shrink-0 text-cool-gray">{actions}</div>}
  </div>
);
