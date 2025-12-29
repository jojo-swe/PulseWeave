import { useState, useEffect } from 'react';
import { TitleBar } from './components/TitleBar';
import { Login } from './pages/Login';
import { Chat } from './pages/Chat';
import { useStore } from './store';

/**
 * Main application component.
 */
function App(): JSX.Element {
  const { token } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if we have a stored token
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading PulseWeave...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background text-foreground flex flex-col overflow-hidden">
      <TitleBar />
      <main className="flex-1 overflow-hidden">
        {token ? <Chat /> : <Login />}
      </main>
    </div>
  );
}

export default App;
