import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '@pulseweave/database';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler, Errors } from '../middleware/error-handler';
import { validate } from '../middleware/validate';

const router = Router();

/**
 * Schema for creating a category.
 */
const createCategorySchema = z.object({
  name: z.string().min(1).max(50),
  workspaceId: z.string(),
});

/**
 * Schema for updating a category.
 */
const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  position: z.number().int().min(0).optional(),
  isCollapsed: z.boolean().optional(),
});

/**
 * Get all categories for a workspace.
 */
router.get('/workspace/:workspaceId', asyncHandler(async (req: AuthRequest, res) => {
  const { workspaceId } = req.params;

  // Verify user is a member of the workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId,
      },
    },
  });

  if (!membership) {
    throw Errors.forbidden('Not a member of this workspace');
  }

  const categories = await prisma.channelCategory.findMany({
    where: { workspaceId },
    include: {
      channels: {
        orderBy: { position: 'asc' },
        select: {
          id: true,
          name: true,
          isPrivate: true,
          position: true,
        },
      },
    },
    orderBy: { position: 'asc' },
  });

  res.json(categories);
}));

/**
 * Create a new category.
 */
router.post('/', validate(createCategorySchema), asyncHandler(async (req: AuthRequest, res) => {
  const { name, workspaceId } = req.body;

  // Verify user is admin/owner of the workspace
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId,
      },
    },
  });

  if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
    throw Errors.forbidden('Only admins can create categories');
  }

  // Get max position
  const maxPosition = await prisma.channelCategory.aggregate({
    where: { workspaceId },
    _max: { position: true },
  });

  const category = await prisma.channelCategory.create({
    data: {
      name,
      workspaceId,
      position: (maxPosition._max.position ?? -1) + 1,
    },
    include: {
      channels: true,
    },
  });

  res.status(201).json(category);
}));

/**
 * Update a category.
 */
router.patch('/:id', validate(updateCategorySchema), asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { name, position, isCollapsed } = req.body;

  const category = await prisma.channelCategory.findUnique({
    where: { id },
  });

  if (!category) {
    throw Errors.notFound('Category');
  }

  // Verify user is admin/owner
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId: category.workspaceId,
      },
    },
  });

  if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
    throw Errors.forbidden('Only admins can update categories');
  }

  const updated = await prisma.channelCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(position !== undefined && { position }),
      ...(isCollapsed !== undefined && { isCollapsed }),
    },
    include: {
      channels: true,
    },
  });

  res.json(updated);
}));

/**
 * Delete a category.
 */
router.delete('/:id', asyncHandler(async (req: AuthRequest, res) => {
  const { id } = req.params;

  const category = await prisma.channelCategory.findUnique({
    where: { id },
  });

  if (!category) {
    throw Errors.notFound('Category');
  }

  // Verify user is admin/owner
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId: category.workspaceId,
      },
    },
  });

  if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
    throw Errors.forbidden('Only admins can delete categories');
  }

  // Move channels to uncategorized (null categoryId)
  await prisma.channel.updateMany({
    where: { categoryId: id },
    data: { categoryId: null },
  });

  await prisma.channelCategory.delete({
    where: { id },
  });

  res.json({ success: true });
}));

/**
 * Move a channel to a category.
 */
router.post('/:id/channels/:channelId', asyncHandler(async (req: AuthRequest, res) => {
  const { id, channelId } = req.params;
  const { position } = req.body;

  const category = await prisma.channelCategory.findUnique({
    where: { id },
  });

  if (!category) {
    throw Errors.notFound('Category');
  }

  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
  });

  if (!channel || channel.workspaceId !== category.workspaceId) {
    throw Errors.notFound('Channel');
  }

  // Verify user is admin/owner
  const membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: req.userId!,
        workspaceId: category.workspaceId,
      },
    },
  });

  if (!membership || !['admin', 'owner'].includes(membership.roleName)) {
    throw Errors.forbidden('Only admins can move channels');
  }

  const updated = await prisma.channel.update({
    where: { id: channelId },
    data: {
      categoryId: id,
      position: position ?? 0,
    },
  });

  res.json(updated);
}));

export default router;
