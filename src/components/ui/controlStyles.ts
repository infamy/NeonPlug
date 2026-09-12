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
