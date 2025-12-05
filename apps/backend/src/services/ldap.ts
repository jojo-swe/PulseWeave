import { Client, SearchOptions } from 'ldapts';
import { prisma } from '@pulseweave/database';

/**
 * LDAP configuration from environment variables.
 */
const LDAP_CONFIG = {
  url: process.env.LDAP_URL || 'ldap://localhost:389',
  bindDN: process.env.LDAP_BIND_DN || 'cn=admin,dc=example,dc=com',
  bindPassword: process.env.LDAP_BIND_PASSWORD || '',
  searchBase: process.env.LDAP_SEARCH_BASE || 'dc=example,dc=com',
  searchFilter: process.env.LDAP_SEARCH_FILTER || '(uid={{username}})',
  usernameAttribute: process.env.LDAP_USERNAME_ATTR || 'uid',
  emailAttribute: process.env.LDAP_EMAIL_ATTR || 'mail',
  displayNameAttribute: process.env.LDAP_DISPLAY_NAME_ATTR || 'cn',
  groupSearchBase: process.env.LDAP_GROUP_SEARCH_BASE || '',
  groupSearchFilter: process.env.LDAP_GROUP_SEARCH_FILTER || '(member={{dn}})',
  adminGroup: process.env.LDAP_ADMIN_GROUP || 'cn=admins,ou=groups,dc=example,dc=com',
  enabled: process.env.LDAP_ENABLED === 'true',
  tlsOptions: {
    rejectUnauthorized: process.env.LDAP_TLS_REJECT_UNAUTHORIZED !== 'false',
  },
};

/**
 * LDAP user attributes from directory.
 */
interface LdapUserAttributes {
  dn: string;
  username: string;
  email: string;
  displayName: string;
  groups?: string[];
}

/**
 * Checks if LDAP authentication is enabled.
 */
export function isLdapEnabled(): boolean {
  return LDAP_CONFIG.enabled;
}

/**
 * Gets the LDAP configuration (safe for frontend).
 */
export function getLdapConfig() {
  return {
    enabled: LDAP_CONFIG.enabled,
    url: LDAP_CONFIG.url,
    searchBase: LDAP_CONFIG.searchBase,
  };
}

/**
 * Creates an LDAP client.
 */
function createClient(): Client {
  return new Client({
    url: LDAP_CONFIG.url,
    tlsOptions: LDAP_CONFIG.tlsOptions,
  });
}

/**
 * Authenticates a user against LDAP.
 * @param username - The username to authenticate
 * @param password - The password to verify
 * @returns User attributes if successful, null otherwise
 */
export async function authenticateLdap(
  username: string,
  password: string
): Promise<LdapUserAttributes | null> {
  if (!LDAP_CONFIG.enabled) {
    throw new Error('LDAP authentication is not enabled');
  }

  const client = createClient();

  try {
    // First, bind with service account to search for user
    await client.bind(LDAP_CONFIG.bindDN, LDAP_CONFIG.bindPassword);

    // Search for the user
    const searchFilter = LDAP_CONFIG.searchFilter.replace('{{username}}', username);
    const searchOptions: SearchOptions = {
      filter: searchFilter,
      scope: 'sub',
      attributes: [
        LDAP_CONFIG.usernameAttribute,
        LDAP_CONFIG.emailAttribute,
        LDAP_CONFIG.displayNameAttribute,
        'dn',
      ],
    };

    const { searchEntries } = await client.search(LDAP_CONFIG.searchBase, searchOptions);

    if (searchEntries.length === 0) {
      console.log(`LDAP: User not found: ${username}`);
      return null;
    }

    const userEntry = searchEntries[0];
    const userDN = userEntry.dn;

    // Unbind service account
    await client.unbind();

    // Try to bind as the user to verify password
    const userClient = createClient();
    try {
      await userClient.bind(userDN, password);
      await userClient.unbind();
    } catch (bindError) {
      console.log(`LDAP: Invalid password for user: ${username}`);
      return null;
    }

    // Extract user attributes
    const userAttributes: LdapUserAttributes = {
      dn: userDN,
      username: String(userEntry[LDAP_CONFIG.usernameAttribute] || username),
      email: String(userEntry[LDAP_CONFIG.emailAttribute] || `${username}@ldap.local`),
      displayName: String(userEntry[LDAP_CONFIG.displayNameAttribute] || username),
    };

    // Optionally fetch group memberships
    if (LDAP_CONFIG.groupSearchBase) {
      userAttributes.groups = await getUserGroups(userDN);
    }

    return userAttributes;
  } catch (error) {
    console.error('LDAP authentication error:', error);
    throw new Error('LDAP authentication failed');
  } finally {
    try {
      await client.unbind();
    } catch {
      // Ignore unbind errors
    }
  }
}

/**
 * Gets the groups a user belongs to.
 * @param userDN - The user's distinguished name
 * @returns Array of group DNs
 */
async function getUserGroups(userDN: string): Promise<string[]> {
  if (!LDAP_CONFIG.groupSearchBase) {
    return [];
  }

  const client = createClient();
  const groups: string[] = [];

  try {
    await client.bind(LDAP_CONFIG.bindDN, LDAP_CONFIG.bindPassword);

    const searchFilter = LDAP_CONFIG.groupSearchFilter.replace('{{dn}}', userDN);
    const { searchEntries } = await client.search(LDAP_CONFIG.groupSearchBase, {
      filter: searchFilter,
      scope: 'sub',
      attributes: ['dn', 'cn'],
    });

    for (const entry of searchEntries) {
      groups.push(entry.dn);
    }
  } catch (error) {
    console.error('LDAP group search error:', error);
  } finally {
    try {
      await client.unbind();
    } catch {
      // Ignore unbind errors
    }
  }

  return groups;
}

