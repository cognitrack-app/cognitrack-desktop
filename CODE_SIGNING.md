# CogniTrack Desktop — Windows Code Signing Guide

## Overview

This document describes the code signing requirements for the Windows build of CogniTrack Desktop, with special attention to the `active-win` WinRT helper executable that must be signed to avoid SmartScreen warnings.

---

## Why Code Signing Matters

### SmartScreen Protection
Windows Defender SmartScreen blocks unsigned executables by default, showing:
> **"Windows protected your PC"** — "The app is not recognized. Running it might put your PC at risk."

This applies to:
1. **The NSIS installer** (`CogniTrack-Setup-*.exe`)
2. **The portable executable** (`CogniTrack-*.exe`)
3. **The `active-win` WinRT helper** (unpacked from ASAR at runtime)

### The `active-win` WinRT Helper
`active-win` v8+ on Windows uses a native WinRT bridge helper (`active-win.exe`) to query the foreground window. This helper is:
- Bundled inside `node_modules/active-win/`
- Unpacked from the ASAR at runtime (via `asarUnpack: '**/*.exe'` in `electron-builder.yml`)
- Executed as a child process by `active-win` on every poll

**If unsigned, SmartScreen will block it silently** — the poll fails, no events are recorded, and tracking stops working without any visible error to the user.

---

## Required Certificates

| Certificate Type | Purpose | Cost (approx.) |
|------------------|---------|----------------|
| **EV Code Signing Certificate** | Required for immediate SmartScreen reputation. Eliminates "Windows protected your PC" dialog. | $300–$600/year |
| **Standard Code Signing Certificate** | Works but builds reputation over time (~weeks of downloads). Users may see SmartScreen warning initially. | $100–$200/year |

**Recommendation:** Use an **EV certificate** for production releases. Standard cert is acceptable for internal/beta testing.

---

## Signing Process

### 1. Prerequisites
- EV Code Signing Certificate (`.pfx` file) with private key
- Certificate password
- Hardware token (YubiKey, etc.) or Azure Key Vault / AWS Signer for CI

### 2. Local Signing (Development)

```bash
# Set certificate path and password
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your_password

# Build with signing
cd cognitrack-desktop
pnpm run dist  # electron-builder will sign automatically
```

### 3. CI/CD Signing (GitHub Actions)

Add these secrets to your GitHub repository:
- `CSC_LINK` — Base64-encoded `.pfx` file: `base64 -i certificate.pfx | pbcopy`
- `CSC_KEY_PASSWORD` — Certificate password
- `GH_TOKEN` — GitHub token for publishing releases (auto-provided)

```yaml
# In .github/workflows/windows-ci.yml (release job)
- name: Build and sign Windows installers
  env:
    CSC_LINK: ${{ secrets.CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
  run: |
    cd cognitrack-desktop
    pnpm run dist:all
```

### 4. electron-builder Configuration

The `electron-builder.yml` already includes the correct settings:

```yaml
win:
  requestedExecutionLevel: asInvoker  # No UAC elevation needed
  # Signing is automatic when CSC_LINK is set

nsis:
  perMachine: false  # Per-user install (no admin required)
```

### 5. Timestamp Server

Always use a timestamp server so signatures remain valid after certificate expiry:

```yaml
# In electron-builder.yml (or via env)
# electron-builder uses RFC3161 timestamp by default
# Can be customized:
# win:
#   certificateFile: ${{ env.CSC_LINK }}
#   certificatePassword: ${{ env.CSC_KEY_PASSWORD }}
#   timestamp: 'http://timestamp.digicert.com'
```

---

## Verifying Signatures

### Check Installer Signature
```powershell
# PowerShell
Get-AuthenticodeSignature "CogniTrack-Setup-1.0.0-x64.exe" | Format-List
```

Expected output:
```
SignerCertificate : [Subject]
  CN="CogniTrack", O="CogniTrack", L="City", S="State", C="US"
Status            : Valid
StatusMessage     : Signature verified.
```

### Check Unpacked WinRT Helper
After installing, verify the helper is signed:

```powershell
$helper = "$env:LOCALAPPDATA\CogniTrack\resources\app.asar.unpacked\node_modules\active-win\active-win.exe"
Get-AuthenticodeSignature $helper | Format-List
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "Windows protected your PC" on installer | Unsigned or standard cert with no reputation | Use EV cert; wait for reputation; or user clicks "More info → Run anyway" |
| "Windows protected your PC" on `active-win.exe` | WinRT helper not signed | Ensure `asarUnpack: '**/*.exe'` is set AND certificate signs all binaries |
| `electron-builder` fails with "signtool not found" | Windows SDK not installed | Install "Windows 10 SDK" in CI (`choco install windows-sdk-10.1`) |
| Timestamp server timeout | Network/firewall | Use `--timestamp` flag with reliable server (DigiCert, Sectigo) |
| Signature invalid after cert expiry | No timestamp | Always enable timestamping (default in electron-builder) |

---

## macOS Notarization (For Reference)

While this doc focuses on Windows, the same build pipeline handles macOS:

```yaml
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist
  entitlementsInherit: build/entitlements.mac.plist

afterSign: scripts/notarize.js  # Requires APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
```

---

## Checklist for Release

- [ ] EV Code Signing Certificate obtained and stored securely
- [ ] `CSC_LINK` and `CSC_KEY_PASSWORD` added to GitHub secrets
- [ ] `electron-builder.yml` has `asarUnpack: '**/*.exe'` for active-win helper
- [ ] CI workflow builds both `x64` and `arm64` artifacts
- [ ] Release job publishes signed installers to GitHub Releases
- [ ] Test install on clean Windows VM (no dev tools) — verify no SmartScreen dialog
- [ ] Verify `active-win.exe` is signed after install
- [ ] Verify auto-updater works with signed updates

---

## Resources

- [electron-builder Code Signing](https://www.electron.build/code-signing)
- [Microsoft EV Code Signing](https://learn.microsoft.com/en-us/windows/win32/seccrypto/extended-validation-ev-code-signing-certificates)
- [active-win Windows Implementation](https://github.com/sindresorhus/active-win#windows)
- [SmartScreen Reputation](https://learn.microsoft.com/en-us/windows/security/application-security/application-control/windows-defender-smartscreen)