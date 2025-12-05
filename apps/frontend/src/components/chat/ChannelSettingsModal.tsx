'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Trash2, AlertTriangle } from 'lucide-react';

interface ChannelSettingsModalProps {
  onClose: () => void;
}

export function ChannelSettingsModal({ onClose }: ChannelSettingsModalProps) {
  const { currentChannel, token, setCurrentChannel, channels, setChannels } = useStore();
  const [name, setName] = useState(currentChannel?.name || '');
  const [description, setDescription] = useState(currentChannel?.description || '');
  const [isPrivate, setIsPrivate] = useState(currentChannel?.isPrivate || false);
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleSave = async () => {
    if (!token || !currentChannel || !name.trim()) return;
    
    setSaving(true);
    try {
      const updated = await api.channels.update(currentChannel.id, {
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate,
      }, token);
      
      // Update channels list
      setChannels(channels.map(c => c.id === updated.id ? updated : c));
      setCurrentChannel(updated);
      onClose();
    } catch (error) {
      console.error('Failed to update channel:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!token || !currentChannel) return;
    
    setDeleting(true);
    try {
      await api.channels.delete(currentChannel.id, token);
      
      // Remove from channels list and clear current
      setChannels(channels.filter(c => c.id !== currentChannel.id));
      setCurrentChannel(null);
      onClose();
    } catch (error) {
      console.error('Failed to delete channel:', error);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div 
        className="bg-background rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Channel Settings</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {showDeleteConfirm ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-destructive/10 rounded-lg">
                <AlertTriangle className="h-6 w-6 text-destructive shrink-0" />
                <div>
                  <p className="font-medium">Delete #{currentChannel?.name}?</p>
                  <p className="text-sm text-muted-foreground">
                    This action cannot be undone. All messages will be permanently deleted.
                  </p>
                </div>
              </div>
              
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={handleDelete}
                  disabled={deleting}
                >
                  {deleting ? 'Deleting...' : 'Delete Channel'}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="channel-name">Channel Name</Label>
                <Input
                  id="channel-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5"
                  placeholder="general"
                />
              </div>

              <div>
                <Label htmlFor="channel-description">Description (optional)</Label>
                <Input
                  id="channel-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="mt-1.5"
                  placeholder="What's this channel about?"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="private-toggle">Private Channel</Label>
                  <p className="text-sm text-muted-foreground">
                    Only invited members can see this channel
                  </p>
                </div>
                <Switch
                  id="private-toggle"
                  checked={isPrivate}
                  onCheckedChange={setIsPrivate}
                />
              </div>

              <div className="flex items-center justify-between pt-4 border-t">
                <Button 
                  variant="ghost" 
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Channel
                </Button>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={saving || !name.trim()}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
