# Runtime license audit

Audit date: 2026-10-25. Source: `pnpm-lock.yaml` (lockfile v9) and the package licenses installed from that lockfile. This is a report only. No dependency was added, removed, or upgraded.

## Result

Nothing in the runtime or bundled dependency trees is GPL-only, AGPL, or SSPL. Those licenses would block a proprietary commercial grant for the combined work. They are not present.

Two LGPL components ship with the product. LGPL does not forbid selling a proprietary application around them. It does forbid relicensing those libraries, and it still requires dynamic linking, notices, and a way for the user to relink that library. The commercial license can remove AGPL obligations for PulseWeave's own code. It cannot remove LGPL obligations for these libraries.

That is not a blocker for offering the commercial self-hosted license, as long as the commercial text does not claim to cover libvips or ffmpeg.

## How this was scanned

Production and optional dependencies, including transitive ones, for every workspace:

| Workspace | What was treated as shipped |
| --- | --- |
| `apps/backend` | Production install. This is the self-hosted server. |
| `apps/frontend` | Production install. Next.js server plus the client bundle. |
| `apps/web` | Production install. Marketing site, same Next.js optional image stack. |
| `packages/database` | Production install. `@prisma/client` ships with the server. |
| `apps/desktop` | Electron runtime, `electron-updater`, and the renderer bundle (`react`, `react-dom`, `lucide-react`, `zustand`, `socket.io-client`). Those renderer packages are declared as devDependencies and are still bundled by electron-vite. |
| `apps/mobile` | Production install of the Expo / React Native app. Build-only tools that sit in that tree are called out below and are not in the incompatible table. |
| `packages/types` | No production dependencies. |
| repo root | Production dependency `cookie-parser` only. |

1,462 package versions were in that union. 1,416 have a permissive SPDX license (MIT, ISC, BSD, Apache-2.0, and the other permissive identifiers in the scan). Platform-specific packages that this Linux machine did not install were checked on the npm registry for the locked version. Where `package.json` had an empty `license` field, the package's `LICENSE` file was read (`thirty-two`, `valid-url`, `requireg`, `@segment/loosely-validate-event` are MIT).

`node-forge@1.4.0` is `(BSD-3-Clause OR GPL-2.0)`. The BSD option is the one that applies. It is pulled in by Expo's CLI and code-signing helper, not by the server.

Dev-only `axe-core@4.11.0` (MPL-2.0, via `eslint-plugin-jsx-a11y`) is not shipped. It is not in the table.

## Incompatible or copyleft licenses

| Package | Version | License | Where used | Risk | Fix |
| --- | --- | --- | --- | --- | --- |
| `@img/sharp-libvips-darwin-arm64`, `@img/sharp-libvips-darwin-x64`, `@img/sharp-libvips-linux-arm`, `@img/sharp-libvips-linux-arm64`, `@img/sharp-libvips-linux-ppc64`, `@img/sharp-libvips-linux-riscv64`, `@img/sharp-libvips-linux-s390x`, `@img/sharp-libvips-linux-x64`, `@img/sharp-libvips-linuxmusl-arm64`, `@img/sharp-libvips-linuxmusl-x64` | 1.3.4 | LGPL-3.0-or-later | Optional dependency of `sharp@0.35.5`, which is an optional dependency of `next@16.4.1` in `apps/frontend` and `apps/web`. pnpm installs the package for the host OS. Next.js uses it at runtime for image optimization. Not used by the backend, desktop, or mobile apps. Linux x64 and linuxmusl x64 were confirmed from the installed `package.json`. The other platform packages were confirmed from the npm registry for 1.3.4. | Conditional, not a sale blocker. A proprietary app may ship this as a separate shared library. Licensees still have to follow LGPL-3.0 for libvips only. The commercial license must not say that libvips is relicensed. | No dependency change in this PR. Keep the native sharp build for the host OS. Do not switch production image optimization to `@img/sharp-wasm32` (see the next rows). Dropping sharp would remove the LGPL library and would also change Next.js image behavior, so it is not a trivial swap. |
| `@img/sharp-win32-arm64`, `@img/sharp-win32-ia32`, `@img/sharp-win32-x64` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later | Same Next.js optional image stack, only when the server is installed on Windows. Windows does not publish a separate `@img/sharp-libvips-*` package; the binding package carries the LGPL term. Registry license for 0.35.5. | Same as libvips above. Both licenses apply. Apache-2.0 does not cancel the LGPL term. | Same as the libvips row. No change in this PR. |
| `@img/sharp-wasm32` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT | Optional wasm fallback for the same sharp install. Not the package Next.js selects on a normal Linux, macOS, or Windows install. | Higher than the native packages. The LGPL library is combined into one wasm binary, so a user cannot replace libvips on its own. Still not a blocker if production builds do not use this package. | Do not use the wasm build for a commercial distribution. No change in this PR. |
| `libffmpeg.so` (shipped inside `electron`, not a separate npm package) | electron 41.10.6 | LGPL-2.1-or-later (Chromium credits entry titled `ffmpeg`) | `apps/desktop`. `electron` is a devDependency and is the packaged shell. The official linux-x64 binary for 41.10.6 was unpacked and contains `libffmpeg.so` next to the `electron` executable. `LICENSES.chromium.html` in that binary identifies ffmpeg as LGPL-2.1 or later. | Conditional, same class as libvips. Not a sale blocker when the official Electron build is used and `libffmpeg` stays a separate library. Other LGPL names in that credits file (`liblouis`, `glibc`, `libsecret`, `libbrlapi`, `libusbx`, Speech Dispatcher, `v4l-utils`, `plasma-wayland-protocols`) are Chromium source credits. They are not separate files in the linux-x64 distro that was inspected. `libsecret`, libusb, speech-dispatcher, and v4l strings appear in the main binary, which matches Chromium opening optional system libraries. `JSZip` in the same credits file is MIT or GPL-3.0; MIT is available, so it is not a blocker. | No change in this PR. Package desktop builds from the official Electron binary so `libffmpeg` stays separate, and keep `LICENSES.chromium.html` in the installer. electron-builder already copies that credits file. |

## Weak copyleft that is compatible

These are not GPL, AGPL, LGPL, or SSPL. MPL-2.0 is file-level: the rest of PulseWeave can be offered under the commercial license. Modifications to the MPL files themselves stay under MPL-2.0. No change is required.

| Package | Version | License | Where used | Risk | Fix |
| --- | --- | --- | --- | --- | --- |
| `web-push` | 3.6.7 | MPL-2.0 | `apps/backend` production dependency. Imported by `apps/backend/src/services/notifications.ts`. Shipped with the self-hosted server. | Not a sale blocker. Keep the MPL notice. | None. |
| `lightningcss` and its platform packages (`lightningcss-linux-x64-gnu`, `lightningcss-linux-x64-musl`, and the other locked `@1.19.0` targets) | 1.19.0 | MPL-2.0 | Dependency of `@expo/metro-config` in `apps/mobile`. Metro uses it while compiling the app. It is not linked into the iOS or Android binary. | Not a sale blocker. Build tool, file-level copyleft. | None. |

## Project metadata, not a dependency

`apps/desktop/package.json` says `"license": "MIT"`. The repository `LICENSE` is AGPL-3.0. MIT would not block a commercial sale. The mismatch can confuse what the desktop sources are under. It was left unchanged in this PR.
