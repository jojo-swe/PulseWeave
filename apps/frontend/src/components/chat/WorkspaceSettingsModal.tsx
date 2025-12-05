'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Copy, Check, Users, Settings, Link2 } from 'lucide-react';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';

interface WorkspaceSettingsModalProps {
  onClose: () => void;
}

export function WorkspaceSettingsModal({ onClose }: WorkspaceSettingsModalProps) {
  const { currentWorkspace, token, members, setCurrentWorkspace } = useStore();
  const [activeTab, setActiveTab] = useState<'general' | 'members' | 'invite'>('general');
  const [name, setName] = useState(currentWorkspace?.name || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const inviteLink = `${window.location.origin}/join/${currentWorkspace?.slug}`;

  const handleSave = async () => {
    if (!token || !currentWorkspace || !name.trim()) return;
    
    setSaving(true);
    try {
      const updated = await api.workspaces.update(currentWorkspace.id, { name: name.trim() }, token);
      setCurrentWorkspace(updated);
      onClose();
    } catch (error) {
      console.error('Failed to update workspace:', error);
    } finally {
      setSaving(false);
    }
  };

  const copyInviteLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'members', label: 'Members', icon: Users },
    { id: 'invite', label: 'Invite', icon: Link2 },
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
                onClick={() => setActiveTab(tab.id)}
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

                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </Button>
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
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50"
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
                      <span className={cn(
                        'text-xs px-2 py-1 rounded-full',
                        member.role === 'owner' 
                          ? 'bg-primary/10 text-primary' 
                          : 'bg-muted text-muted-foreground'
                      )}>
                        {member.role}
                      </span>
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
          </div>
        </div>
      </div>
    </div>
  );
}
