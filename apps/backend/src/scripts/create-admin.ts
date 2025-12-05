import bcrypt from 'bcryptjs';
import { prisma } from '@pulseweave/database';

function usage() {
  console.log('Usage: pnpm --filter backend create:admin <email> <username> <password> [displayName] [workspaceName]');
  console.log('Example: pnpm --filter backend create:admin admin@example.com admin P@ssw0rd! "Admin User" "Default Workspace"');
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

  console.log('Ensuring admin user exists...');

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
    console.log(`Created user ${user.email}`);
  } else {
    console.log(`User already exists (${user.email}), ensuring admin role...`);
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
    console.log(`Created workspace "${workspace.name}"`);
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
    console.log('Created #general channel');
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

  console.log('✅ Admin user ensured:');
  console.log(`   Email: ${email}`);
  console.log(`   Username: ${username}`);
  console.log(`   Workspace: ${workspace.name} (role: owner)`);
}

main()
  .catch((err) => {
    console.error('Failed to create admin user:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
