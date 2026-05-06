import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, shell } from 'electron';
import { registerIpcHandlers } from './electron/main/ipcHandlers';
import { SQLiteStore } from './electron/main/sqliteStore';
import { ActiveWindowTracker } from './electron/main/activeWindowTracker';
import { waitForAuth, getTodayDateString } from './electron/main/utils';
import { getDeviceId } from './electron/main/deviceId';
import { processBatch } from './electron/main/batchProcessor';
import { SyncEngine } from '@cognitrack/sync-engine';
import { registerDevice, onAuthChange } from '@cognitrack/api-client';
import { ensureAccessibilityPermission } from './electron/main/macPermissions';

// ── Module-level singletons (set once in whenReady) ─────────────────────────

let store:      SQLiteStore;
let syncEngine: SyncEngine;
let tracker:    ActiveWindowTracker;
let mainWindow: BrowserWindow | null = null;
let tray:       Tray | null = null;
let userId:     string;
let deviceId:   string;

// ── App lifecycle ───────────────────────────────────────────────────────

// FIX: Prevent multiple instances of the app from running simultaneously.
// Multiple instances will fight for the SQLite lock and corrupt the database.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.error('[startup] Another instance is already running. Exiting.');
  app.quit();
  // We must return here, but since this is top-level we just let app.quit
  // kill the process.
}

