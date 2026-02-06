import { useState, useEffect, useCallback } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';
import { useStore } from '../store';
import type { ConnectionStatus } from '../App';

interface TitleBarProps {
  connectionStatus: ConnectionStatus;
}

const STATUS_COLORS: Record<ConnectionStatus, string> = {
  connected: 'bg-green-500',
  connecting: 'bg-yellow-500 animate-pulse',
  disconnected: 'bg-red-500',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  connecting: 'Reconnecting…',
  disconnected: 'Offline',
};

/**
 * Custom title bar for frameless window.
 */
export function TitleBar({ connectionStatus }: TitleBarProps): JSX.Element {
  const { currentWorkspace, token } = useStore();
  const [isMaximized, setIsMaximized] = useState(false);

  const syncMaximized = useCallback(async () => {
    if (window.api) {
      const maximized = await window.api.isMaximized();
      setIsMaximized(maximized);
    }
  }, []);

  useEffect(() => {
    syncMaximized();
    window.addEventListener('resize', syncMaximized);
    return () => window.removeEventListener('resize', syncMaximized);
  }, [syncMaximized]);

  const handleMinimize = () => window.api?.minimizeWindow();
  const handleMaximize = () => {
    window.api?.maximizeWindow();
    // Sync after a short delay so the OS has time to process
    setTimeout(syncMaximized, 50);
  };
  const handleClose = () => window.api?.closeWindow();

  return (
    <div className="h-10 bg-secondary flex items-center justify-between select-none app-drag border-b border-border">
      {/* Left: App icon + workspace name */}
      <div className="flex items-center gap-2 px-4">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
          <span className="text-white text-xs font-bold">P</span>
        </div>
        <span className="text-sm font-medium text-foreground">
          {currentWorkspace ? currentWorkspace.name : 'PulseWeave'}
        </span>
        {/* Connection indicator */}
        {token && (
          <div className="flex items-center gap-1.5 ml-1" title={STATUS_LABELS[connectionStatus]}>
            <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[connectionStatus]}`} />
            {connectionStatus !== 'connected' && (
              <span className="text-xs text-muted-foreground">{STATUS_LABELS[connectionStatus]}</span>
            )}
          </div>
        )}
      </div>

      {/* Right: Window controls */}
      <div className="flex items-center app-no-drag">
        <button
          onClick={handleMinimize}
          className="h-10 w-12 flex items-center justify-center hover:bg-accent transition-colors"
          title="Minimize"
        >
          <Minus className="w-4 h-4 text-muted-foreground" />
        </button>
        <button
          onClick={handleMaximize}
          className="h-10 w-12 flex items-center justify-center hover:bg-accent transition-colors"
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Square className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>
        <button
          onClick={handleClose}
          className="h-10 w-12 flex items-center justify-center hover:bg-red-600 hover:text-white transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
