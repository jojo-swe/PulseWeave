'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import {
  Shield,
  Smartphone,
  Key,
  Copy,
  Check,
  Trash2,
  Plus,
  Loader2,
  AlertTriangle,
  QrCode,
  RefreshCw,
} from 'lucide-react';

interface MfaStatus {
  mfaEnabled: boolean;
  totpEnabled: boolean;
  webauthnEnabled: boolean;
  webauthnCredentials: Array<{
    id: string;
    name: string;
    deviceType: string;
    backedUp: boolean;
    createdAt: string;
    lastUsedAt: string | null;
  }>;
}

interface TotpSetup {
  secret: string;
  qrCodeDataUrl: string;
}

/**
 * Security settings component for managing MFA.
 */
export function SecuritySettings() {
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // TOTP setup state
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [totpToken, setTotpToken] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  // Disable TOTP state
  const [showDisableTotp, setShowDisableTotp] = useState(false);
  const [disablePassword, setDisablePassword] = useState('');

  // WebAuthn state
  const [webauthnName, setWebauthnName] = useState('');
  const [addingWebauthn, setAddingWebauthn] = useState(false);

  useEffect(() => {
    fetchMfaStatus();
  }, []);

  const fetchMfaStatus = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Add timeout to prevent infinite loading
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/mfa/status`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const status = await response.json();
      setMfaStatus(status);
    } catch (err: any) {
      console.error('MFA status error:', err);
      // Set default MFA status on error so the page renders
      setMfaStatus({
        mfaEnabled: false,
        totpEnabled: false,
        webauthnEnabled: false,
        webauthnCredentials: [],
      });
      
      if (err.name === 'AbortError') {
        setError('Request timed out. The server may be unavailable.');
      } else {
        setError(err.message || 'Failed to fetch MFA status. You can still configure MFA below.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSetupTotp = async () => {
    try {
      setError('');
      const setup = await api.post<TotpSetup>('/mfa/totp/setup', {});
      setTotpSetup(setup);
    } catch (err: any) {
      setError(err.message || 'Failed to setup TOTP');
    }
  };

  const handleEnableTotp = async () => {
    if (!totpSetup || totpToken.length !== 6) return;

    try {
      setError('');
      const result = await api.post<{ backupCodes: string[] }>('/mfa/totp/enable', {
        secret: totpSetup.secret,
        token: totpToken,
      });
      setBackupCodes(result.backupCodes);
      setTotpSetup(null);
      setTotpToken('');
      fetchMfaStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to enable TOTP');
    }
  };

  const handleDisableTotp = async () => {
    if (!disablePassword) return;

    try {
      setError('');
      await api.post('/mfa/totp/disable', { password: disablePassword });
      setShowDisableTotp(false);
      setDisablePassword('');
      fetchMfaStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to disable TOTP');
    }
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join('\n'));
    setCopiedBackupCodes(true);
    setTimeout(() => setCopiedBackupCodes(false), 2000);
  };

  const handleAddWebauthn = async () => {
    if (!webauthnName.trim()) return;

    try {
      setAddingWebauthn(true);
      setError('');

      // Get registration options
      const options = await api.post<any>('/mfa/webauthn/register/options', {});

      // Create credential using WebAuthn API
      const publicKeyOptions: PublicKeyCredentialCreationOptions = {
        challenge: base64UrlToBuffer(options.challenge),
        rp: options.rp,
        user: {
          ...options.user,
          id: base64UrlToBuffer(options.user.id),
        },
        pubKeyCredParams: options.pubKeyCredParams,
        timeout: options.timeout,
        attestation: options.attestation,
        authenticatorSelection: options.authenticatorSelection,
        excludeCredentials: options.excludeCredentials?.map((cred: any) => ({
          ...cred,
          id: base64UrlToBuffer(cred.id),
        })),
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      const response = credential.response as AuthenticatorAttestationResponse;

      // Send to server
      await api.post('/mfa/webauthn/register/verify', {
        response: {
          id: credential.id,
          rawId: bufferToBase64Url(credential.rawId),
          type: credential.type,
          response: {
            clientDataJSON: bufferToBase64Url(response.clientDataJSON),
            attestationObject: bufferToBase64Url(response.attestationObject),
            transports: response.getTransports?.() || [],
          },
        },
        name: webauthnName,
      });

      setWebauthnName('');
      fetchMfaStatus();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('WebAuthn registration was cancelled');
      } else {
        setError(err.message || 'Failed to register security key');
      }
    } finally {
      setAddingWebauthn(false);
    }
  };

  const handleDeleteWebauthn = async (credentialId: string) => {
    try {
      setError('');
      await api.delete(`/mfa/webauthn/credentials/${credentialId}`);
      fetchMfaStatus();
    } catch (err: any) {
      setError(err.message || 'Failed to delete security key');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Security Settings</h2>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          {error}
        </div>
      )}

      {/* MFA Status */}
      <div className="p-4 rounded-lg border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium">Two-Factor Authentication</h3>
            <p className="text-sm text-muted-foreground">
              Add an extra layer of security to your account
            </p>
          </div>
          <div className={`px-2 py-1 rounded text-xs font-medium ${
            mfaStatus?.mfaEnabled 
              ? 'bg-green-500/10 text-green-500' 
              : 'bg-yellow-500/10 text-yellow-500'
          }`}>
            {mfaStatus?.mfaEnabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>

        {/* TOTP Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <Smartphone className="h-5 w-5 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium text-sm">Authenticator App</div>
              <div className="text-xs text-muted-foreground">
                Use Google Authenticator, Authy, or similar
              </div>
            </div>
            {mfaStatus?.totpEnabled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDisableTotp(true)}
              >
                Disable
              </Button>
            ) : (
              <Button size="sm" onClick={handleSetupTotp}>
                Setup
              </Button>
            )}
          </div>

          {/* TOTP Setup Flow */}
          {totpSetup && (
            <div className="p-4 rounded-lg border space-y-4">
              <div className="text-sm font-medium">Scan QR Code</div>
              <div className="flex justify-center">
                <img
                  src={totpSetup.qrCodeDataUrl}
                  alt="TOTP QR Code"
                  className="w-48 h-48 rounded-lg"
                />
              </div>
              <div className="text-center text-xs text-muted-foreground">
                Or enter manually: <code className="bg-muted px-1 rounded">{totpSetup.secret}</code>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Verification Code</label>
                <div className="flex gap-2">
                  <Input
                    value={totpToken}
                    onChange={(e) => setTotpToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    maxLength={6}
                  />
                  <Button onClick={handleEnableTotp} disabled={totpToken.length !== 6}>
                    Verify
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Backup Codes */}
          {backupCodes.length > 0 && (
            <div className="p-4 rounded-lg border border-yellow-500/50 bg-yellow-500/5 space-y-4">
              <div className="flex items-center gap-2 text-yellow-500">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Save Your Backup Codes</span>
              </div>
              <p className="text-xs text-muted-foreground">
                These codes can be used to access your account if you lose your authenticator.
                Each code can only be used once.
              </p>
              <div className="grid grid-cols-2 gap-2 p-3 rounded bg-muted font-mono text-sm">
                {backupCodes.map((code, i) => (
                  <div key={i}>{code}</div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={copyBackupCodes}>
                {copiedBackupCodes ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Codes
                  </>
                )}
              </Button>
              <Button
                variant="default"
                size="sm"
                className="ml-2"
                onClick={() => setBackupCodes([])}
              >
                I've Saved My Codes
              </Button>
            </div>
          )}

          {/* Disable TOTP Dialog */}
          {showDisableTotp && (
            <div className="p-4 rounded-lg border space-y-4">
              <div className="text-sm font-medium">Confirm Password</div>
              <p className="text-xs text-muted-foreground">
                Enter your password to disable two-factor authentication.
              </p>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={disablePassword}
                  onChange={(e) => setDisablePassword(e.target.value)}
                  placeholder="Enter password"
                />
                <Button variant="destructive" onClick={handleDisableTotp}>
                  Disable
                </Button>
                <Button variant="outline" onClick={() => setShowDisableTotp(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* WebAuthn Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Key className="h-5 w-5 text-muted-foreground" />
              <div className="flex-1">
                <div className="font-medium text-sm">Security Keys</div>
                <div className="text-xs text-muted-foreground">
                  YubiKey, Passkeys, or other FIDO2 devices
                </div>
              </div>
            </div>

            {/* Existing credentials */}
            {mfaStatus?.webauthnCredentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center gap-3 p-3 rounded-lg border"
              >
                <Key className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1">
                  <div className="text-sm font-medium">{cred.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Added {new Date(cred.createdAt).toLocaleDateString()}
                    {cred.lastUsedAt && ` • Last used ${new Date(cred.lastUsedAt).toLocaleDateString()}`}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeleteWebauthn(cred.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            {/* Add new credential */}
            <div className="flex gap-2">
              <Input
                value={webauthnName}
                onChange={(e) => setWebauthnName(e.target.value)}
                placeholder="Security key name (e.g., YubiKey 5)"
              />
              <Button onClick={handleAddWebauthn} disabled={addingWebauthn || !webauthnName.trim()}>
                {addingWebauthn ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Key
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper functions for WebAuthn
function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
