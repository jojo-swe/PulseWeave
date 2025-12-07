import { prisma } from '@pulseweave/database';

/**
 * Checks if a user has admin access to a workspace.
 * Admin access is granted if the user is the workspace owner OR has admin/owner role.
 * @param userId - The user ID to check
 * @param workspaceId - The workspace ID to check access for
 * @returns True if user has admin access
 */
export async function hasAdminAccess(userId: string, workspaceId: string): Promise<boolean> {
  const [membership, workspace] = await Promise.all([
    prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: { userId, workspaceId },
      },
    }),
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true },
    }),
  ]);

  // Check if user is workspace owner
  if (workspace?.ownerId === userId) {
    return true;
  }

  // Check if user has admin or owner role
  if (membership && ['admin', 'owner'].includes(membership.roleName)) {
    return true;
  }

  return false;
}

/**
 * Checks if a user is a member of a workspace.
 * @param userId - The user ID to check
 * @param workspaceId - The workspace ID to check membership for
 * @returns True if user is a member
 */
export async function isWorkspaceMember(userId: string, workspaceId: string): Promise<boolean> {
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: { userId, workspaceId },
    },
  });

  return !!membership;
}
