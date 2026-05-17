# Auto Daily Report

Auto Daily Report is a Tauri desktop app for generating plain-text daily reports from Git repositories. Users add remote Git URLs, the app manages local clones in its app data directory, and reports can be generated per repository or summarized in repository order.

## Product Scope

- Add multiple remote repositories by Git URL.
- Reuse the system Git credential flow, including SSH keys, Windows Credential Manager, and macOS Keychain.
- Select branch, author, and time range before generation.
- Generate with commit messages by default, or use an OpenAI-compatible model to analyze diffs.
- Configure model name, base URL, and API key locally with show/edit/delete controls.
- Optionally allocate a configured work duration across generated report items.
- Download standard installers from GitHub Releases.

## Release Builds

Releases are cut from semantic version tags in the form `vX.Y.Z`, for example `v0.1.0`. Pushing one of those tags starts `.github/workflows/release.yml`, which publishes:

- one Windows x64 NSIS installer on `windows-latest`
- one macOS Apple Silicon DMG on `macos-14`

The workflow publishes a standard GitHub Release directly. End-user downloads should come from the Release page instead of the Actions page.

## Installer And Updates

Windows installer configuration should keep user-selectable install directory support enabled in the Tauri bundler configuration. The app currently distributes standard installation packages through GitHub Releases instead of in-app updater metadata.

The updater endpoint is configured for this repository's latest GitHub Release.

The updater public key is already configured. The matching private key was generated locally at `.tauri/auto-daily-report.key` and is ignored by Git. Put that private key value into GitHub Secrets before release builds:

- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

Windows builds may still show SmartScreen warnings if you do not add Windows code-signing later. macOS builds are expected to be signed with a Developer ID Application certificate and notarized through the release workflow secrets. See [docs/release.md](docs/release.md) for release and signing notes.