/**
 * Checks if a user is an LDAP admin.
 * @param groups - Array of group DNs
 * @returns True if user is in admin group
 */
export function isLdapAdmin(groups: string[]): boolean {
  return groups.includes(LDAP_CONFIG.adminGroup);
}

/**
 * Synchronizes an LDAP user to the local database.
 * Creates or updates the user based on LDAP attributes.
 * @param ldapUser - LDAP user attributes
 * @returns The local user record
 */
export async function syncLdapUser(ldapUser: LdapUserAttributes) {
  // Check if user exists by LDAP DN or email
  let user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: ldapUser.email },
        { username: ldapUser.username },
      ],
    },
  });

  if (user) {
    // Update existing user
    user = await prisma.user.update({
      where: { id: user.id },
      data: {
        email: ldapUser.email,
        displayName: ldapUser.displayName,
        isVerified: true, // LDAP users are pre-verified
        lastLoginAt: new Date(),
      },
    });
  } else {
    // Create new user (without password - LDAP auth only)
    user = await prisma.user.create({
      data: {
        email: ldapUser.email,
        username: ldapUser.username,
        displayName: ldapUser.displayName,
        passwordHash: '', // No local password for LDAP users
        isVerified: true,
        lastLoginAt: new Date(),
      },
    });

    // Auto-join default workspace if exists
    const defaultWorkspace = await prisma.workspace.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (defaultWorkspace) {
      // Determine role based on LDAP groups
      const isAdmin = ldapUser.groups ? isLdapAdmin(ldapUser.groups) : false;
      const roleName = isAdmin ? 'admin' : 'member';

      await prisma.workspaceMember.create({
        data: {
          userId: user.id,
          workspaceId: defaultWorkspace.id,
          roleName,
        },
      });

      // Join the general channel
      const generalChannel = await prisma.channel.findFirst({
        where: {
          workspaceId: defaultWorkspace.id,
          name: 'general',
        },
      });

      if (generalChannel) {
        await prisma.channelMember.create({
          data: {
            userId: user.id,
            channelId: generalChannel.id,
          },
        });
      }
    }
  }

  return user;
}

/**
 * Tests LDAP connection with the configured settings.
 * @returns Object with success status and error message if failed
 */
export async function testLdapConnection(): Promise<{
  success: boolean;
  error?: string;
  details?: {
    url: string;
    bindDN: string;
    searchBase: string;
  };
}> {
  if (!LDAP_CONFIG.enabled) {
    return { success: false, error: 'LDAP is not enabled' };
  }

  const client = createClient();

  try {
    await client.bind(LDAP_CONFIG.bindDN, LDAP_CONFIG.bindPassword);
    
    // Try a simple search to verify configuration
    const { searchEntries } = await client.search(LDAP_CONFIG.searchBase, {
      filter: '(objectClass=*)',
      scope: 'base',
      sizeLimit: 1,
    });

    await client.unbind();

    return {
      success: true,
      details: {
        url: LDAP_CONFIG.url,
        bindDN: LDAP_CONFIG.bindDN,
        searchBase: LDAP_CONFIG.searchBase,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || 'Failed to connect to LDAP server',
    };
  } finally {
    try {
      await client.unbind();
    } catch {
      // Ignore unbind errors
    }
  }
}

/**
 * Searches for users in LDAP directory.
 * @param query - Search query (partial username or email)
 * @returns Array of matching users
 */
export async function searchLdapUsers(query: string): Promise<LdapUserAttributes[]> {
  if (!LDAP_CONFIG.enabled) {
    return [];
  }

  const client = createClient();
  const users: LdapUserAttributes[] = [];

  try {
    await client.bind(LDAP_CONFIG.bindDN, LDAP_CONFIG.bindPassword);

    // Search with wildcard
    const searchFilter = `(|` +
      `(${LDAP_CONFIG.usernameAttribute}=*${query}*)` +
      `(${LDAP_CONFIG.emailAttribute}=*${query}*)` +
      `(${LDAP_CONFIG.displayNameAttribute}=*${query}*)` +
      `)`;

    const { searchEntries } = await client.search(LDAP_CONFIG.searchBase, {
      filter: searchFilter,
      scope: 'sub',
      attributes: [
        LDAP_CONFIG.usernameAttribute,
        LDAP_CONFIG.emailAttribute,
        LDAP_CONFIG.displayNameAttribute,
        'dn',
      ],
      sizeLimit: 50,
    });

    for (const entry of searchEntries) {
      users.push({
        dn: entry.dn,
        username: String(entry[LDAP_CONFIG.usernameAttribute] || ''),
        email: String(entry[LDAP_CONFIG.emailAttribute] || ''),
        displayName: String(entry[LDAP_CONFIG.displayNameAttribute] || ''),
      });
    }
  } catch (error) {
    console.error('LDAP search error:', error);
  } finally {
    try {
      await client.unbind();
    } catch {
      // Ignore unbind errors
    }
  }

  return users;
}
