import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification } from 'electron';
import { join } from 'path';
import { autoUpdater } from 'electron-updater';

// Dev check - use process.env since app.isPackaged isn't available at module load
const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

/**
 * Creates the main application window.
 */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#18181b',
      symbolColor: '#ffffff',
      height: 40,
    },
    autoHideMenuBar: true,
    icon: join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the app
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // Handle window close to tray
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

/**
 * Creates the system tray icon and menu.
 */
function createTray(): void {
  const iconPath = join(__dirname, '../../resources/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open PulseWeave',
      click: () => {
        mainWindow?.show();
      },
    },
    {
      label: 'Check for Updates',
      click: () => {
        autoUpdater.checkForUpdatesAndNotify();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('PulseWeave');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    mainWindow?.show();
  });
}

/**
 * Sets up auto-updater events.
 */
function setupAutoUpdater(): void {
  autoUpdater.autoDownload = false;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow?.webContents.send('update-downloaded', info);
    
    new Notification({
      title: 'Update Ready',
      body: `Version ${info.version} is ready to install. Restart to update.`,
    }).show();
  });

  autoUpdater.on('error', (error) => {
    mainWindow?.webContents.send('update-error', error.message);
  });
}

// Track if app is quitting (for close-to-tray behavior)
let isQuitting = false;

// App lifecycle
app.whenReady().then(() => {
  // Set app user model id for windows
  app.setAppUserModelId('com.pulseweave.desktop');

  // IPC handlers
  ipcMain.on('minimize-window', () => {
    mainWindow?.minimize();
  });

  ipcMain.on('maximize-window', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });

  ipcMain.on('close-window', () => {
    mainWindow?.close();
  });

  ipcMain.handle('is-maximized', () => {
    return mainWindow?.isMaximized();
  });

  ipcMain.on('show-notification', (_, { title, body }) => {
    const notification = new Notification({ title, body });
    notification.on('click', () => {
      mainWindow?.show();
      mainWindow?.focus();
    });
    notification.show();
  });

  ipcMain.on('set-badge-count', (_, count: number) => {
    // macOS dock badge
    if (process.platform === 'darwin') {
      app.setBadgeCount(count);
    }
    // Update tray tooltip
    if (tray) {
      tray.setToolTip(count > 0 ? `PulseWeave (${count} unread)` : 'PulseWeave');
    }
    // Windows: overlay icon on taskbar
    if (process.platform === 'win32' && mainWindow) {
      if (count > 0) {
        mainWindow.setOverlayIcon(
          nativeImage.createFromDataURL(createBadgeDataUrl(count)),
          `${count} unread`
        );
      } else {
        mainWindow.setOverlayIcon(null, '');
      }
    }
  });

  ipcMain.on('check-for-updates', () => {
    autoUpdater.checkForUpdatesAndNotify();
  });

  ipcMain.on('install-update', () => {
    autoUpdater.quitAndInstall();
  });

  createWindow();
  createTray();
  setupAutoUpdater();

  // Open DevTools in development (after window is created)
  if (isDev) {
    mainWindow?.webContents.openDevTools();
  }

  // Check for updates on startup (production only)
  if (!isDev) {
    autoUpdater.checkForUpdatesAndNotify();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else {
      mainWindow?.show();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

/**
 * Create a tiny badge data URL for the Windows taskbar overlay.
 */
function createBadgeDataUrl(count: number): string {
  const size = 16;
  const text = count > 9 ? '9+' : String(count);
  // Simple SVG badge
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="8" cy="8" r="8" fill="#ef4444"/>
    <text x="8" y="12" text-anchor="middle" fill="white" font-size="10" font-family="sans-serif" font-weight="bold">${text}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
