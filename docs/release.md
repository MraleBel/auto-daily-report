# Release Guide

## Trigger

Create and push a semantic version tag:

```powershell
git tag v1.0.9
git push origin v1.0.9
```

The release workflow only runs for tags matching `vX.Y.Z`.

## Build Matrix

The GitHub Actions workflow builds release artifacts on separate runners:

- `windows-latest` for one Windows x64 NSIS installer
- `macos-14` for one Apple Silicon macOS DMG using `aarch64-apple-darwin`

Artifacts are attached to a published GitHub Release through `tauri-apps/tauri-action`.
Release downloads should be taken from the published GitHub Release page rather than the GitHub Actions run page.

## macOS Distribution

macOS release builds are distributed as Apple Silicon DMGs without requiring a paid Apple Developer account. The Tauri config uses ad-hoc signing (`signingIdentity: "-"`) so the app bundle has a complete local code signature before it is packaged into the DMG.

Because these builds are not notarized by Apple, macOS may still block the first launch after downloading from a browser. The expected user path is:

1. Open the DMG and drag `Auto Daily Report.app` to `Applications`.
2. Try to open the app once.
3. If macOS blocks it, open System Settings > Privacy & Security and choose Open Anyway for Auto Daily Report.
4. Alternatively, right-click `Auto Daily Report.app` and choose Open.

This project currently distributes standard installation packages only. It does not publish Tauri updater artifacts.

## Early App Distribution

Windows builds can be shipped without Windows code signing during early distribution, though SmartScreen may warn users. macOS builds can also be shared without Apple notarization for demos and internal review, but users may need to explicitly allow the app in System Settings on first launch.

## Windows Installer Directory

The Windows installer should allow users to choose the installation directory. Keep that behavior in the Tauri Windows bundler configuration when `src-tauri` is added, for example through the NSIS installer setting that enables installation directory selection.

## In-App Update Flow

The app currently points users to standard GitHub Release downloads instead of performing in-app update installation.

## Release Checklist

1. Confirm the app version matches the tag version.
2. Confirm updater public key and endpoints are configured in `src-tauri`.
3. Push a `vX.Y.Z` tag.
4. Inspect the published GitHub Release assets and confirm there is exactly one Windows installer and one Apple Silicon DMG.
5. Smoke test Windows and confirm the Apple Silicon DMG installs and can be launched after the standard macOS Open Anyway flow if Gatekeeper blocks first launch.
