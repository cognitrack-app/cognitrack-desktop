# CogniTrack — Windows Installation & User Guide

CogniTrack is a privacy-first cognitive load tracker. On Windows it runs as a **system tray agent** — no taskbar window, no Dock — and automatically tracks which apps you use and for how long. All data stays on your device and syncs to your account so you can view your focus metrics on your Android or iPhone.

---

## Requirements

| Requirement | Minimum Version |
|---|---|
| Windows | 10 (build 1903) or Windows 11 |
| Node.js | 18 LTS or later — [nodejs.org](https://nodejs.org) |
| pnpm | 8.x — run `npm install -g pnpm` after installing Node |
| PowerShell | 5.1+ (included with Windows 10/11) |
| CogniTrack account | Sign up at [cognitrack-dcede.firebaseapp.com](https://cognitrack-dcede.firebaseapp.com) |

> **Note:** CogniTrack does NOT require administrator privileges to run. It only reads app usage data that is already available to your user account.

---

## Installation

### Step 1 — Install Node.js and pnpm

1. Download Node.js LTS from [https://nodejs.org](https://nodejs.org) and run the installer.
2. Open **Command Prompt** or **PowerShell** and run:
   ```
   npm install -g pnpm
   ```
3. Verify both are installed:
   ```
   node --version
   pnpm --version
   ```

### Step 2 — Clone the repository

```powershell
git clone https://github.com/cognitrack-app/cognitrack.git
cd cognitrack
```

> If you don’t have Git installed, download it from [https://git-scm.com](https://git-scm.com).

### Step 3 — Install dependencies

```powershell
pnpm install
```

### Step 4 — Create your `.env` file

Navigate to the `cognitrack-desktop` folder and create a `.env` file:

```powershell
cd cognitrack-desktop
```

Create a new file named `.env` (no other extension) with this content:

```env
FIREBASE_API_KEY=AIzaSyBwa9uCbsYvo_OZIdcmNHnnbw8AVlynbbE
FIREBASE_AUTH_DOMAIN=cognitrack-dcede.firebaseapp.com
FIREBASE_PROJECT_ID=cognitrack-dcede
FIREBASE_STORAGE_BUCKET=cognitrack-dcede.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=618151348931
FIREBASE_APP_ID=1:618151348931:web:c451f2c5cda94d82e8b076
FIREBASE_MEASUREMENT_ID=G-G6EFWQJJE9
```

> ⚠️ **Tip — Creating `.env` in Windows Explorer:**
> Open Notepad, paste the content above, then choose **File → Save As**, set the filename to `.env` (with quotes around it in the dialog to prevent Windows adding `.txt`), and save it in the `cognitrack-desktop` folder.

### Step 5 — Run in development mode

```powershell
pnpm dev
```

The Electron app will launch and you will see the **CogniTrack icon in your system tray** (bottom-right taskbar area, near the clock). You may need to click the **^** arrow to reveal hidden tray icons.

### Step 6 — Build a production installer (optional)

```powershell
pnpm build       # Compile TypeScript + bundle renderer
pnpm package     # Creates a Windows installer in out/
```

Run the generated `.exe` installer. CogniTrack will install to `%LOCALAPPDATA%\CogniTrack` and add itself to startup automatically.

---

## First Launch Setup

### Sign In

1. Find the **CogniTrack icon** in the system tray (bottom-right near clock). If hidden, click the **^** expand arrow.
2. **Left-click** the icon to open the sign-in popover.
3. Enter your CogniTrack account email and password.
4. Click **Sign In**. Tracking begins immediately after authentication.

> If you don’t have an account, register at [cognitrack-dcede.firebaseapp.com](https://cognitrack-dcede.firebaseapp.com) first.

---

## Daily Usage

### System Tray Icon

| What you see | What it means |
|---|---|
| Icon in tray | CogniTrack is running |
| `● Tracking Active` in menu | App usage is being recorded |
| `○ Tracking Paused` in menu | Tracking is paused |

### Left-Click the Tray Icon

Opens the mini popover showing:
- Is tracking active?
- Cognitive load % for today
- Total context switches
- Working memory capacity remaining
- Sync status

### Right-Click the Tray Icon

- **Pause Tracking** — stops recording app usage until resumed
- **Resume Tracking** — restarts recording
- **Quit CogniTrack** — saves all pending data then exits cleanly

### Viewing Your Full Dashboard

Detailed analytics (7-day history, hourly heatmaps, recovery scores, switch velocity) are available on the **CogniTrack mobile app** (Android or iOS). The desktop agent syncs data every hour automatically.

---

## Auto-Launch on Windows Startup

CogniTrack registers itself to start automatically with Windows. You will see it in the tray after every login without doing anything.

To disable auto-launch:
1. Press `Ctrl + Shift + Esc` to open Task Manager
2. Go to the **Startup apps** tab
3. Find **CogniTrack** and click **Disable**

Or via Settings:
- **Settings → Apps → Startup** → toggle CogniTrack off

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Icon not in tray | Check the hidden icons area (click `^` in tray) or relaunch from Start Menu |
| Sign-in fails with network error | Check your internet connection. Try signing in at the Firebase Auth page directly |
| `pnpm install` fails | Ensure Node.js 18+ is installed: `node --version`. If behind a proxy, configure npm proxy settings |
| `pnpm dev` opens but no tray icon | Wait 5–10 seconds for Electron to boot; check PowerShell for errors |
| No data on mobile app | Pull-to-refresh on mobile; ensure you are signed in with the same account on both devices |
| Device ID resets every launch | This means `userData` folder is being deleted. Check antivirus software isn’t cleaning `%APPDATA%\CogniTrack` |
| PowerShell execution policy error | Run `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser` in PowerShell as your normal user |

---

## Data & Privacy

- Raw events are stored **locally** in SQLite at `%APPDATA%\CogniTrack\`
- Only aggregated daily metrics (not individual app names) are synced to Firestore
- No data is sold or shared with third parties
- Delete all local  remove the `CogniTrack` folder from `%APPDATA%`
- Delete cloud  go to Firebase Console and delete your user document
