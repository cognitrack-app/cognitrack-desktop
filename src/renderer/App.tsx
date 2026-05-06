import React, { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@cognitrack/api-client';
import { TrayPopover } from './TrayPopover';
import { SignInPopover } from './SignInPopover';
import type { MobileData } from '../electron/preload/index';

interface TrayStats {
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

const EMPTY_STATS: TrayStats = {
  isTracking:          false,
  cognitiveLoadPct:    0,
  totalSwitches:       0,
  wmCapacityRemaining: 100,
  syncStatus: { pending: 0, syncing: 0, synced: 0, failed: 0, total: 0 },
};

/**
 * Root component for the CogniTrack tray popover.
 *
 * - Polls tray:getStats every 30 s as a fallback
 * - Listens for real-time tray:statsUpdate pushed after each batch
 * - On mount (after auth), fetches mobile data from Firestore once
 * - Renders the single TrayPopover screen
 */
export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authChecked, setAuthChecked]         = useState(false);
  const [stats, setStats]                     = useState<TrayStats>(EMPTY_STATS);
  const [loaded, setLoaded]                   = useState(false);
  const [mobileData, setMobileData]           = useState<MobileData | null>(null);  // HIGH-9
  const [mobileSyncing, setMobileSyncing]     = useState(false);                   // HIGH-9

  // Fetch stats from main process
  const fetchStats = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const data = await window.electronAPI.getStats();
      setStats(data);
      setLoaded(true);
    } catch (err) {
      console.error('[popover] Failed to fetch stats:', err);
    }
  }, [isAuthenticated]);

  // HIGH-9: Fetch mobile (phone) data from Firestore
  const fetchMobileData = useCallback(async () => {
    setMobileSyncing(true);
    try {
      const data = await window.electronAPI.syncMobileData();
      setMobileData(data);
    } catch (err) {
      console.error('[popover] Failed to fetch mobile data:', err);
    } finally {
      setMobileSyncing(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(!!user);
      setAuthChecked(true);
      if (user) {
        // Resolve wait in main process if not already resolved
        window.electronAPI.signIn(user.uid);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial fetch
    fetchStats();

    // HIGH-9: Fetch mobile data once on sign-in (non-blocking)
    fetchMobileData();

    // Poll every 30 seconds as a heartbeat
    const interval = setInterval(fetchStats, 30_000);

    // Real-time push from main process after each batch
    const cleanup = window.electronAPI.onStatsUpdate((data) => {
      setStats(data);
      setLoaded(true);
    });

    return () => {
      clearInterval(interval);
      cleanup();
    };
  }, [fetchStats, fetchMobileData, isAuthenticated]);

  // Pause / resume handlers
  const handlePause = useCallback(async () => {
    const result = await window.electronAPI.pauseTracking();
    setStats(prev => ({ ...prev, isTracking: result.isTracking }));
  }, []);

  const handleResume = useCallback(async () => {
    const result = await window.electronAPI.resumeTracking();
    setStats(prev => ({ ...prev, isTracking: result.isTracking }));
  }, []);

  if (!authChecked) {
    return (
      <div className="popover">
        <div className="popover__loading">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SignInPopover />;
  }

  return (
    <TrayPopover
      stats={stats}
      loaded={loaded}
      onPause={handlePause}
      onResume={handleResume}
      mobileData={mobileData}
      mobileSyncing={mobileSyncing}
      onSyncMobile={fetchMobileData}
    />
  );
}
