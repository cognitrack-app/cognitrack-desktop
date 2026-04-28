# CogniTrack Desktop

A silent Windows (and macOS) tray agent that tracks active application usage, computes cognitive load metrics via the shared cognitive engine, and syncs computed scalars to Firestore every hour. No raw usage data ever leaves the device.

The desktop app has no full window — it lives entirely in the system tray. All dashboard UI is on the CogniTrack Android app.

---

## How it connects to Android

Both apps sign in with the same email and password. That shared Firebase Auth UID is the only link between them. Once both have reported data for a day, the `mergeAgentData` Cloud Function combines phone and desktop metrics automatically within seconds.

> **Install order:** Android first (creates the account), then Windows (sign in with the same credentials). If you install Windows first, the tray popover only has a sign-in form — see the [Known Limitation](#known-limitation) note.

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | **20 LTS or later** | Electron 30 requires Node ≥ 18; 20 LTS recommended |
| pnpm | **9.x** | The monorepo uses `pnpm` workspaces (`workspace:*` deps) |
| Git | any | — |
| Windows | 10 / 11 — x64 **or** ARM64 | ARM64 runs natively on Snapdragon X devices, no emulation needed |

Install pnpm if you do not have it:

```bash
npm install -g pnpm@9
```

---

## 1 — Clone the monorepo

The desktop app lives inside the CogniTrack monorepo. Clone the top-level repo, not just the desktop subfolder — the app depends on `@cognitrack/shared`, `@cognitrack/sync-engine`, and `@cognitrack/api-client` from `packages/`.

```bash
git clone https://github.com/your-org/CogniTrack.git
cd CogniTrack
```

---

## 2 — Install dependencies

Run once from the monorepo root. pnpm installs all workspace packages in one pass.

```bash
pnpm install
```

---

## 3 — Firebase configuration

Create a `.env` file inside `apps/cognitrack-desktop/` (never commit this file — it is already in `.gitignore`):

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

Copy these values from **Firebase Console → Project Settings → Your apps → Web app config**.

---

## 4 — Development (run without building)

```bash
cd apps/cognitrack-desktop
pnpm dev
```

This runs three processes concurrently:

- Vite dev server (renderer)
- TypeScript compiler in watch mode
- Electron main process

The app launches silently in the system tray. Click the tray icon to open the popover.

---

## 5 — Production build

### Build the JS bundles

```bash
cd apps/cognitrack-desktop
pnpm build
```

### Package into an installer

| Target | Command | Output |
|---|---|---|
| Windows x64 | `pnpm dist` | `dist/CogniTrack-Setup-1.0.0-x64.exe` + portable |
| Windows ARM64 | `pnpm dist:arm64` | `dist/CogniTrack-Setup-1.0.0-arm64.exe` + portable |
| Both architectures | `pnpm dist:all` | Both files above |

The build pipeline automatically:

1. Rebuilds native modules (`better-sqlite3`, `active-win`) against Electron's Node version via `scripts/rebuild-natives.js`
2. Unpacks `.node` and `.exe` native binaries outside the asar archive so the OS can execute them
3. Produces both an **NSIS installer** and a **standalone portable `.exe`** for each architecture

> **macOS:** use `pnpm pack` for an unsigned local build, or set `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` in your environment before running `pnpm dist` for a notarized DMG.

---

## 6 — Install on a Windows machine

1. Run `CogniTrack-Setup-1.0.0-x64.exe` (or `-arm64.exe` on Snapdragon devices)
2. The NSIS installer **does not require administrator rights** — it installs per-user by default
3. Leave **"Run CogniTrack"** checked on the final page
4. The app starts silently and places a `CT` icon in the system tray (bottom-right taskbar area)
5. Auto-start on login is registered automatically — no manual startup entry needed

> **Portable build:** run `CogniTrack-1.0.0-x64.exe` directly with no installation. Auto-launch on login is not configured in portable mode.

---

## 7 — First launch & sign-in

1. Click the tray icon — a small popover (260 × 280 px) appears above the taskbar
2. Enter the **same email and password** used on the Android app
3. Click **Sign In**
4. Tracking begins immediately — the popover dismisses on click-away
5. This device registers itself in Firestore under `/users/{uid}/devices/{deviceId}`
6. The first hourly batch runs on startup; subsequent batches run every hour thereafter

Right-click the tray icon for **Pause / Resume tracking** and **Quit**.

---

## 8 — Available scripts

| Script | What it does |
|---|---|
| `pnpm dev` | Dev mode — Vite + TSC watch + Electron |
| `pnpm build` | Compile TypeScript + bundle renderer with Vite |
| `pnpm pack` | Package into an unpacked directory (no installer, fast iteration) |
| `pnpm dist` | Full NSIS installer + portable for Windows x64 |
| `pnpm dist:arm64` | Full NSIS installer + portable for Windows ARM64 |
| `pnpm dist:all` | Both architectures in one pass |
| `pnpm rebuild-natives` | Manually rebuild `better-sqlite3` and `active-win` native modules |

---

## 9 — Architecture overview

```
Tray click
    └── BrowserWindow (260×280, frameless, always-on-top)
            └── React renderer  ← sign-in form or live stats popover
                    └── IPC bridge (contextIsolation: true, no nodeIntegration)

Electron main process
    ├── ActiveWindowTracker   polls foreground window every 60 s via active-win
    ├── SQLiteStore           app_events + daily_metrics  (7-day TTL, WAL mode)
    ├── BatchProcessor        calculateCognitiveDebt() → upsert metrics
    │                         fires every hour + on app quit (final partial-hour batch)
    └── SyncEngine            offline queue, exponential backoff (30s → 60s → 120s → 240s)
                              drains full queue on reconnect (no per-batch item cap)

Firestore
    └── /users/{uid}/sessions/{date}/desktopSessions/{deviceId}
              ↑
         mergeAgentData Cloud Function combines with phone data within seconds
```

---

## 10 — Troubleshooting

**Tray icon does not appear after install**
Restart Windows Explorer: `taskkill /f /im explorer.exe && start explorer.exe`. The notification area sometimes needs a refresh after a first install.

**Popover shows "Tracking Paused" immediately**
On Windows, `active-win` uses the WinRT API and requires no elevated permissions. If tracking is paused, verify that the `.exe` helper was correctly unpacked from the asar archive — check that `node_modules/active-win/*.exe` exists in the installed app directory.

**Sign-in hangs and never completes**
The renderer has a 5-minute timeout. If it expires the app logs an error and exits. Verify the `.env` Firebase credentials are correct and that email/password sign-in is enabled in the Firebase Console.

**`better-sqlite3` or `active-win` crash on startup**
Run `pnpm rebuild-natives` from inside `apps/cognitrack-desktop`, then re-run `pnpm dist`.

---

## Known limitation

The tray renderer has a **sign-in form only** — there is no sign-up form on desktop. Account creation must happen on the Android app first. Installing Windows before Android will cause the sign-in popover to appear with no way to register a new account.

---

## License

MIT