app.whenReady().then(async () => {
  // 1. Auto-launch on login (registry on Windows, LaunchAgents on macOS)
  app.setLoginItemSettings({
    openAtLogin:  true,
    // FIX: openAsHidden only works on macOS. On Windows, we must pass a custom
    // arg and handle it. The 'electron-builder' auto-launcher passes these args.
    args: ['--hidden'],
    name:         'CogniTrack',
  });

  // 1b. macOS: hide Dock icon — CogniTrack is a tray agent, not a windowed app.
  // app.dock is undefined on Windows so the optional chain is safe.
  if (process.platform === 'darwin') {
    app.dock?.hide();
  }

  // 2. SQLite — must be first, tracker writes events immediately
  store = new SQLiteStore();

  // 3. Sync queue db in the same userData directory
  const dbDir = path.join(app.getPath('userData'), 'db');
  fs.mkdirSync(dbDir, { recursive: true }); // FIX: Ensure dir exists before SyncEngine
  const queueDbPath = path.join(dbDir, 'sync-queue.db');
  syncEngine = new SyncEngine(queueDbPath);

  // 4. Active window tracker (no start yet — needs auth first)
  tracker = new ActiveWindowTracker(store);

  // 5. Tray popover window (hidden by default)
  mainWindow = createPopoverWindow();

  // 6. System tray
  tray = createTray();

  // 7. IPC handlers — now takes tracker + syncEngine + refreshTray callback
  registerIpcHandlers(
    store,
    tracker,
    syncEngine,
    () => tray?.setContextMenu(buildTrayMenu()),
    () => userId,   // HIGH-9: getter for sync:pullMobileData handler
  );

  // 8. Load the renderer so it can display the sign-in form if needed
  if (app.isPackaged) {
    mainWindow.loadFile(path.join(__dirname, '../dist-renderer/index.html'));
  } else {
    // Dev: Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  }

  // 9. Keep userId updated for the session
  onAuthChange(user => {
    if (user) {
      userId = user.uid;
    }
  });

  // Wait for Firebase auth before doing anything network-related
  try {
    userId = await waitForAuth();
  } catch (err) {
    // Not signed in yet — show the popover so user sees the status
    console.warn('[startup] Not authenticated, showing popover:', err);
    showPopover();
    
    let authSuccess = false;
    while (!authSuccess) {
      try {
        userId = await waitForAuthFromRenderer();
        authSuccess = true;
      } catch (authErr) {
        console.error('[startup] Auth from renderer failed:', authErr);
        if (mainWindow) {
          mainWindow.reload();
        }
      }
    }
  }

  // 10. Register/update this device in Firestore
  deviceId = getDeviceId();
  await registerDevice(userId, deviceId, process.platform as any, 'CogniTrack Desktop', app.getVersion())
    .catch(err => console.warn('[startup] Device registration failed (non-fatal):', err));

  // 11. Mark sync engine online and flush any queued items
  syncEngine.setOnline(true);

  // 12. Check macOS Accessibility permission (no-op on Windows).
  //     active-win requires this to read the frontmost application name.
  //     If denied, the popover shows isTracking: false until the user
  //     grants permission and relaunches.
  const hasPermission = await ensureAccessibilityPermission();
  if (hasPermission) {
    tracker.start();
  } else {
    console.warn('[startup] Accessibility permission not granted — tracker not started');
  }

  // 13. Hourly batch: compute cognitive metrics and sync to Firestore
  scheduleHourlyBatch();

  // 14. If launched with --hidden (from OS startup), ensure popover is closed
  if (process.argv.includes('--hidden')) {
    mainWindow?.hide();
  }

  console.log(`[startup] CogniTrack ready — userId=${userId} deviceId=${deviceId}`);
});

// Flush final batch and clean up before quitting.
// IMPORTANT: Electron does NOT await async before-quit handlers — the process
// exits immediately after the handler returns. We block the quit with
// e.preventDefault() and perform cleanup in an IIFE, then call app.exit(0).
// Do NOT call app.quit() here — it would re-emit before-quit recursively.
app.on('before-quit', (e) => {
  e.preventDefault(); // Block OS quit until cleanup finishes
  (async () => {
    console.log('[shutdown] Running final batch before quit...');
    if (store && syncEngine && userId && deviceId) {
      await processBatch(store, syncEngine, userId, deviceId, mainWindow, tracker).catch(console.error);
    }
    tracker?.stop();
    store?.close();
    app.exit(0); // Force-exit after cleanup — bypasses before-quit to avoid recursion
  })();
});

// Prevent full quit when all windows are closed (keep running in tray)
app.on('window-all-closed', (e: Event) => {
  // Do nothing to prevent app.quit() from being called implicitly
});

// ── Popover window factory ──────────────────────────────────────────────────

function createPopoverWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width:  260,
    height: 280,
    frame:          false,      // no OS chrome — custom titlebar via CSS
    resizable:      false,
    skipTaskbar:    true,       // don't appear in taskbar / dock
    alwaysOnTop:    true,       // floats above everything
    show:           false,      // hidden until tray click
    transparent:    true,       // enables rounded corners via CSS
    hasShadow:      true,
    webPreferences: {
      preload:          path.join(__dirname, 'electron/preload/index.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  // Hide when losing focus (click-away dismissal)
  win.on('blur', () => {
    win.hide();
  });

  // Never truly close — just hide to tray
  win.on('close', (e) => {
    e.preventDefault();
    win.hide();
  });

  // FIX: Allow Firebase signInWithPopup to open a popup window.
  // Electron v30+ denies all window.open() calls by default (no handler = deny).
  // Firebase Auth SDK uses window.open() to launch the Google OAuth consent page.
  // Without this handler, the popup is silently blocked and Google sign-in hangs.
  // We allow only Firebase/Google auth URLs; everything else goes to the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    const isAuthUrl =
      url.startsWith('https://accounts.google.com') ||
      url.includes('.firebaseapp.com/__/auth') ||
      url.startsWith('https://apis.google.com');

    if (isAuthUrl) {
      // Allow Electron to create a child BrowserWindow for the OAuth popup
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 620,
          resizable: false,
          alwaysOnTop: true,
        },
      };
    }

    // All other URLs (privacy policy, help links, etc.) open in system browser
    shell.openExternal(url).catch(console.error);
    return { action: 'deny' };
  });

  return win;
}

// ── Show popover anchored above tray icon ────────────────────────────────────

function showPopover(): void {
  if (!mainWindow || !tray) return;

  const trayBounds  = tray.getBounds();
  const winBounds   = mainWindow.getBounds();

  const x = Math.round(trayBounds.x + trayBounds.width / 2 - winBounds.width / 2);

  // macOS menu bar is at the TOP of the screen — popover goes BELOW the icon.
  // Windows taskbar is at the BOTTOM — popover goes ABOVE the icon.
  const y = process.platform === 'darwin'
    ? Math.round(trayBounds.y + trayBounds.height + 4)
    : Math.round(trayBounds.y - winBounds.height - 4);

  mainWindow.setPosition(x, y);
  mainWindow.show();
  mainWindow.focus();
}

// ── System tray ────────────────────────────────────────────────────────────

