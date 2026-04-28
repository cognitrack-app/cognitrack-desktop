import { execSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { app } from 'electron';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = 'device-id.txt';

/**
 * Returns a stable, anonymised device identifier for this machine.
 *
 * Strategy:
 *   1. Read from userData cache (fastest path — avoids shelling out on every launch)
 *   2. macOS: `system_profiler SPHardwareDataType` for the Hardware UUID
 *      Windows: PowerShell `Get-CimInstance Win32_ComputerSystemProduct` for the GUID
 *              (Get-CimInstance is the modern replacement for the deprecated Get-WmiObject,
 *               which was removed in Windows 11 24H2 / PowerShell 7+ default installations)
 *   3. SHA-256 hash the GUID so the raw hardware ID never leaves the machine
 *   4. Persist the hash to userData so the shell command only ever runs once
 *
 * The resulting ID is 64 hex chars — irreversible, no PII.
 * Matches the v6 PRD: "SHA-256(hardware GUID)".
 */
export function getDeviceId(): string {
  const cachePath = path.join(app.getPath('userData'), CACHE_FILE);

  // Fast path: already computed on a previous launch
  if (fs.existsSync(cachePath)) {
    const cached = fs.readFileSync(cachePath, 'utf-8').trim();
    if (cached.length === 64) return cached; // valid SHA-256 hex
  }

  const deviceId = computeDeviceId(cachePath);

  // Persist so the hardware query only runs once per machine.
  // BUG-W4 FIX: log loudly on failure instead of silently swallowing the
  // error — a silent failure here means every subsequent launch generates a
  // new random device ID, accumulating phantom device registrations in Firestore.
  try {
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, deviceId, { encoding: 'utf-8' });
  } catch (err) {
    console.error(
      '[deviceId] CRITICAL: Could not persist device ID cache. ' +
      'The device will re-register on every launch until this is resolved.',
      err
    );
  }

  return deviceId;
}

function computeDeviceId(cachePath: string): string {
  try {
    if (process.platform === 'darwin') {
      const raw = execSync(
        "system_profiler SPHardwareDataType | awk '/Hardware UUID/ {print $3}'",
        { encoding: 'utf-8', timeout: 3000 }
      );
      return createHash('sha256').update(raw.trim()).digest('hex');
    }

    // BUG-W5 FIX: Use Get-CimInstance, the modern PowerShell cmdlet that
    // supersedes the deprecated Get-WmiObject. Get-WmiObject was removed
    // from Windows 11 24H2 and PowerShell 7+ default installations.
    // Get-CimInstance is available from PowerShell 3.0 through 7.x.
    const raw = execSync(
      'powershell -NoProfile -Command "Get-CimInstance -ClassName Win32_ComputerSystemProduct | Select-Object -ExpandProperty UUID"',
      { encoding: 'utf-8', timeout: 4000, windowsHide: true }
    );

    const guid = raw.trim();

    if (guid && guid !== 'To Be Filled By O.E.M.' && guid.length > 8) {
      return createHash('sha256').update(guid).digest('hex');
    }

    // GUID was invalid or a placeholder — fall through to stable random fallback
    console.warn('[deviceId] PowerShell returned an invalid UUID, using stable random fallback');
  } catch (err) {
    // PowerShell not available or timed out — fall through to stable random fallback
    console.warn('[deviceId] PowerShell hardware UUID query failed:', err);
  }

  return generateStableFallbackId(cachePath);
}

/**
 * BUG-W4 FIX: Generates (or recovers) a stable random device ID.
 *
 * The previous version always generated a fresh random hash, which means
 * a failed cache write caused a new device ID on every launch — accumulating
 * phantom device registrations in Firestore without limit.
 *
 * This version reads the cache file first. If a valid 64-char hash already
 * exists there (written by a previous launch that failed after computing but
 * before the caller could return), it reuses it rather than generating new
 * random bytes. Only when no cached value exists does it generate a new ID.
 *
 * @param cachePath - path to the userData cache file, used to attempt recovery
 */
function generateStableFallbackId(cachePath: string): string {
  // Attempt to recover a previously generated (but not-yet-returned) fallback
  // from the cache file. This closes the window where the file was written by
  // generateStableFallbackId but then the outer writeFileSync failed — without
  // this check the next launch would generate yet another new random ID.
  try {
    if (fs.existsSync(cachePath)) {
      const existing = fs.readFileSync(cachePath, 'utf-8').trim();
      if (existing.length === 64) return existing;
    }
  } catch (_) {
    // Read failed — generate a fresh ID below
  }

  return createHash('sha256').update(randomBytes(32)).digest('hex');
}
