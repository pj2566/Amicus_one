const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');
const crypto = require('crypto');

// ── Helper: generate invite code ──────────────────────────
const generateInviteCode = () => crypto.randomBytes(6).toString('hex').toUpperCase();

// ── Helper: verify firm admin ─────────────────────────────
const verifyFirmAdmin = async (userId) => {
  // First try direct firm_profiles lookup
  const { data, error } = await supabase
    .from('firm_profiles')
    .select('*')
    .eq('admin_user_id', userId)
    .single();
  if (!error && data) return data;

  // Fallback — check via profiles table firm_id + firm_role
  const { data: profile } = await supabase
    .from('profiles')
    .select('firm_id, firm_role')
    .eq('id', userId)
    .single();

  if (!profile?.firm_id || profile?.firm_role !== 'admin') return null;

  const { data: firm } = await supabase
    .from('firm_profiles')
    .select('*')
    .eq('id', profile.firm_id)
    .single();

  return firm || null;
};

// ─── POST /api/firm/signup ─────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { firmName, email, password, barCouncilNumber, adminName } = req.body;
    if (!firmName || !email || !password || !adminName) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: adminName, role: 'firm_admin' }
    });

    if (authError) return res.status(400).json({ error: authError.message });

    const userId = authData.user.id;

    // Create firm profile with pool credits
    const { data: firm, error: firmError } = await supabase
      .from('firm_profiles')
      .insert({
        admin_user_id: userId,
        firm_name: firmName,
        email,
        bar_council_number: barCouncilNumber || null,
        total_credits: 10, // Starting pool credits
      })
      .select()
      .single();

    if (firmError) throw firmError;

    // Wait for trigger then upsert profile
    await new Promise(resolve => setTimeout(resolve, 1000));

    await supabase
      .from('profiles')
      .upsert({
        id: userId,
        email,
        name: adminName,
        credits: 0, // Firm members use pool credits
        role: 'firm_admin',
        firm_id: firm.id,
        firm_role: 'admin',
        is_firm_member: true,
      }, { onConflict: 'id' });

    res.json({ success: true, message: 'Firm account created successfully' });
  } catch (err) {
    console.error('Firm signup error:', err);
    res.status(500).json({ error: 'Firm signup failed: ' + err.message });
  }
});

// ─── GET /api/firm/profile ─────────────────────────────────
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('*, firm_profiles(*)')
      .eq('id', req.user.id)
      .single();

    res.json({ success: true, profile });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch firm profile' });
  }
});

// ─── GET /api/firm/stats ───────────────────────────────────
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const firm = await verifyFirmAdmin(req.user.id);
    if (!firm) return res.status(403).json({ error: 'Not a firm admin' });

    const { count: membersCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('firm_id', firm.id);

    const { count: docsCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('firm_id', firm.id);

    const { count: sharedDocsCount } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('firm_id', firm.id)
      .eq('is_shared_with_firm', true);

    const { count: pendingInvites } = await supabase
      .from('firm_invites')
      .select('*', { count: 'exact', head: true })
      .eq('firm_id', firm.id)
      .eq('status', 'pending');

    // Always read from firm pool
    const { data: freshFirm } = await supabase
      .from('firm_profiles')
      .select('total_credits')
      .eq('id', firm.id)
      .single();

    res.json({
      success: true,
      stats: {
        totalCredits: freshFirm?.total_credits || 0,
        membersCount: membersCount || 0,
        docsCount: docsCount || 0,
        sharedDocsCount: sharedDocsCount || 0,
        pendingInvites: pendingInvites || 0,
      }
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── GET /api/firm/credits ─────────────────────────────────
// Returns firm pool credits for any firm member
router.get('/credits', verifyToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('firm_id')
      .eq('id', req.user.id)
      .single();

    if (!profile?.firm_id) return res.status(403).json({ error: 'Not a firm member' });

    const { data: firm } = await supabase
      .from('firm_profiles')
      .select('total_credits, firm_name')
      .eq('id', profile.firm_id)
      .single();

    res.json({ success: true, credits: firm?.total_credits || 0, firmName: firm?.firm_name });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch firm credits' });
  }
});

// ─── GET /api/firm/members ─────────────────────────────────
router.get('/members', verifyToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('firm_id, firm_role')
      .eq('id', req.user.id)
      .single();

    if (!profile?.firm_id) return res.status(403).json({ error: 'Not a firm member' });

    const { data: members, error } = await supabase
      .from('profiles')
      .select('id, name, email, credits, firm_role, created_at, documents_generated')
      .eq('firm_id', profile.firm_id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, members: members || [] });
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// ─── POST /api/firm/invite-email ───────────────────────────
router.post('/invite-email', verifyToken, async (req, res) => {
  try {
    const firm = await verifyFirmAdmin(req.user.id);
    if (!firm) return res.status(403).json({ error: 'Not a firm admin' });

    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const inviteCode = generateInviteCode();

    const { error } = await supabase
      .from('firm_invites')
      .insert({
        firm_id: firm.id,
        email,
        invite_code: inviteCode,
        status: 'pending',
      });

    if (error) throw error;

    res.json({
      success: true,
      inviteCode,
      message: `Invite created. Share this code with ${email}: ${inviteCode}`,
      firmName: firm.firm_name,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create invite: ' + err.message });
  }
});

// ─── POST /api/firm/add-member ─────────────────────────────
router.post('/add-member', verifyToken, async (req, res) => {
  try {
    const firm = await verifyFirmAdmin(req.user.id);
    if (!firm) return res.status(403).json({ error: 'Not a firm admin' });

    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    // Create auth user
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'firm_member' }
    });

    if (authError) {
      console.error('Auth create user error:', authError);
      return res.status(400).json({ error: authError.message || 'Failed to create user account' });
    }

    // Wait for Supabase trigger
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Upsert profile with firm data — credits 0 since firm uses pool
    const { error: upsertError } = await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email,
        name,
        credits: 0,
        role: 'user',
        firm_id: firm.id,
        firm_role: 'member',
        is_firm_member: true,
      }, { onConflict: 'id' });

    if (upsertError) {
      console.error('Profile upsert error:', upsertError);
      return res.status(500).json({ error: 'User created but profile setup failed: ' + upsertError.message });
    }

    res.json({ success: true, message: `${name} added to firm successfully` });
  } catch (err) {
    console.error('Add member full error:', err);
    res.status(500).json({ error: 'Failed to add member: ' + err.message });
  }
});

