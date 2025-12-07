import { useState } from 'react';
import { Loader2, Server, Zap } from 'lucide-react';
import { useStore } from '../store';

/**
 * Login page component.
 */
export function Login(): JSX.Element {
  const { serverUrl, setServerUrl, setAuth, setCurrentWorkspace } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [tempServerUrl, setTempServerUrl] = useState(serverUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch(`${serverUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Login failed');
      }

      setAuth(data.token, data.user);
      if (data.workspace) {
        setCurrentWorkspace(data.workspace);
      }

      // Show native notification
      window.api?.showNotification('Welcome back!', `Logged in as ${data.user.displayName}`);
    } catch (err: any) {
      setError(err.message || 'Failed to connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveServer = () => {
    setServerUrl(tempServerUrl);
    setShowServerConfig(false);
  };

  return (
    <div className="h-full flex items-center justify-center p-8 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Welcome to PulseWeave</h1>
          <p className="text-zinc-400 mt-2">Sign in to your account</p>
        </div>

        {/* Server config toggle */}
        <button
          onClick={() => setShowServerConfig(!showServerConfig)}
          className="w-full flex items-center justify-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 mb-4 transition-colors"
        >
          <Server className="w-4 h-4" />
          {showServerConfig ? 'Hide server settings' : 'Configure server'}
        </button>

        {/* Server config */}
        {showServerConfig && (
          <div className="mb-6 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Server URL
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={tempServerUrl}
                onChange={(e) => setTempServerUrl(e.target.value)}
                placeholder="http://localhost:3001"
                className="flex-1 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent text-sm"
              />
              <button
                onClick={handleSaveServer}
                className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Save
              </button>
            </div>
            <p className="text-xs text-zinc-500 mt-2">
              Current: {serverUrl}
            </p>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </form>

        <p className="text-center text-zinc-500 text-sm mt-6">
          Don't have an account?{' '}
          <span className="text-violet-400">Contact your admin</span>
        </p>
      </div>
    </div>
  );
}
