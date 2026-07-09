import bcrypt from 'bcryptjs';
import { prisma } from '@pulseweave/database';
import { logger } from '../utils/logger';

function usage() {
  logger.info('Usage: pnpm --filter backend create:admin <email> <username> <password> [displayName] [workspaceName]');
  logger.info('Example: pnpm --filter backend create:admin admin@example.com admin P@ssw0rd! "Admin User" "Default Workspace"');
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'workspace';
}

async function main() {
  const [email, username, password, displayNameArg, workspaceNameArg] = process.argv.slice(2);

  if (!email || !username || !password) {
    usage();
    process.exit(1);
  }

  const displayName = displayNameArg || username;
  const workspaceName = workspaceNameArg || "Default Workspace";
  const workspaceSlug = slugify(workspaceName);

  logger.info('Ensuring admin user exists...');

  // Find or create user
  let user = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });

  if (!user) {
    const passwordHash = await bcrypt.hash(password, 12);
    user = await prisma.user.create({
      data: {
        email,
        username,
        displayName,
        passwordHash,
        isVerified: true,
        isActive: true,
        status: 'online',
      },
    });
    logger.info(`Created user ${user.email}`);
  } else {
    logger.info(`User already exists (${user.email}), ensuring admin role...`);
  }

  // Find or create workspace
  let workspace = await prisma.workspace.findFirst({
    where: { slug: workspaceSlug },
  });

  if (!workspace) {
    workspace = await prisma.workspace.create({
      data: {
        name: workspaceName,
        slug: workspaceSlug,
        ownerId: user.id,
      },
    });
    logger.info(`Created workspace "${workspace.name}"`);
  }

  // Ensure membership as owner
  await prisma.workspaceMember.upsert({
    where: {
      userId_workspaceId: {
        userId: user.id,
        workspaceId: workspace.id,
      },
    },
    create: {
      userId: user.id,
      workspaceId: workspace.id,
      roleName: 'owner',
    },
    update: {
      roleName: 'owner',
    },
  });

  // Ensure #general channel and membership
  let channel = await prisma.channel.findFirst({
    where: { workspaceId: workspace.id, name: 'general' },
  });

  if (!channel) {
    channel = await prisma.channel.create({
      data: {
        name: 'general',
        description: 'General discussion',
        workspaceId: workspace.id,
        createdById: user.id,
        isPrivate: false,
      },
    });
    logger.info('Created #general channel');
  }

  await prisma.channelMember.upsert({
    where: {
      userId_channelId: {
        userId: user.id,
        channelId: channel.id,
      },
    },
    create: {
      userId: user.id,
      channelId: channel.id,
    },
    update: {},
  });

  logger.info('✅ Admin user ensured:');
  logger.info(`   Email: ${email}`);
  logger.info(`   Username: ${username}`);
  logger.info(`   Workspace: ${workspace.name} (role: owner)`);
}

main()
  .catch((err) => {
    logger.error('Failed to create admin user:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
