/**
 * How controls LOOK — background, border colour, text colour, focus and
 * disabled states — defined once.
 *
 * SIZE is deliberately not here. Padding, text size, width and height stay at
 * each call site, because they encode where the control lives: a `text-xs`
 * select in a channel-grid cell, a `w-32` edit-in-place cell in a settings
 * table, a `px-3 py-2` field in a dialog. Folding those together would change
 * layouts that were sized on purpose. A site keeps its size classes and takes
 * its look from here.
 *
 * Border WIDTH stays at the site too (`border`); these set only its colour.
 */

/** A text input, select or textarea. Replaces nine near-identical looks. */
export const FIELD =
  'bg-deep-gray border-neon-cyan border-opacity-30 text-white ' +
  'focus:outline-none focus:border-neon-cyan focus:shadow-glow-cyan ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

/** A borderless cell that edits in place, in dense settings and broadcast tables. */
export const FIELD_INLINE = 'bg-transparent border-none outline-none text-white focus:bg-panel focus:px-1';

/** A field on the Diagnostics tab, which is yellow on purpose. */
export const FIELD_CAUTION =
  'bg-deep-gray border-yellow-600/30 text-white focus:outline-none focus:border-yellow-400 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed';

/**
 * Button looks, by role. There were 104 hand-written button styles across 176
 * buttons: the same outline at border opacity 20, 30, 40 or 50, three hover
 * colours for one Cancel, Delete in five reds. A button keeps its own padding
 * and text size (a table-row ✕ is px-2; a toolbar action is px-4 py-2) and
 * takes its colours from its role here.
 */
export const BUTTON = {
  /** The main action. */
  primary:
    'bg-neon-cyan border-neon-cyan text-dark-charcoal hover:bg-neon-cyan-bright ' +
    'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
  /** A secondary action. */
  outline:
    'border-neon-cyan text-neon-cyan hover:bg-neon-cyan hover:bg-opacity-10 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
  /** A quiet action beside content: grey until hovered. */
  subtle:
    'border-neon-cyan border-opacity-20 text-cool-gray hover:text-neon-cyan hover:border-opacity-50 ' +
    'disabled:opacity-30 disabled:cursor-not-allowed transition-colors',
  /** Cancel, Close, Previous: neutral. */
  neutral:
    'border-neon-cyan border-opacity-30 text-cool-gray hover:text-white hover:bg-neon-cyan hover:bg-opacity-10 ' +
    'disabled:opacity-30 disabled:cursor-not-allowed transition-colors',
  /** Text-only dismiss: ×, or Cancel under a dialog's actions. */
  ghost: 'text-cool-gray hover:text-white transition-colors',
  /** A row in a menu or a picker list. */
  menuItem: 'text-cool-gray hover:text-neon-cyan hover:bg-neon-cyan hover:bg-opacity-10 transition-colors',
  /** An inline text link. */
  link: 'text-neon-cyan hover:text-neon-cyan-bright transition-colors',
  /** A row action in a dense table (✎, ⧉): its border shows only on hover. */
  rowAction: 'border-neon-cyan border-opacity-0 text-cool-gray hover:border-opacity-30 hover:text-neon-cyan transition-colors',
  /** Delete, Remove. */
  danger:
    'bg-red-600 bg-opacity-20 border-red-500 border-opacity-50 text-red-300 hover:bg-opacity-30 hover:border-opacity-70 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
  /** A destructive row action (✕ in a table, Clear all): grey until hovered. */
  dangerQuiet: 'border-red-600 border-opacity-0 text-cool-gray hover:border-opacity-30 hover:text-red-400 transition-colors',
  /** Diagnostics, which is yellow on purpose. */
  caution:
    'border-yellow-600/30 text-yellow-400 hover:border-yellow-400 hover:text-yellow-300 ' +
    'disabled:opacity-40 disabled:cursor-not-allowed transition-colors',
  /** A Diagnostics text link. */
  cautionLink: 'text-yellow-400 hover:text-yellow-300 transition-colors',
  /** A slow radio action outside Diagnostics (reading or writing the contact database). */
  cautionSolid:
    'bg-yellow-600 border-yellow-600 text-dark-charcoal hover:bg-yellow-500 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
  /** Import: the purple the toolbar asked for, as an undefined `neon-purple`. */
  secondary:
    'bg-electric-purple border-electric-purple text-white hover:bg-opacity-90 ' +
    'disabled:opacity-50 disabled:cursor-not-allowed transition-colors',
  /** A button that sits among fields and looks like one (the channel grid's Mode, Power, Bandwidth). */
  field: `${FIELD} hover:border-neon-cyan`,
} as const;
