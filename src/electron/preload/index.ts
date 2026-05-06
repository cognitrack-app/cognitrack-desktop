import { contextBridge, ipcRenderer } from 'electron';

/**
 * Preload bridge — exposes ONLY tray-popover channels to the renderer.
 *
 * The desktop agent has no dashboard. The renderer is a tiny 260×280 popover
 * showing 3 metrics + pause/resume + mobile sync. All heavy UI lives in the mobile app.
 */

export interface TrayStats {
  isTracking:          boolean;
  cognitiveLoadPct:    number;
  totalSwitches:       number;
  wmCapacityRemaining: number;
  syncStatus: {
    pending: number;
    syncing: number;
    synced:  number;
    failed:  number;
    total:   number;
  };
}

/**
 * Shape of the phoneMetrics field from Firestore.
 * Mirrors PhoneSyncPayload from @cognitrack/shared — typed loosely here so
 * the preload doesn't need a direct dependency on the shared package at
 * runtime (it runs in a sandboxed context with contextIsolation: true).
 */
export interface MobileData {
  cognitiveLoadPct?:    number;
  totalScreenTimeMin?:  number;
  appSwitches?:         number;
  wmCapacityRemaining?: number;
  lastUpdated?:         string;
  // Allow any additional fields the Android app may add in future versions
  [key: string]: unknown;
}

export interface ElectronAPI {
  getStats:        () => Promise<TrayStats>;
  pauseTracking:   () => Promise<{ isTracking: boolean }>;
  resumeTracking:  () => Promise<{ isTracking: boolean }>;
  onStatsUpdate:   (cb: (stats: TrayStats) => void) => () => void;
  signIn:          (uid: string) => void;
  /** HIGH-9: Pull today's (or a given date's) phone metrics from Firestore. */
  syncMobileData:  (date?: string) => Promise<MobileData | null>;
}

contextBridge.exposeInMainWorld('electronAPI', {
  getStats:       () => ipcRenderer.invoke('tray:getStats'),
  pauseTracking:  () => ipcRenderer.invoke('tracker:pause'),
  resumeTracking: () => ipcRenderer.invoke('tracker:resume'),

  // Real-time stats pushed from main after each batch
  onStatsUpdate: (cb: (stats: TrayStats) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TrayStats) => cb(data);
    ipcRenderer.on('tray:statsUpdate', handler);
    // Return cleanup function
    return () => ipcRenderer.removeListener('tray:statsUpdate', handler);
  },

  // Auth: renderer can signal sign-in complete
  signIn: (uid: string) => ipcRenderer.send('auth:signedIn', uid),

  // HIGH-9: Fetch phone metrics from Firestore for a given date (default: today)
  syncMobileData: (date?: string) => ipcRenderer.invoke('sync:pullMobileData', date),
} satisfies ElectronAPI);