// ─── POST /api/firm/distribute-credits ────────────────────
// Firm admin distributes credits from pool to individual member
router.post('/distribute-credits', verifyToken, async (req, res) => {
  try {
    const firm = await verifyFirmAdmin(req.user.id);
    if (!firm) return res.status(403).json({ error: 'Not a firm admin' });

    const { memberId, credits } = req.body;
    if (!memberId || !credits || credits < 1) {
      return res.status(400).json({ error: 'Valid memberId and credits required' });
    }

    // Check firm has enough pool credits
    const { data: freshFirm } = await supabase
      .from('firm_profiles')
      .select('total_credits')
      .eq('id', firm.id)
      .single();

    if ((freshFirm?.total_credits || 0) < credits) {
      return res.status(400).json({ error: 'Not enough credits in firm pool' });
    }

    // Verify member belongs to this firm
    const { data: member } = await supabase
      .from('profiles')
      .select('credits, firm_id')
      .eq('id', memberId)
      .single();

    if (!member || member.firm_id !== firm.id) {
      return res.status(403).json({ error: 'Member not found in this firm' });
    }

    // Deduct from pool
    await supabase
      .from('firm_profiles')
      .update({ total_credits: freshFirm.total_credits - Number(credits) })
      .eq('id', firm.id);

    // Add to member's individual credits
    await supabase
      .from('profiles')
      .update({ credits: (member.credits || 0) + Number(credits) })
      .eq('id', memberId);

    res.json({ success: true, message: `${credits} credits distributed to member` });
  } catch (err) {
    console.error('Distribute credits error:', err);
    res.status(500).json({ error: 'Failed to distribute credits' });
  }
});

// ─── POST /api/firm/join-with-code ────────────────────────
router.post('/join-with-code', async (req, res) => {
  try {
    const { inviteCode, name, email, password } = req.body;
    if (!inviteCode || !name || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const { data: invite, error: inviteError } = await supabase
      .from('firm_invites')
      .select('*, firm_profiles(*)')
      .eq('invite_code', inviteCode.toUpperCase())
      .eq('status', 'pending')
      .single();

    if (inviteError || !invite) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role: 'firm_member' }
    });

    if (authError) return res.status(400).json({ error: authError.message });

    await new Promise(resolve => setTimeout(resolve, 1500));

    await supabase
      .from('profiles')
      .upsert({
        id: authData.user.id,
        email,
        name,
        credits: 0,
        role: 'user',
        firm_id: invite.firm_id,
        firm_role: 'member',
        is_firm_member: true,
      }, { onConflict: 'id' });

    await supabase
      .from('firm_invites')
      .update({ status: 'accepted' })
      .eq('id', invite.id);

    res.json({
      success: true,
      message: `Successfully joined ${invite.firm_profiles.firm_name}`,
      firmName: invite.firm_profiles.firm_name,
    });
  } catch (err) {
    console.error('Join firm error:', err);
    res.status(500).json({ error: 'Failed to join firm: ' + err.message });
  }
});

