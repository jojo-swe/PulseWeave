'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import {
  ArrowLeft,
  Shield,
  Users,
  Activity,
  Search,
  MoreVertical,
  Ban,
  UserX,
  UserCog,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Key,
  Check,
  X,
  Lock,
  Unlock,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
} from 'lucide-react';

type AdminTab = 'users' | 'roles' | 'audit' | 'security';

interface SecurityStatus {
  ssl: { enabled: boolean; minVersion: string };
  features: Record<string, boolean>;
  stats: {
    failedLoginsLast24h: number;
    lockedAccounts: number;
    mfaAdoptionRate: number;
    totalUsers: number;
    mfaEnabledUsers: number;
  };
  recentSecurityEvents: Array<{
    id: string;
    action: string;
    createdAt: string;
    ipAddress: string | null;
    user: { displayName: string; email: string } | null;
  }>;
}

interface LockedAccount {
  id: string;
  email: string;
  username: string;
  displayName: string;
  lockedUntil: string | null;
  isActive: boolean;
  failedLoginAttempts: number;
  lastLoginIp: string | null;
}

interface WorkspaceUser {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  mfaEnabled: boolean;
  isActive: boolean;
  isVerified: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  membership: {
    id: string;
    roleId: string | null;
    roleName: string;
    role: { id: string; name: string; description: string } | null;
    joinedAt: string;
    invitedBy: string | null;
  };
}

interface AuditLogEntry {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  details: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string;
    username: string;
    avatarUrl: string | null;
  } | null;
}

interface Role {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Array<{ id: string; name: string; description: string; category: string }>;
}

/**
 * Admin panel for workspace management.
 */
