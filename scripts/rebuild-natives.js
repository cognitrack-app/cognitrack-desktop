/**
 * scripts/rebuild-natives.js
 *
 * electron-builder `beforePack` hook.
 * Rebuilds native Node addons (better-sqlite3, active-win) against the
 * Electron version being packaged, for the correct target architecture.
 *
 * BUG-W1 FIX: The previous version called electron-rebuild without --arch,
 * which caused it to compile for the host Node process architecture (often
 * ia32 on Windows developer machines that installed the 32-bit Node installer).
 * This resulted in ia32 .node files being bundled into an x64 Electron app,
 * causing either a silent arch downgrade or a "%1 is not a valid Win32
 * application" crash at startup.
 *
 * electron-builder sets context.arch to the target arch string ('x64',
 * 'arm64', 'ia32') before calling this hook. We forward it to electron-rebuild
 * via --arch so the .node files always match the Electron host.
 *
 * IMPORTANT: electron-builder hooks must export a function — a top-level
 * script that executes immediately is NOT invoked by the hook mechanism.
 *
 * @param {import('electron-builder').BeforePackContext} context
 */
const { execSync } = require('child_process');

module.exports = async function rebuildNatives(context) {
  // BUG-W1: resolve target arch from the hook context first, then fall back
  // to the env vars electron-builder also sets, then hard-default to x64.
  // Never let electron-rebuild infer the arch from the running Node process.
  const arch =
    context.arch                      // e.g. 'x64', 'arm64' — most reliable
    || process.env.npm_config_arch    // set by electron-builder in some versions
    || process.env.npm_config_target_arch
    || 'x64'; // safe fallback — ia32 is never correct for a modern app

  console.log(`[rebuild] Rebuilding native modules for Electron (arch=${arch})...`);
  try {
    execSync(
      // --arch   tells node-gyp which CPU arch to target
      // --target-arch is the electron-rebuild alias for the same flag
      `node_modules/.bin/electron-rebuild -f -w better-sqlite3,active-win --arch ${arch}`,
      {
        cwd:   context.appDir, // electron-builder provides the correct app root
        stdio: 'inherit',
      }
    );
    console.log('[rebuild] Done.');
  } catch (err) {
    console.error('[rebuild] Failed:', err.message);
    // Propagate the error so electron-builder aborts the package — a broken
    // native module silently included in the asar would crash at runtime.
    throw err;
  }
};
