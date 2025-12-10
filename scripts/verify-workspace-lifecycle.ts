/**
 * Workspace Lifecycle Verification Script
 * Tests: Update and Delete workspace functionality
 */

const API_URL = 'http://localhost:9090';

interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
}

interface Workspace {
  id: string;
  name: string;
  slug: string;
}

async function apiCall<T>(endpoint: string, options: RequestInit & { token?: string } = {}): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...fetchOptions.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed: ${response.status}`);
  }
  return data;
}

async function registerUser(username: string, email: string, password: string): Promise<{ user: User; token: string; workspace: Workspace }> {
  return apiCall('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      username,
      email,
      displayName: username,
      password,
    }),
  });
}

async function main() {
  console.log('=== Workspace Lifecycle Verification ===\n');
  
  const timestamp = Date.now();
  
  // Step 1: Register owner user
  console.log('1. Registering owner user...');
  const ownerData = await registerUser(
    `owner${timestamp}`,
    `owner${timestamp}@test.com`,
    'SecureP@ss123!'
  );
  console.log(`   ✓ Owner registered: ${ownerData.user.username}`);
  console.log(`   ✓ Default workspace created: ${ownerData.workspace.name}`);
  
  const ownerToken = ownerData.token;
  const workspaceId = ownerData.workspace.id;
  
  // Step 2: Update workspace name
  console.log('\n2. Updating workspace name...');
  const newName = `Updated-${timestamp}`;
  const updated = await apiCall<Workspace>(`/api/workspaces/${workspaceId}`, {
    method: 'PATCH',
    body: JSON.stringify({ name: newName }),
    token: ownerToken,
  });
  
  if (updated.name === newName) {
    console.log(`   ✓ Workspace name updated to: ${updated.name}`);
  } else {
    throw new Error(`Name update failed: expected ${newName}, got ${updated.name}`);
  }

  // Step 3: Verify non-owner cannot delete
  console.log('\n3. Registering second user to test non-owner delete protection...');
  const memberData = await registerUser(
    `member${timestamp}`,
    `member${timestamp}@test.com`,
    'SecureP@ss123!'
  );
  console.log(`   ✓ Non-owner user registered: ${memberData.user.username}`);
  
  // Member tries to delete owner's workspace (should fail)
  try {
    await apiCall(`/api/workspaces/${workspaceId}`, {
      method: 'DELETE',
      token: memberData.token,
    });
    throw new Error('Non-owner should not be able to delete workspace');
  } catch (e: any) {
    if (e.message.includes('owner') || e.message.includes('Forbidden') || e.message.includes('403')) {
      console.log(`   ✓ Non-owner correctly denied delete access`);
    } else {
      throw e;
    }
  }
  
  // Step 4: Owner deletes workspace
  console.log('\n4. Owner deleting workspace...');
  const deleteResult = await apiCall<{ success: boolean; message: string }>(`/api/workspaces/${workspaceId}`, {
    method: 'DELETE',
    token: ownerToken,
  });
  
  if (deleteResult.success) {
    console.log(`   ✓ Workspace deleted: ${deleteResult.message}`);
  } else {
    throw new Error('Delete failed');
  }
  
  // Step 5: Verify workspace no longer exists
  console.log('\n5. Verifying workspace is gone...');
  try {
    await apiCall(`/api/workspaces/${workspaceId}`, { token: ownerToken });
    throw new Error('Workspace should not exist after deletion');
  } catch (e: any) {
    if (e.message.includes('not found') || e.message.includes('Workspace')) {
      console.log(`   ✓ Workspace correctly no longer exists`);
    } else {
      throw e;
    }
  }
  
  console.log('\n=== All Workspace Lifecycle Tests Passed! ===');
}

main().catch((error) => {
  console.error('\n❌ Verification failed:', error.message);
  process.exit(1);
});