export default function AdminPage() {
  const router = useRouter();
  const { user, token, currentWorkspace } = useStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Users state
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [userPage, setUserPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);

  // Roles state
  const [roles, setRoles] = useState<Role[]>([]);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [totalAuditLogs, setTotalAuditLogs] = useState(0);

  // Action menu state
  const [actionMenuUser, setActionMenuUser] = useState<string | null>(null);
  const [roleChangeUser, setRoleChangeUser] = useState<string | null>(null);

  // Security state
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus | null>(null);
  const [lockedAccounts, setLockedAccounts] = useState<LockedAccount[]>([]);

  useEffect(() => {
    if (!token) {
      router.push('/login');
    }
  }, [token, router]);

  useEffect(() => {
    if (currentWorkspace?.id) {
      fetchData();
    }
  }, [currentWorkspace?.id, activeTab, userPage, auditPage]);

  const fetchData = async () => {
    setLoading(true);
    setError('');

    try {
      if (activeTab === 'users') {
        const response = await api.get<{
          users: WorkspaceUser[];
          pagination: { total: number };
        }>(`/admin/workspaces/${currentWorkspace?.id}/users?page=${userPage}&limit=20`);
        setUsers(response.users);
        setTotalUsers(response.pagination.total);
      } else if (activeTab === 'roles') {
        const response = await api.get<Role[]>('/admin/roles');
        setRoles(response);
      } else if (activeTab === 'audit') {
        const response = await api.get<{
          logs: AuditLogEntry[];
          pagination: { total: number };
        }>(`/admin/workspaces/${currentWorkspace?.id}/audit-log?page=${auditPage}&limit=50`);
        setAuditLogs(response.logs);
        setTotalAuditLogs(response.pagination.total);
      } else if (activeTab === 'security') {
        const [statusResponse, lockedResponse] = await Promise.all([
          api.get<SecurityStatus>('/security/status'),
          api.get<LockedAccount[]>('/security/locked-accounts'),
        ]);
        setSecurityStatus(statusResponse);
        setLockedAccounts(lockedResponse);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlockAccount = async (userId: string) => {
    try {
      await api.post(`/security/unlock-account/${userId}`, {});
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to unlock account');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await api.patch(`/admin/workspaces/${currentWorkspace?.id}/users/${userId}/role`, {
        roleName: newRole,
      });
      setRoleChangeUser(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to change role');
    }
  };

  const handleBanUser = async (userId: string) => {
    if (!confirm('Are you sure you want to ban this user?')) return;
    try {
      await api.post(`/admin/workspaces/${currentWorkspace?.id}/users/${userId}/ban`, {});
      setActionMenuUser(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to ban user');
    }
  };

  const handleUnbanUser = async (userId: string) => {
    try {
      await api.post(`/admin/workspaces/${currentWorkspace?.id}/users/${userId}/unban`, {});
      setActionMenuUser(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to unban user');
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user from the workspace?')) return;
    try {
      await api.delete(`/admin/workspaces/${currentWorkspace?.id}/users/${userId}`);
      setActionMenuUser(null);
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to remove user');
    }
  };

  const filteredUsers = userSearch
    ? users.filter(
        (u) =>
          u.displayName.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.username.toLowerCase().includes(userSearch.toLowerCase()) ||
          u.email.toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  if (!user || !currentWorkspace) {
    return null;
  }

  const tabs = [
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'roles' as const, label: 'Roles', icon: Shield },
    { id: 'audit' as const, label: 'Audit Log', icon: Activity },
    { id: 'security' as const, label: 'Security', icon: ShieldCheck },
  ];

  const roleColors: Record<string, string> = {
    owner: 'bg-yellow-500/10 text-yellow-500',
    admin: 'bg-red-500/10 text-red-500',
    moderator: 'bg-blue-500/10 text-blue-500',
    member: 'bg-green-500/10 text-green-500',
    guest: 'bg-gray-500/10 text-gray-500',
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Chat
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">Admin Panel</h1>
          </div>
          <span className="text-sm text-muted-foreground">
            {currentWorkspace.name}
          </span>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-8">
            {/* Sidebar */}
            <nav className="w-48 shrink-0">
              <ul className="space-y-1">
                {tabs.map((tab) => (
                  <li key={tab.id}>
                    <button
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        activeTab === tab.id
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                      )}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            {/* Content */}
            <main className="flex-1 min-w-0">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <>
                  {/* Users Tab */}
                  {activeTab === 'users' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">
                          Users ({totalUsers})
                        </h2>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                            placeholder="Search users..."
                            className="pl-9 w-64"
                          />
                        </div>
                      </div>

                      <div className="rounded-lg border">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b bg-muted/50">
                              <th className="text-left p-3 text-sm font-medium">User</th>
                              <th className="text-left p-3 text-sm font-medium">Role</th>
                              <th className="text-left p-3 text-sm font-medium">Status</th>
                              <th className="text-left p-3 text-sm font-medium">MFA</th>
                              <th className="text-left p-3 text-sm font-medium">Joined</th>
                              <th className="text-right p-3 text-sm font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredUsers.map((u) => (
                              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="p-3">
                                  <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={u.avatarUrl || undefined} />
                                      <AvatarFallback className={cn(generateAvatarColor(u.displayName))}>
                                        {getInitials(u.displayName)}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <div className="font-medium text-sm">{u.displayName}</div>
                                      <div className="text-xs text-muted-foreground">@{u.username}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="p-3">
                                  {roleChangeUser === u.id ? (
                                    <div className="flex items-center gap-1">
                                      <select
                                        className="text-xs border rounded px-2 py-1 bg-background"
                                        defaultValue={u.membership.roleName}
                                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                                      >
                                        <option value="owner">Owner</option>
                                        <option value="admin">Admin</option>
                                        <option value="moderator">Moderator</option>
                                        <option value="member">Member</option>
                                        <option value="guest">Guest</option>
                                      </select>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 w-6 p-0"
                                        onClick={() => setRoleChangeUser(null)}
                                      >
                                        <X className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => setRoleChangeUser(u.id)}
                                      className={cn(
                                        'px-2 py-0.5 rounded text-xs font-medium capitalize',
                                        roleColors[u.membership.roleName] || 'bg-muted'
                                      )}
                                    >
                                      {u.membership.roleName}
                                    </button>
                                  )}
                                </td>
                                <td className="p-3">
                                  <span
                                    className={cn(
                                      'px-2 py-0.5 rounded text-xs',
                                      u.isActive
                                        ? 'bg-green-500/10 text-green-500'
                                        : 'bg-red-500/10 text-red-500'
                                    )}
                                  >
                                    {u.isActive ? 'Active' : 'Banned'}
                                  </span>
                                </td>
                                <td className="p-3">
                                  {u.mfaEnabled ? (
                                    <Key className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <span className="text-xs text-muted-foreground">None</span>
                                  )}
                                </td>
                                <td className="p-3 text-sm text-muted-foreground">
                                  {new Date(u.membership.joinedAt).toLocaleDateString()}
                                </td>
                                <td className="p-3 text-right">
                                  <div className="relative">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-8 w-8 p-0"
                                      onClick={() =>
                                        setActionMenuUser(actionMenuUser === u.id ? null : u.id)
                                      }
                                      disabled={u.id === user.id || u.membership.roleName === 'owner'}
                                    >
                                      <MoreVertical className="h-4 w-4" />
                                    </Button>
                                    {actionMenuUser === u.id && (
                                      <div className="absolute right-0 top-full mt-1 z-10 bg-popover border rounded-lg shadow-lg py-1 min-w-[140px]">
                                        {u.isActive ? (
                                          <button
                                            onClick={() => handleBanUser(u.id)}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-destructive"
                                          >
                                            <Ban className="h-4 w-4" />
                                            Ban User
                                          </button>
                                        ) : (
                                          <button
                                            onClick={() => handleUnbanUser(u.id)}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-green-500"
                                          >
                                            <Check className="h-4 w-4" />
                                            Unban User
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleRemoveUser(u.id)}
                                          className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-destructive"
                                        >
                                          <UserX className="h-4 w-4" />
                                          Remove
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {/* Pagination */}
                      {totalUsers > 20 && (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={userPage === 1}
                            onClick={() => setUserPage(userPage - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Page {userPage} of {Math.ceil(totalUsers / 20)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={userPage >= Math.ceil(totalUsers / 20)}
                            onClick={() => setUserPage(userPage + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Roles Tab */}
                  {activeTab === 'roles' && (
                    <div className="space-y-4">
                      <h2 className="text-lg font-semibold">Roles & Permissions</h2>
                      <div className="grid gap-4">
                        {roles.map((role) => (
                          <div key={role.id} className="p-4 rounded-lg border">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span
                                  className={cn(
                                    'px-2 py-0.5 rounded text-sm font-medium capitalize',
                                    roleColors[role.name] || 'bg-muted'
                                  )}
                                >
                                  {role.name}
                                </span>
                                {role.isSystem && (
                                  <span className="text-xs text-muted-foreground">(System)</span>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-muted-foreground mb-3">{role.description}</p>
                            <div className="flex flex-wrap gap-1">
                              {role.permissions.map((perm) => (
                                <span
                                  key={perm.id}
                                  className="px-2 py-0.5 rounded text-xs bg-muted"
                                  title={perm.description}
                                >
                                  {perm.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Audit Log Tab */}
                  {activeTab === 'audit' && (
                    <div className="space-y-4">
                      <h2 className="text-lg font-semibold">Audit Log</h2>
                      <div className="rounded-lg border divide-y">
                        {auditLogs.map((log) => (
                          <div key={log.id} className="p-3 flex items-start gap-3">
                            <div className="p-2 rounded-full bg-muted">
                              <Activity className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                {log.user && (
                                  <span className="font-medium text-sm">
                                    {log.user.displayName}
                                  </span>
                                )}
                                <span className="text-sm">
                                  <span className="text-muted-foreground">performed</span>{' '}
                                  <code className="px-1 py-0.5 rounded bg-muted text-xs">
                                    {log.action}
                                  </code>{' '}
                                  <span className="text-muted-foreground">on</span>{' '}
                                  {log.resource}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                <Clock className="h-3 w-3" />
                                {new Date(log.createdAt).toLocaleString()}
                                {log.ipAddress && <span>• {log.ipAddress}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                        {auditLogs.length === 0 && (
                          <div className="p-8 text-center text-muted-foreground">
                            No audit logs found
                          </div>
                        )}
                      </div>

                      {/* Pagination */}
                      {totalAuditLogs > 50 && (
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={auditPage === 1}
                            onClick={() => setAuditPage(auditPage - 1)}
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </Button>
                          <span className="text-sm text-muted-foreground">
                            Page {auditPage} of {Math.ceil(totalAuditLogs / 50)}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={auditPage >= Math.ceil(totalAuditLogs / 50)}
                            onClick={() => setAuditPage(auditPage + 1)}
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Security Tab */}
                  {activeTab === 'security' && securityStatus && (
                    <div className="space-y-6">
                      <h2 className="text-lg font-semibold">Security Dashboard</h2>
                      
                      {/* Security Stats */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <ShieldCheck className="h-4 w-4" />
                            <span className="text-sm">SSL/TLS</span>
                          </div>
                          <div className={cn(
                            'text-lg font-semibold',
                            securityStatus.ssl.enabled ? 'text-green-500' : 'text-yellow-500'
                          )}>
                            {securityStatus.ssl.enabled ? 'Enabled' : 'Disabled'}
                          </div>
                          {securityStatus.ssl.enabled && (
                            <div className="text-xs text-muted-foreground">
                              {securityStatus.ssl.minVersion}+
                            </div>
                          )}
                        </div>
                        
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <AlertTriangle className="h-4 w-4" />
                            <span className="text-sm">Failed Logins (24h)</span>
                          </div>
                          <div className={cn(
                            'text-lg font-semibold',
                            securityStatus.stats.failedLoginsLast24h > 10 ? 'text-red-500' : 'text-foreground'
                          )}>
                            {securityStatus.stats.failedLoginsLast24h}
                          </div>
                        </div>
                        
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Lock className="h-4 w-4" />
                            <span className="text-sm">Locked Accounts</span>
                          </div>
                          <div className={cn(
                            'text-lg font-semibold',
                            securityStatus.stats.lockedAccounts > 0 ? 'text-yellow-500' : 'text-foreground'
                          )}>
                            {securityStatus.stats.lockedAccounts}
                          </div>
                        </div>
                        
                        <div className="p-4 rounded-lg border bg-card">
                          <div className="flex items-center gap-2 text-muted-foreground mb-2">
                            <Key className="h-4 w-4" />
                            <span className="text-sm">MFA Adoption</span>
                          </div>
                          <div className="text-lg font-semibold">
                            {securityStatus.stats.mfaAdoptionRate}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {securityStatus.stats.mfaEnabledUsers} / {securityStatus.stats.totalUsers} users
                          </div>
                        </div>
                      </div>

                      {/* Security Features */}
                      <div className="p-4 rounded-lg border">
                        <h3 className="font-medium mb-3">Security Features</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {Object.entries(securityStatus.features).map(([feature, enabled]) => (
                            <div key={feature} className="flex items-center gap-2">
                              {enabled ? (
                                <Check className="h-4 w-4 text-green-500" />
                              ) : (
                                <X className="h-4 w-4 text-red-500" />
                              )}
                              <span className="text-sm capitalize">
                                {feature.replace(/([A-Z])/g, ' $1').trim()}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Locked Accounts */}
                      {lockedAccounts.length > 0 && (
                        <div className="p-4 rounded-lg border">
                          <h3 className="font-medium mb-3 flex items-center gap-2">
                            <Lock className="h-4 w-4" />
                            Locked Accounts ({lockedAccounts.length})
                          </h3>
                          <div className="space-y-2">
                            {lockedAccounts.map((account) => (
                              <div key={account.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                <div>
                                  <div className="font-medium text-sm">{account.displayName}</div>
                                  <div className="text-xs text-muted-foreground">
                                    {account.email} • {account.failedLoginAttempts} failed attempts
                                    {account.lockedUntil && (
                                      <> • Locked until {new Date(account.lockedUntil).toLocaleString()}</>
                                    )}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleUnlockAccount(account.id)}
                                >
                                  <Unlock className="h-4 w-4 mr-2" />
                                  Unlock
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Security Events */}
                      <div className="p-4 rounded-lg border">
                        <h3 className="font-medium mb-3 flex items-center gap-2">
                          <ShieldAlert className="h-4 w-4" />
                          Recent Security Events
                        </h3>
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {securityStatus.recentSecurityEvents.map((event) => (
                            <div key={event.id} className="flex items-center justify-between p-2 rounded bg-muted/30 text-sm">
                              <div className="flex items-center gap-2">
                                <code className={cn(
                                  'px-1.5 py-0.5 rounded text-xs',
                                  event.action.includes('FAILED') || event.action.includes('LOCKED')
                                    ? 'bg-red-500/10 text-red-500'
                                    : 'bg-muted'
                                )}>
                                  {event.action}
                                </code>
                                {event.user && (
                                  <span className="text-muted-foreground">
                                    {event.user.displayName}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {event.ipAddress && <span>{event.ipAddress}</span>}
                                <span>{new Date(event.createdAt).toLocaleTimeString()}</span>
                              </div>
                            </div>
                          ))}
                          {securityStatus.recentSecurityEvents.length === 0 && (
                            <div className="text-center text-muted-foreground py-4">
                              No recent security events
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
