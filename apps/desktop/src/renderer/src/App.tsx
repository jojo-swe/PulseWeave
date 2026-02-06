import { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Login } from './pages/Login';
import { Chat } from './pages/Chat';
import { WorkspaceSelector } from './pages/WorkspaceSelector';
import { useStore } from './store';

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

/**
 * Main application component.
 */
function App(): JSX.Element {
  const { token, currentWorkspace } = useStore();
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const renderPage = () => {
    if (loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-muted-foreground text-sm">Loading PulseWeave...</p>
          </div>
        </div>
      );
    }
    if (!token) return <Login />;
    if (!currentWorkspace) return <WorkspaceSelector />;
    return <Chat connectionStatus={connectionStatus} onConnectionChange={setConnectionStatus} />;
  };

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <TitleBar connectionStatus={connectionStatus} />
      <main className="flex-1 overflow-hidden">
        {renderPage()}
      </main>
    </div>
  );
}

export default App;
