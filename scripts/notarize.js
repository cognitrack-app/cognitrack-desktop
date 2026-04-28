/**
 * scripts/notarize.js
 *
 * Called by electron-builder via the `afterSign` hook.
 * Submits the signed macOS .app bundle to Apple for notarization.
 *
 * Required environment variables (set in CI or locally):
 *   APPLE_ID                    — your Apple ID email
 *   APPLE_APP_SPECIFIC_PASSWORD — app-specific password from appleid.apple.com
 *   APPLE_TEAM_ID               — 10-character Team ID from developer.apple.com
 *
 * If APPLE_ID is not set the script is a no-op, allowing local dev builds
 * to run through electron-builder without failing.
 *
 * Dependency: @electron/notarize (add to devDependencies)
 *   pnpm add -D @electron/notarize --filter @cognitrack/desktop
 */

const { notarize } = require('@electron/notarize');

module.exports = async function notarizeApp(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only run on macOS builds
  if (electronPlatformName !== 'darwin') return;

  // Skip gracefully when Apple credentials are not configured
  if (!process.env.APPLE_ID) {
    console.log('[notarize] APPLE_ID not set — skipping notarization (local build)');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`[notarize] Submitting ${appPath} to Apple notarization service...`);

  await notarize({
    appPath,
    appleId:             process.env.APPLE_ID,
    appleIdPassword:     process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId:              process.env.APPLE_TEAM_ID,
  });

  console.log('[notarize] Notarization complete.');
};
