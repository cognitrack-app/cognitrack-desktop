# CogniTrack — macOS Installation & User Guide

CogniTrack is a privacy-first cognitive load tracker. On macOS it runs silently as a **menu bar agent** — no Dock icon, no open window — and automatically tracks which apps you use and for how long. All data stays on your device and syncs to your account so you can view your focus metrics on your iPhone or Android phone.

---

## Requirements

| Requirement | Minimum Version |
|---|---|
| macOS | Ventura 13.0 or later |
| Node.js | 18 LTS or later |
| pnpm | 8.x (`npm install -g pnpm`) |
| CogniTrack account | Sign up at [cognitrack-dcede.firebaseapp.com](https://cognitrack-dcede.firebaseapp.com) |

---

## Installation

### Step 1 — Clone the repository

```bash
git clone https://github.com/cognitrack-app/cognitrack.git
cd cognitrack
```

### Step 2 — Install dependencies

```bash
pnpm install
```

### Step 3 — Create your `.env` file

Inside the `cognitrack-desktop/` folder, create a file called `.env`:

```bash
cd cognitrack-desktop
cp .env.example .env
```

If `.env.example` doesn't exist, create `.env` manually with the following content:

```env
FIREBASE_API_KEY=AIzaSyBwa9uCbsYvo_OZIdcmNHnnbw8AVlynbbE
FIREBASE_AUTH_DOMAIN=cognitrack-dcede.firebaseapp.com
FIREBASE_PROJECT_ID=cognitrack-dcede
FIREBASE_STORAGE_BUCKET=cognitrack-dcede.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=618151348931
FIREBASE_APP_ID=1:618151348931:web:c451f2c5cda94d82e8b076
FIREBASE_MEASUREMENT_ID=G-G6EFWQJJE9
```

> ⚠️ **Never commit `.env` to git.** It is already listed in `.gitignore`.

### Step 4 — Run in development mode

```bash
# From the cognitrack-desktop/ directory
pnpm dev
```

This starts the Vite renderer dev server on `localhost:5173` and launches Electron. You will see the CogniTrack icon appear in your **menu bar** (top-right of screen).

### Step 5 — Build a production app (optional)

```bash
pnpm build        # Compiles TypeScript + bundles renderer
pnpm package      # Creates a distributable .dmg in out/
```

Open the generated `.dmg`, drag CogniTrack to your Applications folder, and launch it.

---

## First Launch Setup

### Grant Accessibility Permission (Required)

CogniTrack uses macOS Accessibility APIs to detect which app is in the foreground. Without this, tracking cannot start.

1. On first launch, macOS will show a dialog: **"CogniTrack" wants access to control this computer.**
2. Click **Open System Settings**.
3. Go to **Privacy & Security → Accessibility**.
4. Toggle **CogniTrack** to **ON**.
5. You may be asked to enter your Mac password.
6. **Quit and relaunch CogniTrack** — tracking will start automatically after sign-in.

> If you missed the dialog, go to **System Settings → Privacy & Security → Accessibility** and add CogniTrack manually.

### Sign In

1. Click the **CogniTrack icon** in your menu bar.
2. A small popover appears with an email and password field.
3. Enter your CogniTrack account credentials and tap **Sign In**.
4. The popover will close and tracking begins immediately.

---

## Daily Usage

### Menu Bar Icon

| What you see | What it means |
|---|---|
| Icon visible in menu bar | CogniTrack is running |
| `● Tracking Active` in menu | Your app usage is being recorded |
| `○ Tracking Paused` in menu | Tracking is paused |

### Right-Click the Menu Bar Icon

- **Pause Tracking** — stops recording until you resume
- **Resume Tracking** — restarts recording
- **Quit CogniTrack** — cleanly flushes pending data then exits

### Left-Click the Menu Bar Icon

Toggles the mini popover which shows:
- Current cognitive load %
- Total context switches today
- Working memory capacity remaining
- Last sync status

### Viewing Your Full Dashboard

Your detailed metrics (7-day history, heatmaps, recovery scores) are visible on the **CogniTrack mobile app** (Android or iOS). The desktop agent syncs data to Firestore every hour automatically.

---

## Auto-Launch on Login

CogniTrack registers itself to start automatically when you log in to your Mac. You do not need to open it manually each day.

To disable auto-launch:
- **System Settings → General → Login Items** → remove CogniTrack

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Icon not in menu bar | Check **Applications** folder and launch manually |
| "Tracking Paused" stuck | Right-click icon → Resume Tracking |
| Sign-in fails | Check internet connection; verify credentials at Firebase Console |
| No data showing on mobile | Pull-to-refresh on the mobile app; ensure you are signed in with the same account |
| Accessibility denied | System Settings → Privacy & Security → Accessibility → enable CogniTrack → relaunch |
| App crashes on launch | Run `pnpm dev` in Terminal to see error logs |

---

## Data & Privacy

- All raw events are stored **locally** in SQLite at `~/Library/Application Support/CogniTrack/`
- Only aggregated daily metrics (not raw app names) are synced to Firestore
- No data is sold or shared with third parties
- Delete your data anytime: remove the `CogniTrack` folder from Application Support and delete your Firebase account
