'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/store';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, Check, LogIn, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from '@/components/ui/toast';
import { getInitials, generateAvatarColor } from '@/lib/utils';

interface WorkspaceInfo {
  id: string;
  name: string;
  slug: string;
  iconUrl?: string;
  memberCount: number;
  isMember: boolean;
}

export default function JoinWorkspacePage({ params }: { params: { slug: string } }) {
  const router = useRouter();
  const { token, user, workspaces, setWorkspaces, setCurrentWorkspace } = useStore();
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWorkspace = async () => {
      try {
        const data = await api.workspaces.getBySlug(params.slug, token || undefined);
        setWorkspace(data);
      } catch (err: any) {
        setError(err.message || 'Workspace not found');
      } finally {
        setLoading(false);
      }
    };

    fetchWorkspace();
  }, [params.slug, token]);

  const handleJoin = async () => {
    if (!token || !workspace) return;

    setJoining(true);
    try {
      const result = await api.workspaces.joinBySlug(params.slug, token);
      
      if (result.alreadyMember) {
        toast.info('You are already a member of this workspace');
      } else {
        toast.success('Joined workspace successfully!');
        // Add to local workspaces list
        setWorkspaces([...workspaces, result.workspace]);
      }
      
      // Navigate to the workspace
      setCurrentWorkspace(result.workspace);
      router.push(`/chat/${result.workspace.id}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to join workspace');
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="text-6xl">🔍</div>
          <h1 className="text-2xl font-bold">Workspace Not Found</h1>
          <p className="text-muted-foreground">
            {error || 'The workspace you are looking for does not exist or the invite link has expired.'}
          </p>
          <Button asChild>
            <Link href="/chat">Go to Chat</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-indigo-950/30 p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Workspace Card */}
        <div className="bg-card border rounded-2xl shadow-xl p-8 text-center space-y-6 animate-in fade-in zoom-in-95">
          {/* Workspace Icon */}
          <div className="mx-auto">
            <Avatar className="h-20 w-20 mx-auto border-4 border-primary/20">
              {workspace.iconUrl ? (
                <AvatarImage src={workspace.iconUrl} />
              ) : null}
              <AvatarFallback className={`text-2xl ${generateAvatarColor(workspace.name)}`}>
                {getInitials(workspace.name)}
              </AvatarFallback>
            </Avatar>
          </div>

          {/* Workspace Info */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{workspace.name}</h1>
            <p className="text-muted-foreground flex items-center justify-center gap-2">
              <Users className="h-4 w-4" />
              {workspace.memberCount} {workspace.memberCount === 1 ? 'member' : 'members'}
            </p>
          </div>

          {/* Action */}
          {!user ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You need to sign in to join this workspace
              </p>
              <div className="flex gap-3 justify-center">
                <Button asChild variant="outline">
                  <Link href={`/login?redirect=/join/${params.slug}`}>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign In
                  </Link>
                </Button>
                <Button asChild>
                  <Link href={`/register?redirect=/join/${params.slug}`}>
                    Create Account
                  </Link>
                </Button>
              </div>
            </div>
          ) : workspace.isMember ? (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-2 text-green-500">
                <Check className="h-5 w-5" />
                <span className="font-medium">You&apos;re already a member!</span>
              </div>
              <Button asChild className="w-full">
                <Link href={`/chat/${workspace.id}`}>
                  Open Workspace
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                You&apos;ve been invited to join this workspace
              </p>
              <Button 
                onClick={handleJoin} 
                disabled={joining}
                className="w-full"
                size="lg"
              >
                {joining ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Joining...
                  </>
                ) : (
                  <>
                    <Users className="h-4 w-4 mr-2" />
                    Join Workspace
                  </>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          <Link href="/chat" className="text-primary hover:underline">
            Back to Chat
          </Link>
        </p>
      </div>
    </div>
  );
}
