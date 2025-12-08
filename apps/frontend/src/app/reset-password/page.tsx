'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { KeyRound, Loader2, CheckCircle, XCircle, Eye, EyeOff, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const validatePassword = (pwd: string): string[] => {
    const errs: string[] = [];
    if (pwd.length < 8) errs.push('At least 8 characters');
    if (!/[A-Z]/.test(pwd)) errs.push('One uppercase letter');
    if (!/[a-z]/.test(pwd)) errs.push('One lowercase letter');
    if (!/[0-9]/.test(pwd)) errs.push('One number');
    if (!/[^A-Za-z0-9]/.test(pwd)) errs.push('One special character');
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationErrors = validatePassword(password);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    if (password !== confirmPassword) {
      setErrors(['Passwords do not match']);
      return;
    }

    setErrors([]);
    setStatus('loading');

    try {
      const res = await fetch(`${API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage(data.message || 'Password has been reset successfully!');
      } else {
        setStatus('error');
        setMessage(data.error || 'Failed to reset password. Please try again.');
      }
    } catch {
      setStatus('error');
      setMessage('Unable to connect to server. Please try again later.');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="w-full max-w-md">
          <div className="bg-card border border-border rounded-2xl p-8 shadow-xl text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-amber-500/10 flex items-center justify-center">
              <XCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">Invalid Reset Link</h1>
            <p className="text-muted-foreground mb-6">
              This password reset link is invalid or has expired. Please request a new one.
            </p>
            <Button onClick={() => router.push('/forgot-password')} className="w-full">
              Request New Link
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to login
          </Link>

          {status === 'success' ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Password Reset!</h1>
              <p className="text-muted-foreground mb-6">{message}</p>
              <Button onClick={() => router.push('/login')} className="w-full">
                Continue to Login
              </Button>
            </div>
          ) : status === 'error' ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-destructive/10 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-destructive" />
              </div>
              <h1 className="text-2xl font-bold text-foreground mb-2">Reset Failed</h1>
              <p className="text-muted-foreground mb-6">{message}</p>
              <div className="space-y-3">
                <Button onClick={() => router.push('/forgot-password')} className="w-full">
                  Request New Link
                </Button>
                <Button variant="outline" onClick={() => setStatus('idle')} className="w-full">
                  Try Again
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="w-12 h-12 mb-6 rounded-xl bg-primary/10 flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-primary" />
              </div>

              <h1 className="text-2xl font-bold text-foreground mb-2">Reset your password</h1>
              <p className="text-muted-foreground mb-6">
                Enter your new password below. Make sure it's strong and unique.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrors([]);
                      }}
                      required
                      disabled={status === 'loading'}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      setErrors([]);
                    }}
                    required
                    disabled={status === 'loading'}
                  />
                </div>

                {errors.length > 0 && (
                  <div className="text-sm text-destructive space-y-1">
                    <p className="font-medium">Password requirements:</p>
                    <ul className="list-disc list-inside">
                      {errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={status === 'loading'}>
                  {status === 'loading' ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    'Reset Password'
                  )}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
