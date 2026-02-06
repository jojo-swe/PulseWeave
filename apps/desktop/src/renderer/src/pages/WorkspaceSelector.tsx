import { useState, useEffect } from 'react';
import { Loader2, Plus, LogOut, ArrowRight, Globe, Users } from 'lucide-react';
import { useStore } from '../store';

interface Workspace {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  _count?: { members: number };
}

/**
 * Workspace selector shown after login when no workspace is active.
 * Lets the user pick, create, or join a workspace.
 */
export function WorkspaceSelector(): JSX.Element {
  const { serverUrl, token, user, setCurrentWorkspace, logout } = useStore();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [newName, setNewName] = useState('');
  const [joinSlug, setJoinSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadWorkspaces = async () => {
    try {
      const res = await fetch(`${serverUrl}/api/workspaces`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load workspaces');
      const data = await res.json();
      setWorkspaces(data.workspaces || data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) loadWorkspaces();
  }, [token]);

  const handleSelect = (ws: Workspace) => {
    setCurrentWorkspace({ id: ws.id, name: ws.name, slug: ws.slug, iconUrl: ws.iconUrl });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const slug = newName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const res = await fetch(`${serverUrl}/api/workspaces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), slug }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create workspace');
      }
      const ws = await res.json();
      handleSelect(ws);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinSlug.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${serverUrl}/api/workspaces/join/${joinSlug.trim()}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to join workspace');
      }
      const ws = await res.json();
      handleSelect(ws.workspace || ws);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = () => {
    logout();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading workspaces...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center p-8 bg-gradient-to-br from-background via-secondary to-background">
      <div className="w-full max-w-lg animate-fade-in">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 mb-4">
            <Globe className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Choose a Workspace</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back, <span className="text-foreground font-medium">{user?.displayName}</span>
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Workspace list */}
        {workspaces.length > 0 && !showCreate && !showJoin && (
          <div className="space-y-2 mb-6">
            {workspaces.map((ws) => (
              <button
                key={ws.id}
                onClick={() => handleSelect(ws)}
                className="w-full flex items-center gap-3 p-4 rounded-xl bg-card border border-border hover:border-primary/50 hover:bg-accent transition-all group"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                  {ws.iconUrl ? (
                    <img src={ws.iconUrl} alt="" className="w-full h-full rounded-lg object-cover" />
                  ) : (
                    ws.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="font-medium text-foreground truncate">{ws.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ws._count?.members ? `${ws._count.members} members` : ws.slug}
                  </p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </button>
            ))}
          </div>
        )}

        {/* Create workspace form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-6 p-4 rounded-xl bg-card border border-border animate-slide-up">
            <h3 className="font-medium text-foreground mb-3">Create a new workspace</h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Workspace name"
              autoFocus
              className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowCreate(false); setNewName(''); setError(''); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-foreground hover:bg-accent transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newName.trim() || submitting}
                className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
            </div>
          </form>
        )}

        {/* Join workspace form */}
        {showJoin && (
          <form onSubmit={handleJoin} className="mb-6 p-4 rounded-xl bg-card border border-border animate-slide-up">
            <h3 className="font-medium text-foreground mb-3">Join a workspace</h3>
            <input
              type="text"
              value={joinSlug}
              onChange={(e) => setJoinSlug(e.target.value)}
              placeholder="Workspace slug (e.g. my-team)"
              autoFocus
              className="w-full px-4 py-3 bg-secondary border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent mb-3"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setShowJoin(false); setJoinSlug(''); setError(''); }}
                className="flex-1 py-2.5 rounded-xl border border-border text-foreground hover:bg-accent transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!joinSlug.trim() || submitting}
                className="flex-1 py-2.5 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Join
              </button>
            </div>
          </form>
        )}

        {/* Action buttons */}
        {!showCreate && !showJoin && (
          <div className="flex gap-2 mb-6">
            <button
              onClick={() => setShowCreate(true)}
              className="flex-1 py-2.5 rounded-xl border border-border text-foreground hover:bg-accent transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Create workspace
            </button>
            <button
              onClick={() => setShowJoin(true)}
              className="flex-1 py-2.5 rounded-xl border border-border text-foreground hover:bg-accent transition-colors text-sm font-medium flex items-center justify-center gap-2"
            >
              <Users className="w-4 h-4" />
              Join workspace
            </button>
          </div>
        )}

        {/* Empty state */}
        {workspaces.length === 0 && !showCreate && !showJoin && (
          <p className="text-center text-muted-foreground text-sm mb-6">
            You don't belong to any workspaces yet. Create one or ask your admin for an invite.
          </p>
        )}

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors py-2"
        >
          <LogOut className="w-4 h-4" />
          Sign out
        </button>
      </div>
    </div>
  );
}