// ─── DELETE /api/firm/remove-member/:id ───────────────────
router.delete('/remove-member/:id', verifyToken, async (req, res) => {
  try {
    const firm = await verifyFirmAdmin(req.user.id);
    if (!firm) return res.status(403).json({ error: 'Not a firm admin' });

    const memberId = req.params.id;
    if (memberId === req.user.id) {
      return res.status(400).json({ error: 'Cannot remove yourself' });
    }

    const { error } = await supabase
      .from('profiles')
      .update({ firm_id: null, firm_role: null, is_firm_member: false, credits: 0 })
      .eq('id', memberId)
      .eq('firm_id', firm.id);

    if (error) throw error;
    res.json({ success: true, message: 'Member removed from firm' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// ─── POST /api/firm/reset-password/:id ────────────────────
router.post('/reset-password/:id', verifyToken, async (req, res) => {
  try {
    const firm = await verifyFirmAdmin(req.user.id);
    if (!firm) return res.status(403).json({ error: 'Not a firm admin' });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Only allow resetting passwords of members of this admin's own firm
    const { data: member } = await supabase
      .from('profiles')
      .select('id')
      .eq('id', req.params.id)
      .eq('firm_id', firm.id)
      .single();

    if (!member) return res.status(404).json({ error: 'Member not found in your firm' });

    const { error } = await supabase.auth.admin.updateUserById(req.params.id, {
      password: newPassword
    });

    if (error) throw error;
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── GET /api/firm/documents ───────────────────────────────
router.get('/documents', verifyToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('firm_id, firm_role')
      .eq('id', req.user.id)
      .single();

    if (!profile?.firm_id) return res.status(403).json({ error: 'Not a firm member' });

    const { data: sharedDocs, error: sharedError } = await supabase
      .from('documents')
      .select('id, document_type_name, category_name, created_at, status, user_id, is_shared_with_firm, generated_content')
      .eq('firm_id', profile.firm_id)
      .eq('is_shared_with_firm', true)
      .order('created_at', { ascending: false })
      .limit(50);

    if (sharedError) throw sharedError;

    const userIds = [...new Set((sharedDocs || []).map(d => d.user_id))];
    let sharerMap = {};
    if (userIds.length > 0) {
      const { data: sharers } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);
      (sharers || []).forEach(s => { sharerMap[s.id] = s.name || s.email; });
    }

    const sharedWithNames = (sharedDocs || []).map(d => ({
      ...d,
      shared_by_name: sharerMap[d.user_id] || 'Unknown'
    }));

    const { data: privateDocs, error: privateError } = await supabase
      .from('documents')
      .select('id, document_type_name, category_name, created_at, status, is_shared_with_firm, generated_content')
      .eq('user_id', req.user.id)
      .eq('is_shared_with_firm', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (privateError) throw privateError;

    res.json({
      success: true,
      sharedDocuments: sharedWithNames,
      privateDocuments: privateDocs || []
    });
  } catch (err) {
    console.error('GET /firm/documents error:', err);
    res.status(500).json({ error: 'Failed to fetch firm documents' });
  }
});

// ─── GET /api/firm/chats ───────────────────────────────────
router.get('/chats', verifyToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('firm_id, firm_role')
      .eq('id', req.user.id)
      .single();

    if (!profile?.firm_id) return res.status(403).json({ error: 'Not a firm member' });

    const { data, error } = await supabase
      .from('lawgpt_chats')
      .select('id, title, pdf_name, created_at, user_id, is_private')
      .eq('firm_id', profile.firm_id)
      .eq('is_private', false)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ success: true, chats: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch firm chats' });
  }
});

// ─── GET /api/firm/invites ─────────────────────────────────
router.get('/invites', verifyToken, async (req, res) => {
  try {
    const firm = await verifyFirmAdmin(req.user.id);
    if (!firm) return res.status(403).json({ error: 'Not a firm admin' });

    const { data, error } = await supabase
      .from('firm_invites')
      .select('*')
      .eq('firm_id', firm.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, invites: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invites' });
  }
});

module.exports = router;