# PulseWeave Mobile

Cross-platform mobile client for PulseWeave built with React Native and Expo.

## Platforms

- **iOS** (iPhone & iPad)
- **Android** (Phone & Tablet)

## Development

```bash
# Install dependencies (from repo root)
pnpm install

# Start Expo development server
pnpm --filter mobile start

# Run on specific platform
pnpm --filter mobile ios       # iOS Simulator
pnpm --filter mobile android   # Android Emulator
pnpm --filter mobile web       # Web browser
```

## Building for Production

Using EAS Build (Expo Application Services):

```bash
# Install EAS CLI globally
npm install -g eas-cli

# Login to Expo
eas login

# Configure project (first time only)
eas build:configure

# Build for platforms
pnpm build:ios      # iOS
pnpm build:android  # Android
pnpm build:all      # Both platforms

# Submit to stores
pnpm submit:ios     # App Store
pnpm submit:android # Play Store
```

## Features

- Native iOS and Android UI
- Push notifications
- Haptic feedback
- Secure credential storage
- Configurable server URL
- Dark mode support
- Real-time messaging via Socket.io

## Project Structure

```text
apps/mobile/
├── app/                    # Expo Router pages
│   ├── _layout.tsx         # Root layout
│   ├── index.tsx           # Entry redirect
│   ├── login.tsx           # Login screen
│   └── (tabs)/             # Tab navigation
│       ├── _layout.tsx     # Tab layout
│       ├── index.tsx       # Chat screen
│       ├── activity.tsx    # Notifications
│       └── settings.tsx    # Settings
├── store/                  # Zustand state
├── assets/                 # Images & icons
├── app.json                # Expo config
└── package.json
```

## Assets Required

Place in `assets/` folder:

- `icon.png` - 1024x1024 app icon
- `splash.png` - Splash screen image
- `adaptive-icon.png` - Android adaptive icon foreground
- `favicon.png` - Web favicon
- `notification-icon.png` - Push notification icon

## Configuration

Update `app.json` for your app:

```json
{
  "expo": {
    "name": "Your App Name",
    "slug": "your-app-slug",
    "ios": {
      "bundleIdentifier": "com.yourcompany.yourapp"
    },
    "android": {
      "package": "com.yourcompany.yourapp"
    }
  }
}
```

## Push Notifications

### Web app (browser)

The web frontend uses Web Push via VAPID keys (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`) and a service worker.

### Mobile app (Expo)

The mobile client uses `expo-notifications`, but server-side native push delivery via the Expo Push API is not wired up yet.

If you want native push notifications for mobile:

1. Configure push notification credentials in EAS
2. Update `app.json` with your notification settings
3. Implement Expo Push token registration + delivery on the backend

## Security / Dependency Notes

- The repo uses `pnpm.overrides` to pin React Native CLI packages to versions that do not depend on the vulnerable `ip` package.
- If you bump Expo/RN versions, re-run `pnpm audit` and re-verify the lockfile does not re-introduce `ip`.

## Server Configuration

Users can configure the server URL in the login screen by tapping "Configure server". The URL is persisted in secure storage.

Default: `http://localhost:9090`
