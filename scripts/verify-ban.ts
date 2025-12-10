


const API_URL = 'http://localhost:9090';

async function verify() {
  console.log('🚀 Starting Verification: Advanced Role Management');

  try {
    // 1. Register Owner
    const ownerEmail = `owner-${Date.now()}@test.com`;
    console.log(`\n1️⃣ Registering Owner: ${ownerEmail}`);
    const ownerRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: ownerEmail,
        username: `owner${Date.now()}`,
        displayName: 'Owner User',
        password: 'Password123!'
      })
    });
    
    if (!ownerRes.ok) throw new Error(`Owner registration failed: ${await ownerRes.text()}`);
    const ownerData = await ownerRes.json();
    const ownerToken = ownerData.token;
    console.log('✅ Owner Registered');

    // 2. Create Workspace
    console.log('\n2️⃣ Creating Workspace');
    const wsRes = await fetch(`${API_URL}/api/workspaces`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ownerToken}`
      },
      body: JSON.stringify({
        name: 'Ban Test Workspace',
        slug: `ban-test-${Date.now()}`
      })
    });

    if (!wsRes.ok) throw new Error(`Workspace creation failed: ${await wsRes.text()}`);
    const workspace = await wsRes.json();
    console.log(`✅ Workspace Created: ${workspace.name} (${workspace.id})`);

    // 3. Register Victim
    const victimEmail = `victim-${Date.now()}@test.com`;
    console.log(`\n3️⃣ Registering Victim: ${victimEmail}`);
    const victimRes = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: victimEmail,
        username: `victim${Date.now()}`,
        displayName: 'Victim User',
        password: 'Password123!'
      })
    });

    if (!victimRes.ok) throw new Error(`Victim registration failed: ${await victimRes.text()}`);
    const victimData = await victimRes.json();
    console.log('✅ Victim Registered');

    // 4. Add Victim to Workspace (as Owner)
    console.log('\n4️⃣ Adding Victim to Workspace');
    // Using admin endpoint to add user directly or invite-accept flow. 
    // Since we have both tokens, let's use the invite flow simulation or just add directly if endpoint exists.
    // The admin endpoint `POST /workspaces/:workspaceId/users` adds a NEW user.
    // To add an EXISTING user, we usually use invites.
    // Let's use the "Invite Link" flow simulation.
    // Actually, checking `admin.ts`: `POST /workspaces/:workspaceId/users` creates a user AND adds them.
    // We want to add an EXISTING user.
    // `workspaceRouter` has `POST /:workspaceId/join`.
    
    const joinRes = await fetch(`${API_URL}/api/workspaces/${workspace.id}/join`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${victimData.token}`
        },
        body: JSON.stringify({
            token: 'dummy-token-if-public-or-invite' // Assuming public or owner can just add. 
            // Wait, existing logic might require invite code.
            // Let's look at `workspace.ts` to be sure. 
            // Workaround: Use the `admin` endpoint to CREATE the victim directly in the workspace instead of registering separately.
        })
    });
    
    // RE-PLAN 3 & 4: Create victim via Admin Endpoint (easier)
    // Actually, let's try the Admin Create User endpoint.
    const victim2Email = `victim2-${Date.now()}@test.com`;
    console.log(`\n3️⃣/4️⃣ Creating & Adding Victim 2 via Admin API: ${victim2Email}`);
    const createRes = await fetch(`${API_URL}/api/admin/workspaces/${workspace.id}/users`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
            email: victim2Email,
            username: `victim2${Date.now()}`,
            displayName: 'Victim Two',
            password: 'password123',
            roleName: 'member'
        })
    });
    
    if (!createRes.ok) throw new Error(`Victim creation failed: ${await createRes.text()}`);
    const victim2Data = await createRes.json();
    const victimId = victim2Data.user.id;
    console.log(`✅ Victim Created & Added: ${victimId}`);


    // 5. Ban Victim
    console.log('\n5️⃣ Banning Victim');
    const banRes = await fetch(`${API_URL}/api/admin/workspaces/${workspace.id}/users/${victimId}/ban`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ownerToken}`
        },
        body: JSON.stringify({
            reason: 'Automated Test Ban',
            duration: 24
        })
    });

    if (!banRes.ok) throw new Error(`Ban failed: ${await banRes.text()}`);
    const banResult = await banRes.json();
    console.log('✅ Ban Successful:', banResult.message);


    // 6. Verify Status & Audit Log
    console.log('\n6️⃣ Verifying Ban Status & Audit Log');
    
    // Check User Status
    const userRes = await fetch(`${API_URL}/api/admin/workspaces/${workspace.id}/users/${victimId}`, {
        headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    const userData = await userRes.json();
    
    if (userData.isActive !== false) throw new Error('User isActive should be false');
    console.log('✅ User.isActive is false');
    
    // Check Audit Log
    const auditRes = await fetch(`${API_URL}/api/admin/workspaces/${workspace.id}/audit-log?limit=5`, {
        headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    const auditData = await auditRes.json();
    const banLog = auditData.logs.find((l: any) => l.action === 'USER_BANNED');
    
    if (!banLog) throw new Error('Audit log missing USER_BANNED entry');
    console.log('✅ Audit Log contains USER_BANNED');


    // 7. Unban Victim
    console.log('\n7️⃣ Unbanning Victim');
    const unbanRes = await fetch(`${API_URL}/api/admin/workspaces/${workspace.id}/users/${victimId}/unban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${ownerToken}` }
    });

    if (!unbanRes.ok) throw new Error(`Unban failed: ${await unbanRes.text()}`);
    console.log('✅ Unban Successful');


    // 8. Verify Unban
    console.log('\n8️⃣ Verifying Unban Status');
    const userRes2 = await fetch(`${API_URL}/api/admin/workspaces/${workspace.id}/users/${victimId}`, {
        headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    const userData2 = await userRes2.json();
    
    if (userData2.isActive !== true) throw new Error('User isActive should be true');
    console.log('✅ User.isActive is true');

    // Check Audit Log for Unban
    const auditRes2 = await fetch(`${API_URL}/api/admin/workspaces/${workspace.id}/audit-log?limit=5`, {
        headers: { 'Authorization': `Bearer ${ownerToken}` }
    });
    const auditData2 = await auditRes2.json();
    const unbanLog = auditData2.logs.find((l: any) => l.action === 'USER_UNBANNED');
    
    if (!unbanLog) throw new Error('Audit log missing USER_UNBANNED entry');
    console.log('✅ Audit Log contains USER_UNBANNED');
    
    console.log('\n🎉 ALL CHECKS PASSED');

  } catch (error) {
    console.error('\n❌ VERIFICATION FAILED:', error);
    process.exit(1);
  }
}

verify();
