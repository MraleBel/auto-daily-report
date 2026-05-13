# Auto Daily Report Product Status

## Product Goal

Auto Daily Report is a Windows/macOS desktop app that generates plain-text daily reports from Git activity. Users add one or more remote Git repositories, choose branch, author, and time range, then generate one report per repository or merge generated reports in the repository list order.

## Current Requirements

- Users can add remote repositories by Git URL.
- The app manages repository clones under the Tauri app data directory.
- Git access reuses the user's system Git credentials, SSH keys, Windows Credential Manager, and macOS Keychain.
- Each repository can have an optional project name. Reports use the project name when present, otherwise repository name plus branch.
- Users can refresh repositories, list branches, list authors, and choose the report branch.
- Default author is read from global `git config user.name` and `git config user.email`, but users can manually select or type another author.
- Default report range is today 00:00 to now; users can edit start and end time.
- Message mode is the default report generation mode.
- AI Diff mode uses OpenAI-compatible chat completions with configured `baseUrl`, `apiKey`, and `model`.
- AI Diff mode sends commit message and truncated diff content to the selected model service.
- Model configs can be added, edited, deleted, and the API key can be shown or hidden in the UI.
- Optional duration formatting can be enabled per generation.
- Duration formatting supports total hours and strategy selection: equal, commit weighted, or AI estimate.
- Users can generate a single repository report or batch-generate all repositories.
- Users can copy each report as plain text.
- Users can summarize generated reports into a single plain-text output ordered by repository list order.
- Generated reports are saved locally as history.
- The app has an update panel and uses Tauri updater APIs for in-app update checks, install, and relaunch.
- Windows installer supports user-selectable installation scope/directory through NSIS configuration.
- GitHub Actions release workflow builds Windows x64, macOS Intel, and macOS Apple Silicon artifacts from `vX.Y.Z` tags.
- Releases are unsigned by default. SmartScreen/Gatekeeper warnings are expected for early distribution.
- Tauri updater signing uses the generated project key pair, not paid Windows or Apple signing certificates.

## Implemented

- Tauri v2 project scaffold with Rust backend and React/TypeScript frontend.
- Rust backend commands:
  - `get_snapshot`
  - `add_repository`
  - `update_repository`
  - `remove_repository`
  - `refresh_repository`
  - `list_branches`
  - `list_authors`
  - `default_author`
  - `generate_report`
  - `save_model_config`
  - `delete_model_config`
  - `update_settings`
  - `delete_report`
  - `check_update_status`
- JSON persistence for repositories, model configs, settings, and report history.
- Managed clone storage under the app data directory.
- Git commands run through system `git`.
- Windows Git subprocesses use `CREATE_NO_WINDOW` to avoid terminal flashing during UI operations.
- Message-based report generation:
  - Commit filtering by branch, author, and time window.
  - Category grouping for common English and Chinese prefixes, including `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `开发`, `修复`, `优化`, `测试`, and `文档`.
  - Plain text report rendering.
- AI report generation:
  - OpenAI-compatible `/chat/completions` request.
  - `Authorization: Bearer <apiKey>` auth.
  - Diff truncation before sending to model.
  - Message-mode fallback if AI call fails.
- Frontend UI:
  - Sidebar repository list.
  - Add repository form.
  - Branch/author/time controls.
  - Message versus AI mode switch.
  - Model selection.
  - Duration formatting controls.
  - Per-repository report cards.
  - Batch generation.
  - One-click summary and copy.
  - Local history view.
  - Model management and settings view.
  - Update check/install UI surface.
- Release/update setup:
  - `src-tauri/tauri.conf.json` includes updater public key.
  - Local private updater key is generated at `.tauri/auto-daily-report.key` and ignored by Git.
  - GitHub Actions release workflow exists at `.github/workflows/release.yml`.
  - Release docs exist at `docs/release.md`.
- Local Windows build verified:
  - `cargo check -q` passes.
  - Windows NSIS and MSI installers were generated locally.

## Local Build Artifacts

The latest local Windows build outputs are:

- `src-tauri/target/release/bundle/nsis/Auto Daily Report_0.1.0_x64-setup.exe`
- `src-tauri/target/release/bundle/msi/Auto Daily Report_0.1.0_x64_en-US.msi`

These artifacts are intentionally ignored by Git through `src-tauri/target/`.

## Configuration Notes

- The updater endpoint in `src-tauri/tauri.conf.json` points to `https://github.com/MraleBel/auto-daily-report/releases/latest/download/latest.json`.
- The updater public key is committed in `src-tauri/tauri.conf.json`.
- The private updater key is not committed. To enable update artifact signing in GitHub Actions, store the content of `.tauri/auto-daily-report.key` in the `TAURI_SIGNING_PRIVATE_KEY` GitHub secret.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` can remain empty because the current local key was generated without a password.
- For Xiaomi MiMo Token Plan or similar providers, create a model config with the provider's OpenAI-compatible base URL, API key, and model name. The app appends `/chat/completions` automatically.

## Known Gaps

- No paid Windows code signing certificate is configured.
- No Apple Developer signing or notarization is configured.
- First GitHub Release has not been published yet, so in-app update checks will not find an update until release artifacts exist.
- Local API keys are stored in the app's JSON store for MVP simplicity. There is no system keychain integration yet.
- Report history uses JSON persistence, not SQLite.
- AI authentication currently uses Bearer auth only. Some providers may need an alternate `api-key` header.
- Duration strategy `commitWeighted` currently behaves like equal distribution in the simplified allocator and should be improved.
- AI estimate duration mode collects diffs, but final time allocation quality depends on the model response.
- Repository reorder UI is not implemented yet, though repository `sortOrder` exists.
- Release workflow has not yet been run on GitHub.
- macOS installers have not been locally verified.

## Recommended Next Development Slices

1. Replace updater endpoint with the real GitHub release URL and run a tagged release.
2. Add auth mode to model config: `bearer` versus `api-key`.
3. Move API key storage to OS credential storage.
4. Improve duration allocation so commit-weighted totals exactly match requested work hours.
5. Add repository reorder UI.
6. Add provider presets for Xiaomi MiMo Token Plan, OpenAI, DeepSeek, and custom OpenAI-compatible services.
7. Add integration tests using a temporary Git repository fixture.
8. Verify macOS Intel and Apple Silicon release artifacts from GitHub Actions.

## Developer Commands

```powershell
npm install
npm run build
```

Windows local Tauri checks/builds require Rust and Visual Studio C++ Build Tools:

```powershell
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"
cmd /d /s /c '"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" && cargo check -q'
cmd /d /s /c '"C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" && npm run tauri:build'
```
