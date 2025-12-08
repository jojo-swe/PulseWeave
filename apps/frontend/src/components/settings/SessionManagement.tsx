'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  Trash2,
  Loader2,
  Shield,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9090';

interface Session {
  id: string;
  deviceInfo: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActiveAt: string;
  isCurrent: boolean;
  device: {
    browser: string;
    os: string;
    device: string;
  };
}

/**
 * Session management component for viewing and revoking active sessions.
 */
export function SessionManagement() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  useEffect(() => {
    fetchSessions();
  }, []);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      setError('');

      const res = await fetch(`${API_URL}/api/auth/sessions`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to fetch sessions');
      }

      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError('Unable to load sessions');
      console.error('Fetch sessions error:', err);
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    try {
      setRevoking(sessionId);

      const res = await fetch(`${API_URL}/api/auth/sessions/${sessionId}`, {
        method: 'DELETE',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to revoke session');
      }

      // Remove from list
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      setError('Failed to revoke session');
      console.error('Revoke session error:', err);
    } finally {
      setRevoking(null);
    }
  };

  const revokeAllSessions = async () => {
    try {
      setRevokingAll(true);

      const res = await fetch(`${API_URL}/api/auth/sessions/revoke-all`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error('Failed to revoke sessions');
      }

      // Refresh the list
      await fetchSessions();
    } catch (err) {
      setError('Failed to revoke sessions');
      console.error('Revoke all sessions error:', err);
    } finally {
      setRevokingAll(false);
    }
  };

  const getDeviceIcon = (device: string) => {
    switch (device) {
      case 'Mobile':
        return <Smartphone className="w-5 h-5" />;
      case 'Tablet':
        return <Tablet className="w-5 h-5" />;
      default:
        return <Monitor className="w-5 h-5" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Active Sessions</h3>
          <p className="text-sm text-muted-foreground">
            Manage your active sessions across devices
          </p>
        </div>
        {sessions.length > 1 && (
          <Button
            variant="outline"
            size="sm"
            onClick={revokeAllSessions}
            disabled={revokingAll}
            className="text-destructive hover:text-destructive"
          >
            {revokingAll ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-2" />
            )}
            Sign out all other devices
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      <div className="space-y-3">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>No active sessions found</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                session.isCurrent
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card'
              }`}
            >
              <div className="flex items-center gap-4">
                <div
                  className={`p-2 rounded-lg ${
                    session.isCurrent ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {getDeviceIcon(session.device.device)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">
                      {session.device.browser} on {session.device.os}
                    </span>
                    {session.isCurrent && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                        <CheckCircle className="w-3 h-3" />
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                    {session.ipAddress && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" />
                        {session.ipAddress}
                      </span>
                    )}
                    <span>
                      Active {formatDistanceToNow(new Date(session.lastActiveAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              </div>

              {!session.isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revokeSession(session.id)}
                  disabled={revoking === session.id}
                  className="text-muted-foreground hover:text-destructive"
                >
                  {revoking === session.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        If you notice any suspicious activity, sign out of all devices and change your password immediately.
      </p>
    </div>
  );
}
