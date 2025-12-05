'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap, Loader2, Building2, User } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthMethod = 'local' | 'ldap';

interface AuthConfig {
  ldap: { enabled: boolean };
  localAuth: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, setCurrentWorkspace } = useStore();
  const [authMethod, setAuthMethod] = useState<AuthMethod>('local');
  const [authConfig, setAuthConfig] = useState<AuthConfig | null>(null);
  
  // Local auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // LDAP auth state
  const [ldapUsername, setLdapUsername] = useState('');
  const [ldapPassword, setLdapPassword] = useState('');
  
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Fetch auth configuration
    api.get<AuthConfig>('/auth/config')
      .then(setAuthConfig)
      .catch(() => setAuthConfig({ ldap: { enabled: false }, localAuth: true }));
  }, []);

  const handleLocalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { user, token, workspace } = await api.auth.login({ email, password });
      setAuth(token, user);
      if (workspace) {
        setCurrentWorkspace(workspace);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleLdapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post<{
        user: any;
        token: string;
        workspace: any;
      }>('/auth/ldap/login', {
        username: ldapUsername,
        password: ldapPassword,
      });
      
      setAuth(response.token, response.user);
      if (response.workspace) {
        setCurrentWorkspace(response.workspace);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login with LDAP');
    } finally {
      setLoading(false);
    }
  };

  const showLdapTab = authConfig?.ldap?.enabled;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-950 via-background to-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-4">
            <Zap className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to your PulseWeave account</p>
        </div>

        {/* Form */}
        <div className="bg-card rounded-xl border shadow-lg p-6">
          {/* Auth Method Tabs */}
          {showLdapTab && (
            <div className="flex mb-6 p-1 bg-muted rounded-lg">
              <button
                type="button"
                onClick={() => setAuthMethod('local')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors',
                  authMethod === 'local'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <User className="h-4 w-4" />
                Email
              </button>
              <button
                type="button"
                onClick={() => setAuthMethod('ldap')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-sm font-medium transition-colors',
                  authMethod === 'ldap'
                    ? 'bg-background shadow text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Building2 className="h-4 w-4" />
                LDAP / SSO
              </button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
              {error}
            </div>
          )}

          {/* Local Auth Form */}
          {authMethod === 'local' && (
            <form onSubmit={handleLocalSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>
            </form>
          )}

          {/* LDAP Auth Form */}
          {authMethod === 'ldap' && (
            <form onSubmit={handleLdapSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="ldap-username" className="text-sm font-medium">
                  Username
                </label>
                <Input
                  id="ldap-username"
                  type="text"
                  placeholder="Your directory username"
                  value={ldapUsername}
                  onChange={(e) => setLdapUsername(e.target.value)}
                  required
                  autoComplete="username"
                />
              </div>

              <div className="space-y-2">
                <label htmlFor="ldap-password" className="text-sm font-medium">
                  Password
                </label>
                <Input
                  id="ldap-password"
                  type="password"
                  placeholder="Your directory password"
                  value={ldapPassword}
                  onChange={(e) => setLdapPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in with LDAP'
                )}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                Use your corporate directory credentials
              </p>
            </form>
          )}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Don&apos;t have an account? </span>
            <Link href="/register" className="text-primary hover:underline font-medium">
              Sign up
            </Link>
          </div>
        </div>

        {/* Demo credentials */}
        <div className="mt-6 p-4 rounded-lg bg-muted/50 text-center">
          <p className="text-sm text-muted-foreground">
            New here? Create an account to get started!
          </p>
        </div>
      </div>
    </div>
  );
}
