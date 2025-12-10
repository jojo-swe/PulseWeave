'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Copy, Check, Users, Settings, Link2, Trash2, ShieldAlert, Ban, RotateCcw, Clock, LogOut } from 'lucide-react';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

interface WorkspaceSettingsModalProps {
  onClose: () => void;
}

export function WorkspaceSettingsModal({ onClose }: WorkspaceSettingsModalProps) {
  const router = useRouter();
  const { currentWorkspace, token, members, setCurrentWorkspace, setMembers, workspaces, setWorkspaces } = useStore();
  const { canManageRoles, canManageMembers, canViewAuditLog, canBanUsers, isOwner: currentUserIsOwner } = usePermissions();
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'invite' | 'audit'>('general');
  const [name, setName] = useState(currentWorkspace?.name || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  
  // Ban Dialog State
  const [showBanDialog, setShowBanDialog] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('24'); // hours

  // Audit Log State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Delete/Leave Dialog State
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const inviteLink = `${window.location.origin}/join/${currentWorkspace?.slug}`;

  const handleSave = async () => {
    if (!token || !currentWorkspace || !name.trim()) return;
    
    setSaving(true);
    try {
      const updated = await api.workspaces.update(currentWorkspace.id, { name: name.trim() }, token);
      setCurrentWorkspace(updated);
      toast.success('Workspace updated');
      onClose();
    } catch (error) {
      console.error('Failed to update workspace:', error);
      toast.error('Failed to update workspace');
    } finally {
      setSaving(false);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    toast.success('Invite link copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    if (!token || !currentWorkspace) return;
    
    setProcessingId(userId);
    try {
      await api.admin.updateUserRole(currentWorkspace.id, userId, newRole, token);
      
      // Optimistic update
      setMembers(
        members.map(m => 
          m.user.id === userId ? { ...m, role: newRole } : m
        )
      );
      toast.success(`Role updated to ${newRole}`);
    } catch (error: any) {
      console.error('Failed to update role:', error);
      toast.error(error.message || 'Failed to update role');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    if (!token || !currentWorkspace) return;
    if (!confirm('Are you sure you want to remove this user from the workspace?')) return;

    setProcessingId(userId);
    try {
      await api.admin.removeUser(currentWorkspace.id, userId, token);
      
      // Optimistic update
      setMembers(members.filter(m => m.user.id !== userId));
      toast.success('User removed from workspace');
    } catch (error: any) {
      console.error('Failed to remove user:', error);
      toast.error(error.message || 'Failed to remove user');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBanUser = async () => {
    if (!token || !currentWorkspace || !selectedUser) return;

    setProcessingId(selectedUser.id);
    try {
      const duration = banDuration === 'permanent' ? undefined : parseInt(banDuration);
      await api.admin.banUser(currentWorkspace.id, selectedUser.id, { reason: banReason, duration }, token);
      
      // Optimistic update - remove from list or update status
      setMembers(members.map(m => m.user.id === selectedUser.id ? { ...m, user: { ...m.user, status: 'banned', isActive: false } } : m));
      toast.success('User banned');
      setShowBanDialog(false);
      setSelectedUser(null);
      setBanReason('');
    } catch (error: any) {
      console.error('Failed to ban user:', error);
      toast.error(error.message || 'Failed to ban user');
    } finally {
      setProcessingId(null);
    }
  };

  const handleUnbanUser = async (userId: string) => {
    if (!token || !currentWorkspace) return;
    
    setProcessingId(userId);
    try {
      await api.admin.unbanUser(currentWorkspace.id, userId, token);
      
      setMembers(members.map(m => m.user.id === userId ? { ...m, user: { ...m.user, status: 'offline', isActive: true } } : m));
      toast.success('User unbanned');
    } catch (error: any) {
      console.error('Failed to unban user:', error);
      toast.error(error.message || 'Failed to unban user');
    } finally {
      setProcessingId(null);
    }
  };

  const fetchAuditLogs = async (page = 1) => {
    if (!token || !currentWorkspace) return;
    
    setLoadingAudit(true);
    try {
      const response = await api.admin.getAuditLog(currentWorkspace.id, token, { page, limit: 20 });
      setAuditLogs(response.logs);
      setAuditPage(response.pagination.page);
      setAuditTotalPages(response.pagination.totalPages);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!token || !currentWorkspace) return;
    if (deleteConfirmText !== currentWorkspace.name) {
      toast.error('Please type the workspace name to confirm deletion');
      return;
    }

    setDeleting(true);
    try {
      await api.workspaces.delete(currentWorkspace.id, token);
      toast.success('Workspace deleted');
      
      // Remove from local state and navigate away
      const remaining = workspaces.filter(w => w.id !== currentWorkspace.id);
      setWorkspaces(remaining);
      
      if (remaining.length > 0) {
        setCurrentWorkspace(remaining[0]);
        router.push(`/chat/${remaining[0].id}`);
      } else {
        setCurrentWorkspace(null);
        router.push('/chat');
      }
      onClose();
    } catch (error: any) {
      console.error('Failed to delete workspace:', error);
      toast.error(error.message || 'Failed to delete workspace');
    } finally {
      setDeleting(false);
    }
  };

  const handleLeaveWorkspace = async () => {
    if (!token || !currentWorkspace) return;

    setLeaving(true);
    try {
      await api.workspaces.leave(currentWorkspace.id, token);
      toast.success('You have left the workspace');
      
      // Remove from local state and navigate away
      const remaining = workspaces.filter(w => w.id !== currentWorkspace.id);
      setWorkspaces(remaining);
      
      if (remaining.length > 0) {
        setCurrentWorkspace(remaining[0]);
        router.push(`/chat/${remaining[0].id}`);
      } else {
        setCurrentWorkspace(null);
        router.push('/chat');
      }
      onClose();
    } catch (error: any) {
      console.error('Failed to leave workspace:', error);
      toast.error(error.message || 'Failed to leave workspace');
    } finally {
      setLeaving(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'invite', label: 'Invite', icon: Link2 },
    ...(canViewAuditLog ? [{ id: 'audit', label: 'Audit Log', icon: ShieldAlert }] : []),
  ] as const;

  // Fetch audit logs when tab selected
  if (activeTab === 'audit' && auditLogs.length === 0 && !loadingAudit) {
    fetchAuditLogs();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div 
        className="bg-background rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Workspace Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex h-[500px]">
          {/* Sidebar */}
          <div className="w-48 border-r p-2 space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  activeTab === tab.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'general' && (
              <div className="space-y-6">
                <div>
                  <Label htmlFor="workspace-name">Workspace Name</Label>
                  <Input
                    id="workspace-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1.5"
                    placeholder="My Workspace"
                  />
                </div>

                <div>
                  <Label>Workspace URL</Label>
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground bg-muted px-3 py-2 rounded-md">
                    <span>{window.location.origin}/</span>
                    <span className="font-medium text-foreground">{currentWorkspace?.slug}</span>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="font-medium text-destructive mb-2">Danger Zone</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Deleting a workspace is permanent and cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    {currentUserIsOwner ? (
                      <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete Workspace
                      </Button>
                    ) : (
                      <Button variant="outline" className="text-destructive border-destructive hover:bg-destructive/10" onClick={() => setShowLeaveDialog(true)}>
                        <LogOut className="h-4 w-4 mr-2" />
                        Leave Workspace
                      </Button>
                    )}
                  </div>
                  {!currentUserIsOwner && (
                    <p className="text-xs text-muted-foreground mt-2">Only the workspace owner can delete it.</p>
                  )}
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleSave} disabled={saving || !name.trim()}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            )}

            {activeTab === 'members' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Members ({members.length})</h3>
                </div>
                
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.user.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 group"
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={member.user.avatarUrl} />
                        <AvatarFallback className={cn(generateAvatarColor(member.user.displayName))}>
                          {getInitials(member.user.displayName)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{member.user.displayName}</p>
                        <p className="text-sm text-muted-foreground truncate">@{member.user.username}</p>
                      </div>
                      
                      {/* Role Management */}
                      {canManageRoles && member.role !== 'owner' ? (
                        <select
                          className="text-xs px-2 py-1 rounded border bg-background"
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.user.id, e.target.value)}
                          disabled={processingId === member.user.id}
                        >
                          <option value="admin">Admin</option>
                          <option value="moderator">Moderator</option>
                          <option value="member">Member</option>
                          <option value="guest">Guest</option>
                        </select>
                      ) : (
                        <span className={cn(
                          'text-xs px-2 py-1 rounded-full',
                          member.role === 'owner' 
                            ? 'bg-primary/10 text-primary' 
                            : 'bg-muted text-muted-foreground'
                        )}>
                          {member.role}
                        </span>
                      )}



                      {/* Ban/Unban */}
                      {canBanUsers && member.role !== 'owner' && (
                         member.user.isActive ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-orange-500 hover:text-orange-600 hover:bg-orange-500/10 h-8 w-8"
                            onClick={() => {
                              setSelectedUser(member.user);
                              setShowBanDialog(true);
                            }}
                            disabled={processingId === member.user.id}
                            title="Ban user"
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                         ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-green-500 hover:text-green-600 hover:bg-green-500/10 h-8 w-8"
                            onClick={() => handleUnbanUser(member.user.id)}
                            disabled={processingId === member.user.id}
                            title="Unban user"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                         )
                      )}

                      {/* User Removal */}
                      {canManageMembers && member.role !== 'owner' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8"
                          onClick={() => handleRemoveUser(member.user.id)}
                          disabled={processingId === member.user.id}
                          title="Remove user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'invite' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-medium mb-2">Invite Link</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Share this link to invite people to your workspace.
                  </p>
                  
                  <div className="flex gap-2">
                    <Input
                      value={inviteLink}
                      readOnly
                      className="font-mono text-sm"
                    />
                    <Button onClick={copyInviteLink} variant="outline" className="shrink-0">
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-2">Invite by Email</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Send email invitations to specific people.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="colleague@company.com"
                      className="flex-1"
                    />
                    <Button>Send Invite</Button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Audit Log</h3>
                  <Button variant="outline" size="sm" onClick={() => fetchAuditLogs(auditPage)}>
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>

                <div className="flex-1 overflow-auto border rounded-md">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3">Action</th>
                        <th className="px-4 py-3">User</th>
                        <th className="px-4 py-3">Details</th>
                        <th className="px-4 py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loadingAudit && auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground">Loading...</td>
                        </tr>
                      ) : auditLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="p-4 text-center text-muted-foreground">No logs found</td>
                        </tr>
                      ) : (
                        auditLogs.map((log) => (
                          <tr key={log.id} className="border-b last:border-0 hover:bg-muted/50">
                            <td className="px-4 py-3 font-medium">{log.action.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-3 flex items-center gap-2">
                              {log.user && (
                                <>
                                  <Avatar className="h-6 w-6">
                                    <AvatarImage src={log.user.avatarUrl} />
                                    <AvatarFallback className="text-[10px]">{getInitials(log.user.displayName)}</AvatarFallback>
                                  </Avatar>
                                  <span className="truncate max-w-[100px]">{log.user.displayName}</span>
                                </>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground max-w-[200px] truncate" title={log.details}>
                              {log.details}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {auditTotalPages > 1 && (
                  <div className="flex justify-center gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchAuditLogs(auditPage - 1)}
                      disabled={auditPage === 1 || loadingAudit}
                    >
                      Previous
                    </Button>
                    <span className="flex items-center text-sm text-muted-foreground">
                      Page {auditPage} of {auditTotalPages}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => fetchAuditLogs(auditPage + 1)}
                      disabled={auditPage === auditTotalPages || loadingAudit}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Ban Dialog */}
        {showBanDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-semibold">Ban {selectedUser?.displayName}</h3>
              
              <div className="space-y-2">
                <Label>Reason</Label>
                <Input 
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Violation of rules..."
                />
              </div>

              <div className="space-y-2">
                <Label>Duration</Label>
                <select 
                  className="w-full px-3 py-2 rounded-md border bg-background"
                  value={banDuration}
                  onChange={(e) => setBanDuration(e.target.value)}
                >
                  <option value="24">24 Hours</option>
                  <option value="72">3 Days</option>
                  <option value="168">1 Week</option>
                  <option value="720">30 Days</option>
                  <option value="permanent">Permanent</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowBanDialog(false)}>Cancel</Button>
                <Button variant="destructive" onClick={handleBanUser} disabled={loadingAudit}>
                  Confirm Ban
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Workspace Dialog */}
        {showDeleteDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-semibold text-destructive">Delete Workspace</h3>
              <p className="text-sm text-muted-foreground">
                This will permanently delete <strong>{currentWorkspace?.name}</strong> and all its channels, messages, and data. This action cannot be undone.
              </p>
              
              <div className="space-y-2">
                <Label>Type <span className="font-mono font-bold">{currentWorkspace?.name}</span> to confirm</Label>
                <Input 
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type workspace name..."
                  className="font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => { setShowDeleteDialog(false); setDeleteConfirmText(''); }}>Cancel</Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDeleteWorkspace} 
                  disabled={deleting || deleteConfirmText !== currentWorkspace?.name}
                >
                  {deleting ? 'Deleting...' : 'Delete Permanently'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Leave Workspace Dialog */}
        {showLeaveDialog && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-background rounded-lg shadow-xl w-full max-w-sm p-6 space-y-4 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-semibold">Leave Workspace</h3>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to leave <strong>{currentWorkspace?.name}</strong>? You will need to be re-invited to rejoin.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setShowLeaveDialog(false)}>Cancel</Button>
                <Button 
                  variant="destructive" 
                  onClick={handleLeaveWorkspace} 
                  disabled={leaving}
                >
                  {leaving ? 'Leaving...' : 'Leave Workspace'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
