'use client';

import { useState } from 'react';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  X,
  FolderPlus,
  Folder,
  Trash2,
  Edit2,
  Check,
  Loader2,
  GripVertical,
  ChevronDown,
  ChevronRight,
  Hash,
} from 'lucide-react';

interface CategoryManagerProps {
  onClose: () => void;
}

/**
 * Modal for managing channel categories.
 */
export function CategoryManager({ onClose }: CategoryManagerProps) {
  const { token, currentWorkspace, categories, setCategories, channels } = useStore();
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !currentWorkspace) return;

    setLoading(true);
    setError('');

    try {
      const category = await api.categories.create(
        { name: newCategoryName.trim(), workspaceId: currentWorkspace.id },
        token!
      );
      setCategories([...categories, { ...category, channels: [] }]);
      setNewCategoryName('');
    } catch (err: any) {
      setError(err.message || 'Failed to create category');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateCategory = async (id: string) => {
    if (!editingName.trim()) return;

    setLoading(true);
    setError('');

    try {
      await api.categories.update(id, { name: editingName.trim() }, token!);
      setCategories(
        categories.map((c) =>
          c.id === id ? { ...c, name: editingName.trim() } : c
        )
      );
      setEditingId(null);
      setEditingName('');
    } catch (err: any) {
      setError(err.message || 'Failed to update category');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Are you sure? Channels will be moved to uncategorized.')) return;

    setLoading(true);
    setError('');

    try {
      await api.categories.delete(id, token!);
      setCategories(categories.filter((c) => c.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete category');
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (category: { id: string; name: string }) => {
    setEditingId(category.id);
    setEditingName(category.name);
  };

  // Get uncategorized channels
  const uncategorizedChannels = channels.filter(
    (c) => !c.categoryId || !categories.some((cat) => cat.id === c.categoryId)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card rounded-2xl border shadow-2xl p-6 mx-4 max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Folder className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Manage Categories</h2>
              <p className="text-sm text-muted-foreground">Organize your channels</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm mb-4">
            {error}
          </div>
        )}

        {/* Create new category */}
        <div className="flex gap-2 mb-6">
          <Input
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name..."
            onKeyDown={(e) => e.key === 'Enter' && handleCreateCategory()}
          />
          <Button onClick={handleCreateCategory} disabled={loading || !newCategoryName.trim()}>
            <FolderPlus className="h-4 w-4 mr-2" />
            Add
          </Button>
        </div>

        {/* Categories list */}
        <div className="flex-1 overflow-y-auto space-y-2">
          {categories.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Folder className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No categories yet</p>
              <p className="text-sm">Create one to organize your channels</p>
            </div>
          ) : (
            categories.map((category) => (
              <div
                key={category.id}
                className="p-3 rounded-lg bg-muted/30 border border-border/50"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  
                  {editingId === category.id ? (
                    <div className="flex-1 flex gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleUpdateCategory(category.id);
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="h-8"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleUpdateCategory(category.id)}
                        disabled={loading}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Folder className="h-4 w-4 text-primary" />
                      <span className="flex-1 font-medium">{category.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {category.channels?.length || 0} channels
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => startEditing(category)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteCategory(category.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>

                {/* Channels in category */}
                {category.channels && category.channels.length > 0 && (
                  <div className="mt-2 pl-6 space-y-1">
                    {category.channels.map((channel) => (
                      <div
                        key={channel.id}
                        className="flex items-center gap-2 text-sm text-muted-foreground py-1"
                      >
                        <Hash className="h-3 w-3" />
                        <span>{channel.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}

          {/* Uncategorized channels */}
          {uncategorizedChannels.length > 0 && (
            <div className="p-3 rounded-lg bg-muted/20 border border-dashed border-border/50">
              <div className="flex items-center gap-2 text-muted-foreground mb-2">
                <Folder className="h-4 w-4" />
                <span className="font-medium">Uncategorized</span>
                <span className="text-xs">({uncategorizedChannels.length})</span>
              </div>
              <div className="pl-6 space-y-1">
                {uncategorizedChannels.map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center gap-2 text-sm text-muted-foreground py-1"
                  >
                    <Hash className="h-3 w-3" />
                    <span>{channel.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-4 border-t border-border/50">
          <Button variant="outline" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
