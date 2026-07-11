# Web deployment and desktop packaging, 2026-07-11

## Sources

- GitHub Docs, “Using custom workflows with GitHub Pages”: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- electron-builder, “GitHub Actions CI/CD”: https://www.electron.build/docs/features/github-actions/
- Electron, “Advanced Installation Instructions”: https://www.electronjs.org/docs/latest/tutorial/installation
- Electron, “Updating Applications”: https://www.electronjs.org/docs/latest/tutorial/updates
- Electron, “Security”: https://www.electronjs.org/docs/latest/tutorial/security
- electron-builder, “Auto Update”: https://www.electron.build/docs/features/auto-update/
- electron-builder, “Publishing Artifacts”: https://www.electron.build/docs/publish/

## Findings

GitHub's current custom Pages workflow uses `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`. The deployment job requires `pages: write` and `id-token: write`, a dependency on the build job, and the `github-pages` environment.

electron-builder recommends installing with `npm ci` and building on a matrix of native GitHub-hosted runners for Linux, macOS, and Windows. Unsigned artifacts can be assembled with `--publish never` and uploaded as workflow artifacts without release credentials.

Electron publishes desktop binaries for `linux`, `win32`, `darwin`, and `mas`. Android is not an Electron target, so an APK requires a separate Android wrapper and signing toolchain.

Electron documents `electron-updater` as the built-in release-update route for applications packaged with electron-builder. electron-builder generates platform update metadata alongside supported targets: NSIS on Windows, DMG plus ZIP metadata on macOS, and AppImage on Linux. The updater should read the packaged `app-update.yml`; calling `setFeedURL` manually is unnecessary. macOS update verification requires signed code.

Electron's security guidance keeps privileged APIs out of renderer content. Update operations therefore belong in the main process behind context-isolated preload functions, with navigation constrained to the app's local origin and release notes rendered as text rather than injected markup.

## Implementation Translation

- `.github/workflows/build-deploy.yml` verifies and builds the Vite app, uploads `dist` as the Pages artifact, and deploys it from pushes to `main` or manual runs.
- The Vite build receives the repository subpath through `VITE_BASE_PATH`, keeping generated asset URLs valid at `callumalpass.github.io/edinburgh-gardens-zombie-fps/` while ordinary and Electron builds retain root-relative URLs.
- A native-runner matrix packages the existing Electron application into Linux AppImage, macOS DMG/ZIP, and Windows NSIS/ZIP artifacts. Signing and notarization are deliberately not claimed.
- `electron-updater` runs only in packaged builds. It automatically checks after launch and every four hours, but download and restart/install remain explicit player choices. Progress and errors are broadcast as serializable state through the context-isolated preload bridge.
- Tagged builds validate that `vX.Y.Z` matches `package.json`, stage all native artifacts and `latest*.yml`/blockmap metadata in a draft GitHub Release, and publish the release only after the complete platform matrix succeeds. This prevents clients from discovering a half-built release.
- Renderer navigation is locked to the app's loopback-served origin, and update IPC requests independently verify that origin before invoking privileged updater operations.
- No APK job is added because it would not be an Electron build and would introduce an unconfigured Android SDK, wrapper, application identifier, signing key, and store/release policy.

## Uncertainty

GitHub action major versions and hosted runner images can change. The selected versions match the official documentation reviewed on 2026-07-11. macOS and Windows packages are unsigned until project-specific signing identities are configured, so operating systems may display trust warnings.

The unsigned macOS artifact cannot provide a production-grade self-update path until Apple signing and notarization are configured. AppImage self-update only applies when the app is actually launched from an AppImage; unpacked `dir` builds are development artifacts. A true end-to-end install test also requires publishing a higher semantic version to GitHub, so local validation covers controller behavior, generated metadata and packaged contents without mutating public releases.

## Validation

- `VITE_BASE_PATH=/edinburgh-gardens-zombie-fps/ npm run build`
- `npm run build`
- `npm run test:run -- tests/electronUpdater.test.ts`
- `npm run test:e2e -- tests/electronUpdater.spec.ts`
- `npm run package:desktop:nobuild -- --linux AppImage --publish never`
- Inspect `release/desktop/latest-linux.yml`, the AppImage and packaged `resources/app-update.yml`.
- `npm run research:check`