function createTray(): Tray {
  // macOS menu bar icons must be named *Template.png — Electron then
  // automatically inverts them for dark/light mode. Windows uses the
  // full-colour PNG (no template convention needed).
  const isMac = process.platform === 'darwin';
  const iconName = isMac ? 'tray-iconTemplate.png' : 'tray-icon.png';

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'assets', iconName)
    : path.join(__dirname, '../assets', iconName);

  const icon = nativeImage.createFromPath(iconPath);
  const t = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  t.setToolTip('CogniTrack — Cognitive Load Tracker');

  // Left-click: show/hide the popover
  t.on('click', () => {
    if (mainWindow?.isVisible()) {
      mainWindow.hide();
    } else {
      showPopover();
    }
  });

  // Right-click: context menu
  t.setContextMenu(buildTrayMenu());

  return t;
}

function buildTrayMenu(): Menu {
  const isTracking = tracker?.isRunning() ?? false;
  return Menu.buildFromTemplate([
    {
      label: isTracking ? '● Tracking Active' : '○ Tracking Paused',
      enabled: false, // informational only
    },
    { type: 'separator' },
    {
      label: isTracking ? 'Pause Tracking' : 'Resume Tracking',
      click: () => {
        if (tracker?.isRunning()) {
          tracker.stop();
        } else {
          tracker?.start();
        }
        tray?.setContextMenu(buildTrayMenu()); // refresh label
      },
    },
    { type: 'separator' },
    {
      label: 'Quit CogniTrack',
      click: () => {
        // Allow the before-quit handler to run the final batch
        mainWindow?.destroy();
        mainWindow = null;
        app.quit();
      },
    },
  ]);
}

// ── Hourly batch scheduler ───────────────────────────────────────────────────

function scheduleHourlyBatch(): void {
  const ONE_HOUR = 60 * 60 * 1000;

  // Run once immediately on startup so today's partial data is available fast
  processBatch(store, syncEngine, userId, deviceId, mainWindow, tracker).catch(console.error);

  // Then schedule every hour
  const jitter = Math.floor(Math.random() * 5 * 60 * 1000);
  setInterval(() => {
    processBatch(store, syncEngine, userId, deviceId, mainWindow, tracker).catch(console.error);

    // Refresh tray menu to update tracking state label
    tray?.setContextMenu(buildTrayMenu());
  }, ONE_HOUR + jitter);
}

// ── Helper: wait for sign-in signal from renderer ────────────────────────

/**
 * DESK-04 FIX: Returns a Promise that:
 *  - Resolves with the UID when the renderer emits 'auth:signedIn' with a
 *    valid Firebase UID (20–128 alphanumeric chars).
 *  - Rejects immediately with a descriptive error if the UID is malformed,
 *    so the startup path fails loudly instead of hanging forever.
 *  - Rejects after 5 minutes if the renderer never fires the event at all
 *    (e.g. sign-in page crashed, renderer never loaded).
 *
 * Previous bug: on invalid UID, code called resolve(waitForAuthFromRenderer())
 * which re-registered a new listener but never settled the outer Promise,
 * and there was no timeout — the app would hang silently forever.
 */
function waitForAuthFromRenderer(): Promise<string> {
  return new Promise((resolve, reject) => {
    // Safety timeout — if renderer never fires the event (e.g. sign-in page
    // crashed), reject after 5 minutes so startup can surface the error.
    const timeout = setTimeout(() => {
      ipcMain.removeListener('auth:signedIn', handler);
      reject(new Error('[auth] Sign-in timeout: renderer did not emit auth:signedIn within 5 minutes'));
    }, 5 * 60 * 1000);

    // FIX (CRIT-5): Use ipcMain.on instead of ipcMain.once so that renderer
    // reloads can re-signal. With ipcMain.once, if the renderer reloads during
    // the sign-in flow (e.g. after a failed attempt), the second auth:signedIn
    // IPC message is silently dropped and startup hangs forever.
    //
    // On an INVALID uid, log and keep listening — the renderer may reload and
    // send a valid UID on the next attempt. Only resolve/clean-up on success.
    function handler(_event: Electron.IpcMainEvent, uid: string): void {
      if (typeof uid !== 'string' || uid.trim().length < 20) {
        // Invalid UID — warn and keep the listener alive for the next attempt.
        console.warn(`[auth] Invalid UID received from renderer: "${uid}" — waiting for retry`);
        return;
      }
      clearTimeout(timeout);
      ipcMain.removeListener('auth:signedIn', handler);
      resolve(uid.trim());
    }

    ipcMain.on('auth:signedIn', handler);
  });
}
