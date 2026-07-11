# Web deployment and desktop packaging, 2026-07-11

## Sources

- GitHub Docs, “Using custom workflows with GitHub Pages”: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- electron-builder, “GitHub Actions CI/CD”: https://www.electron.build/docs/features/github-actions/
- Electron, “Advanced Installation Instructions”: https://www.electronjs.org/docs/latest/tutorial/installation

## Findings

GitHub's current custom Pages workflow uses `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, and `actions/deploy-pages@v4`. The deployment job requires `pages: write` and `id-token: write`, a dependency on the build job, and the `github-pages` environment.

electron-builder recommends installing with `npm ci` and building on a matrix of native GitHub-hosted runners for Linux, macOS, and Windows. Unsigned artifacts can be assembled with `--publish never` and uploaded as workflow artifacts without release credentials.

Electron publishes desktop binaries for `linux`, `win32`, `darwin`, and `mas`. Android is not an Electron target, so an APK requires a separate Android wrapper and signing toolchain.

## Implementation Translation

- `.github/workflows/build-deploy.yml` verifies and builds the Vite app, uploads `dist` as the Pages artifact, and deploys it from pushes to `main` or manual runs.
- The Vite build receives the repository subpath through `VITE_BASE_PATH`, keeping generated asset URLs valid at `callumalpass.github.io/edinburgh-gardens-zombie-fps/` while ordinary and Electron builds retain root-relative URLs.
- A native-runner matrix packages the existing Electron application into Linux AppImage, macOS DMG/ZIP, and Windows NSIS/ZIP artifacts. Signing and notarization are deliberately not claimed.
- No APK job is added because it would not be an Electron build and would introduce an unconfigured Android SDK, wrapper, application identifier, signing key, and store/release policy.

## Uncertainty

GitHub action major versions and hosted runner images can change. The selected versions match the official documentation reviewed on 2026-07-11. macOS and Windows packages are unsigned until project-specific signing identities are configured, so operating systems may display trust warnings.

## Validation

- `VITE_BASE_PATH=/edinburgh-gardens-zombie-fps/ npm run build`
- `npm run build`
- `npm run package:desktop:nobuild -- --linux AppImage --publish never`
- `npm run research:check`
