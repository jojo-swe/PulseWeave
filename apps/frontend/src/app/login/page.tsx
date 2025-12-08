'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Zap, Loader2, Building2, User, ShieldCheck, KeyRound } from 'lucide-react';
import { cn } from '@/lib/utils';

type AuthMethod = 'local' | 'ldap';
type MfaMethod = 'totp' | 'backup';

interface AuthConfig {
  ldap: { enabled: boolean };
  localAuth: boolean;
}

interface MfaChallenge {
  mfaToken: string;
  userId: string;
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
  
  // MFA state
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaMethod, setMfaMethod] = useState<MfaMethod>('totp');
  
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
      const response = await api.post<{
        user?: any;
        token?: string;
        workspace?: any;
        mfaRequired?: boolean;
        mfaToken?: string;
        userId?: string;
      }>('/auth/login', { email, password });

      if (response.mfaRequired && response.mfaToken) {
        // MFA required - show MFA form
        setMfaChallenge({
          mfaToken: response.mfaToken,
          userId: response.userId!,
        });
        setLoading(false);
        return;
      }

      // No MFA - complete login
      setAuth(response.token || null, response.user);
      if (response.workspace) {
        setCurrentWorkspace(response.workspace);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaChallenge) return;
    
    setError('');
    setLoading(true);

    try {
      const response = await api.post<{
        user: any;
        token: string;
        workspace: any;
      }>('/auth/mfa/verify', {
        mfaToken: mfaChallenge.mfaToken,
        code: mfaCode,
        type: mfaMethod,
      });

      setAuth(response.token || null, response.user);
      if (response.workspace) {
        setCurrentWorkspace(response.workspace);
      }
      router.push('/');
    } catch (err: any) {
      setError(err.message || 'Invalid verification code');
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
      
      setAuth(response.token || null, response.user);
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
    <div className="min-h-screen flex items-center justify-center bg-[url('/assets/app-background-login.png')] bg-cover bg-center bg-no-repeat bg-fixed p-4 relative overflow-hidden">

      
      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="relative inline-block mb-4">
            <div className="absolute inset-0 bg-primary/30 rounded-2xl blur-xl animate-pulse" />
            <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-lg shadow-primary/30">
              <Zap className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text">Welcome back</h1>
          <p className="text-muted-foreground mt-2">Sign in to your PulseWeave account</p>
        </div>

        {/* Form */}
        <div className="bg-card/80 backdrop-blur-xl rounded-2xl border border-border/50 shadow-2xl p-6">
          {/* Auth Method Tabs */}
          {showLdapTab && !mfaChallenge && (
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

          {/* MFA Challenge Form */}
          {mfaChallenge ? (
            <form onSubmit={handleMfaSubmit} className="space-y-4">
              <div className="text-center mb-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
                  <ShieldCheck className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-lg font-semibold">Two-Factor Authentication</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the code from your authenticator app
                </p>
              </div>

              {/* MFA Method Toggle */}
              <div className="flex p-1 bg-muted rounded-lg mb-4">
                <button
                  type="button"
                  onClick={() => setMfaMethod('totp')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                    mfaMethod === 'totp'
                      ? 'bg-background shadow text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Authenticator
                </button>
                <button
                  type="button"
                  onClick={() => setMfaMethod('backup')}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-md text-sm font-medium transition-colors',
                    mfaMethod === 'backup'
                      ? 'bg-background shadow text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <KeyRound className="h-4 w-4" />
                  Backup Code
                </button>
              </div>

              <div className="space-y-2">
                <label htmlFor="mfa-code" className="text-sm font-medium">
                  {mfaMethod === 'totp' ? '6-digit code' : 'Backup code'}
                </label>
                <Input
                  id="mfa-code"
                  type="text"
                  inputMode="numeric"
                  pattern={mfaMethod === 'totp' ? '[0-9]*' : undefined}
                  placeholder={mfaMethod === 'totp' ? '000000' : 'XXXX-XXXX'}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  className="text-center text-lg tracking-widest"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Verify'
                )}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setMfaChallenge(null);
                  setMfaCode('');
                  setError('');
                }}
                className="w-full text-sm text-muted-foreground hover:text-foreground"
              >
                ← Back to login
              </button>
            </form>
          ) : (
            <>
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

              <div className="mt-4 text-center">
                <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-primary">
                  Forgot your password?
                </Link>
              </div>

              <div className="mt-4 text-center text-sm">
                <span className="text-muted-foreground">Don&apos;t have an account? </span>
                <Link href="/register" className="text-primary hover:underline font-medium">
                  Sign up
                </Link>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 p-4 rounded-xl bg-card/50 backdrop-blur border border-border/30 text-center">
          <p className="text-sm text-muted-foreground">
            New here? Create an account to get started!
          </p>
        </div>
        
        {/* Branding */}
        <p className="text-center text-xs text-muted-foreground/50 mt-6">
          PulseWeave — Real-time team communication
        </p>
      </div>
    </div>
  );
}
