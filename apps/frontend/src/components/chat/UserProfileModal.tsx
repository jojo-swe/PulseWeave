'use client';

import { useState, useRef } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn, getInitials, generateAvatarColor } from '@/lib/utils';
import { 
  X, 
  Camera, 
  Check, 
  Circle,
  Clock,
  MinusCircle,
  Moon,
} from 'lucide-react';

interface UserProfileModalProps {
  onClose: () => void;
}

const STATUS_OPTIONS = [
  { value: 'online', label: 'Active', icon: Circle, color: 'text-green-500 fill-green-500' },
  { value: 'away', label: 'Away', icon: Clock, color: 'text-yellow-500' },
  { value: 'dnd', label: 'Do not disturb', icon: MinusCircle, color: 'text-red-500' },
  { value: 'offline', label: 'Invisible', icon: Moon, color: 'text-gray-500' },
];

export function UserProfileModal({ onClose }: UserProfileModalProps) {
  const { user, token, setUser } = useStore();
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [status, setStatus] = useState(user?.status || 'online');
  const [statusText, setStatusText] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [loading, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Image must be less than 5MB');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    if (!token) return;
    
    setSaving(true);
    setError('');
    setSuccess(false);

    try {
      // Update user profile via API
      const updated = await api.users.update({
        displayName,
        status,
        avatarUrl: avatarPreview || undefined,
      }, token);
      
      setUser({ ...user!, ...updated });
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg rounded-xl border border-gray-700 bg-gray-900 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-lg font-semibold text-white">Edit Profile</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="p-6 space-y-6">
          {/* Avatar Section */}
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Avatar className="h-24 w-24">
                <AvatarImage src={avatarPreview || user?.avatarUrl} />
                <AvatarFallback className={cn('text-2xl', generateAvatarColor(user?.displayName || ''))}>
                  {getInitials(user?.displayName || 'U')}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Camera className="h-6 w-6 text-white" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarChange}
                className="hidden"
              />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">{user?.displayName}</h3>
              <p className="text-gray-400">@{user?.username}</p>
              <p className="text-sm text-gray-500 mt-1">{user?.email}</p>
            </div>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Display Name
            </label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How should we call you?"
              className="bg-gray-800 border-gray-600"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {STATUS_OPTIONS.map((option) => {
                const Icon = option.icon;
                return (
                  <button
                    key={option.value}
                    onClick={() => setStatus(option.value)}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors',
                      status === option.value
                        ? 'border-purple-500 bg-purple-500/10'
                        : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                    )}
                  >
                    <Icon className={cn('h-4 w-4', option.color)} />
                    <span className="text-sm text-white">{option.label}</span>
                    {status === option.value && (
                      <Check className="h-4 w-4 text-purple-400 ml-auto" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Status Text */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Status Message <span className="text-gray-500">(optional)</span>
            </label>
            <Input
              value={statusText}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="What's on your mind?"
              className="bg-gray-800 border-gray-600"
              maxLength={100}
            />
          </div>

          {/* Error/Success Messages */}
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm flex items-center gap-2">
              <Check className="h-4 w-4" />
              Profile updated successfully!
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-700 bg-gray-800/50">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !displayName.trim()}>
            {loading ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}
