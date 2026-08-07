/**
 * Build identity — the single place the app decides what version it claims to be.
 *
 * Three build channels exist and a user must always be able to tell which one
 * they are on, because "which build wrote this codeplug?" is the first question
 * on any radio-write bug report:
 *
 *   release  (neonplug.app/, and the downloadable offline file)  -> "v0.2.0"
 *   main     (neonplug.app/dev/)                                 -> "v0.2.0-dev+a1b2c3d"
 *   PR/local (neonplug.app/test/<branch>/, npm run dev)          -> "v0.2.0-dev+a1b2c3d"
 *
 * A dev build carries the version of the *last* release plus the commit it was
 * actually built from — it is ahead of that release, never equal to it.
 */

/** Semver from package.json, pinned by the release workflow at tag time. */
export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0';

/** Short commit hash, or 'dev' when git wasn't available at build time. */
export const COMMIT_HASH: string =
  typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : 'dev';

/** ISO timestamp of the build. */
export const BUILD_TIME: string =
  typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : '';

/** True only for a build produced by release.yml from a vX.Y.Z tag. */
export const IS_RELEASE_BUILD: boolean =
  typeof __RELEASE_BUILD__ !== 'undefined' ? __RELEASE_BUILD__ : false;

/**
 * The version string shown in the UI and stamped into bug reports.
 * Release builds are clean semver; everything else is explicitly marked -dev.
 */
export const VERSION_LABEL: string = IS_RELEASE_BUILD
  ? `v${APP_VERSION}`
  : `v${APP_VERSION}-dev+${COMMIT_HASH}`;

/** GitHub release page for this exact version (release builds) or the tag list. */
export const RELEASE_NOTES_URL: string = IS_RELEASE_BUILD
  ? `https://github.com/infamy/NeonPlug/releases/tag/v${APP_VERSION}`
  : 'https://github.com/infamy/NeonPlug/releases';
