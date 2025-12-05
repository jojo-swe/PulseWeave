'use client';

import { useState } from 'react';
import { X, Hash, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CreateChannelModalProps {
  onClose: () => void;
  onCreate: (name: string, description: string, isPrivate: boolean) => Promise<void>;
}

export function CreateChannelModal({ onClose, onCreate }: CreateChannelModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate name
    const cleanName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (!cleanName || cleanName.length < 2) {
      setError('Channel name must be at least 2 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await onCreate(cleanName, description, isPrivate);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create channel');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70" onClick={onClose}>
      <div 
        className="relative w-full max-w-md rounded-xl glass-card p-6 shadow-2xl mx-4 animate-in scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Create a channel</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Channel Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Name
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                {isPrivate ? <Lock className="h-4 w-4" /> : <Hash className="h-4 w-4" />}
              </span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. marketing"
                className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 pl-10 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                autoFocus
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Lowercase letters, numbers, and dashes only
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Description <span className="text-gray-500">(optional)</span>
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What's this channel about?"
              className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>

          {/* Private toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-gray-800 border border-gray-700">
            <div className="flex items-center gap-3">
              <div className={cn(
                'flex h-10 w-10 items-center justify-center rounded-lg',
                isPrivate ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-gray-400'
              )}>
                {isPrivate ? <Lock className="h-5 w-5" /> : <Hash className="h-5 w-5" />}
              </div>
              <div>
                <p className="text-sm font-medium text-white">Make private</p>
                <p className="text-xs text-gray-500">
                  {isPrivate 
                    ? 'Only invited members can see this channel' 
                    : 'Anyone in the workspace can join'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className={cn(
                'relative h-6 w-11 rounded-full transition-colors',
                isPrivate ? 'bg-purple-500' : 'bg-gray-600'
              )}
            >
              <span
                className={cn(
                  'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform',
                  isPrivate ? 'left-6' : 'left-1'
                )}
              />
            </button>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading ? 'Creating...' : 'Create Channel'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
