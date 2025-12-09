'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Copy, Check, Users, Settings, Link2, Trash2, ShieldAlert } from 'lucide-react';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { toast } from '@/components/ui/toast';

interface WorkspaceSettingsModalProps {
  onClose: () => void;
}

export function WorkspaceSettingsModal({ onClose }: WorkspaceSettingsModalProps) {
  const { currentWorkspace, token, members, setCurrentWorkspace, setMembers } = useStore();
  const { canManageRoles, canManageMembers, canViewAuditLog, isOwner: currentUserIsOwner } = usePermissions();
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'invite' | 'audit'>('general');
  const [name, setName] = useState(currentWorkspace?.name || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

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

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'invite', label: 'Invite', icon: Link2 },
    ...(canViewAuditLog ? [{ id: 'audit', label: 'Audit Log', icon: ShieldAlert }] : []),
  ] as const;

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
                  <Button variant="destructive" disabled={!currentUserIsOwner}>
                    Delete Workspace
                  </Button>
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
              <div className="space-y-6 flex flex-col items-center justify-center h-full text-center">
                <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-medium">Audit Log</h3>
                <p className="text-sm text-muted-foreground max-w-xs">
                  View a detailed history of all security and administrative events in this workspace.
                </p>
                <Button variant="outline">View Full Log</Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
