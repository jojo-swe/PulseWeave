import { ElectronAPI } from '@electron-toolkit/preload';

declare global {
  interface Window {
    electron: ElectronAPI;
    api: {
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      closeWindow: () => void;
      isMaximized: () => Promise<boolean>;
      showNotification: (title: string, body: string) => void;
      checkForUpdates: () => void;
      installUpdate: () => void;
      onUpdateAvailable: (callback: (info: any) => void) => void;
      onUpdateDownloaded: (callback: (info: any) => void) => void;
      onUpdateError: (callback: (error: string) => void) => void;
      setBadgeCount: (count: number) => void;
      platform: NodeJS.Platform;
    };
  }
}
