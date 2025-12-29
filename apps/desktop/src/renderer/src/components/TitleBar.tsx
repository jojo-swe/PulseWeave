import { useState, useEffect } from 'react';
import { Minus, Square, X, Copy } from 'lucide-react';

/**
 * Custom title bar for frameless window.
 */
export function TitleBar(): JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      if (window.api) {
        const maximized = await window.api.isMaximized();
        setIsMaximized(maximized);
      }
    };
    checkMaximized();
  }, []);

  const handleMinimize = () => window.api?.minimizeWindow();
  const handleMaximize = () => {
    window.api?.maximizeWindow();
    setIsMaximized(!isMaximized);
  };
  const handleClose = () => window.api?.closeWindow();

  return (
    <div className="h-10 bg-secondary flex items-center justify-between select-none app-drag border-b border-border">
      {/* App title */}
      <div className="flex items-center gap-2 px-4">
        <div className="w-5 h-5 rounded bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <span className="text-white text-xs font-bold">P</span>
        </div>
        <span className="text-sm font-medium text-foreground">PulseWeave</span>
      </div>

      {/* Window controls */}
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
          className="h-10 w-12 flex items-center justify-center hover:bg-red-600 transition-colors"
          title="Close"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}
