# PulseWeave Desktop

Cross-platform desktop client for PulseWeave built with Electron.

## Platforms

- **Windows** (x64, ia32) - NSIS installer & portable
- **macOS** (x64, arm64) - DMG & ZIP
- **Linux** (x64) - AppImage, DEB, RPM

## Development

```bash
# Install dependencies
cd apps/desktop
pnpm install

# Start development
pnpm dev

# Build for current platform
pnpm build
pnpm package

# Build distributables
pnpm dist          # Current platform
pnpm dist:win      # Windows
pnpm dist:mac      # macOS
pnpm dist:linux    # Linux
pnpm dist:all      # All platforms
```

## Features

- Native window controls with custom title bar
- System tray integration
- Desktop notifications
- Auto-updates via GitHub releases
- Persistent login state
- Configurable server URL

## Project Structure

```
apps/desktop/
├── src/
│   ├── main/           # Electron main process
│   │   └── index.ts    # App entry, window management, IPC
│   ├── preload/        # Preload scripts (context bridge)
│   │   └── index.ts    # Expose APIs to renderer
│   └── renderer/       # React frontend
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── store/
│       │   └── styles/
│       └── index.html
├── resources/          # App icons
├── electron.vite.config.ts
└── package.json
```

## Building Icons

Place your icons in the `resources/` folder:

- `icon.png` - 256x256+ PNG for general use
- `icon.ico` - Windows icon (multi-resolution)
- `icon.icns` - macOS icon
- `icons/` - Linux icons (various sizes)

## Configuration

The app stores configuration in:

- **Windows**: `%APPDATA%/pulseweave-desktop`
- **macOS**: `~/Library/Application Support/pulseweave-desktop`
- **Linux**: `~/.config/pulseweave-desktop`

## Auto-Updates

Auto-updates are configured to use GitHub releases. To enable:

1. Set up GitHub releases for your repository
2. Update `build.publish` in `package.json` with your repo details
3. Sign your releases (required for macOS)
