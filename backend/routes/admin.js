const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');

// ── Admin middleware ───────────────────────────────────────
const isAdmin = async (req, res, next) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', req.user.id)
    .single();

  if (error || data?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

// ─── GET /api/admin/stats ──────────────────────────────────
router.get('/stats', verifyToken, isAdmin, async (req, res) => {
  try {
    const [
      { count: userCount },
      { count: docCount },
      { count: firmCount },
      { count: translationCount },
    ] = await Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('documents').select('*', { count: 'exact', head: true }),
      supabase.from('firm_profiles').select('*', { count: 'exact', head: true }),
      supabase.from('translated_documents').select('*', { count: 'exact', head: true }),
    ]);

    // Total credits in system (individual lawyers only)
    const { data: creditData } = await supabase
      .from('profiles')
      .select('credits')
      .eq('is_firm_member', false);
    const totalCredits = (creditData || []).reduce((sum, u) => sum + (u.credits || 0), 0);

    // Total firm pool credits
    const { data: firmCreditData } = await supabase
      .from('firm_profiles')
      .select('total_credits');
    const totalFirmCredits = (firmCreditData || []).reduce((sum, f) => sum + (f.total_credits || 0), 0);

    res.json({
      totalUsers: userCount || 0,
      totalDocuments: docCount || 0,
      totalFirms: firmCount || 0,
      totalTranslations: translationCount || 0,
      totalCreditsInSystem: totalCredits,
      totalFirmCredits,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── GET /api/admin/users ──────────────────────────────────
router.get('/users', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── GET /api/admin/firms ──────────────────────────────────
router.get('/firms', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data: firms, error } = await supabase
      .from('firm_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get member counts and doc counts for each firm
    const firmIds = (firms || []).map(f => f.id);
    let memberCounts = {};
    let docCounts = {};

    if (firmIds.length > 0) {
      const { data: members } = await supabase
        .from('profiles')
        .select('firm_id')
        .in('firm_id', firmIds);
      (members || []).forEach(m => {
        memberCounts[m.firm_id] = (memberCounts[m.firm_id] || 0) + 1;
      });

      const { data: docs } = await supabase
        .from('documents')
        .select('firm_id')
        .in('firm_id', firmIds);
      (docs || []).forEach(d => {
        docCounts[d.firm_id] = (docCounts[d.firm_id] || 0) + 1;
      });
    }

    const firmsWithCounts = (firms || []).map(f => ({
      ...f,
      member_count: memberCounts[f.id] || 0,
      doc_count: docCounts[f.id] || 0,
    }));

    res.json({ success: true, firms: firmsWithCounts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch firms' });
  }
});

// ─── GET /api/admin/firms/:id/members ─────────────────────
router.get('/firms/:id/members', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, email, credits, firm_role, created_at, documents_generated')
      .eq('firm_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, members: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch firm members' });
  }
});

// ─── POST /api/admin/add-credits ──────────────────────────
// Only for individual lawyers (non-firm members)
router.post('/add-credits', verifyToken, isAdmin, async (req, res) => {
  const { userId, credits } = req.body;
  if (!userId || !credits || credits < 1) {
    return res.status(400).json({ error: 'Valid userId and credits required' });
  }
  try {
    const { data: user } = await supabase
      .from('profiles')
      .select('credits, is_firm_member')
      .eq('id', userId)
      .single();

    if (user?.is_firm_member) {
      return res.status(400).json({ error: 'Cannot add individual credits to firm members. Use add-firm-credits instead.' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ credits: user.credits + Number(credits) })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, message: `Added ${credits} credits`, newCredits: data.credits });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add credits' });
  }
});

// ─── POST /api/admin/add-firm-credits ─────────────────────
// Adds to firm pool only — not to individual profiles
router.post('/add-firm-credits', verifyToken, isAdmin, async (req, res) => {
  const { firmId, credits } = req.body;
  if (!firmId || !credits || credits < 1) {
    return res.status(400).json({ error: 'Valid firmId and credits required' });
  }
  try {
    const { data: firm } = await supabase
      .from('firm_profiles')
      .select('total_credits, firm_name')
      .eq('id', firmId)
      .single();

    if (!firm) return res.status(404).json({ error: 'Firm not found' });

    // Update ONLY firm pool — not individual profiles
    const { error } = await supabase
      .from('firm_profiles')
      .update({ total_credits: firm.total_credits + Number(credits) })
      .eq('id', firmId);

    if (error) throw error;

    res.json({
      success: true,
      message: `Added ${credits} credits to ${firm.firm_name} pool`,
      newTotal: firm.total_credits + Number(credits)
    });
  } catch (err) {
    console.error('add-firm-credits error:', err);
    res.status(500).json({ error: 'Failed to add firm credits' });
  }
});

// ─── POST /api/admin/reset-password ───────────────────────
router.post('/reset-password', verifyToken, isAdmin, async (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Valid userId and password required' });
  }
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });
    if (error) throw error;
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

// ─── POST /api/admin/suspend-user ─────────────────────────
router.post('/suspend-user', verifyToken, isAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: '876600h'
    });
    if (error) throw error;
    res.json({ success: true, message: 'User suspended' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to suspend user' });
  }
});

// ─── POST /api/admin/unsuspend-user ───────────────────────
router.post('/unsuspend-user', verifyToken, isAdmin, async (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      ban_duration: 'none'
    });
    if (error) throw error;
    res.json({ success: true, message: 'User unsuspended' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unsuspend user' });
  }
});

// ─── DELETE /api/admin/delete-user/:id ────────────────────
router.delete('/delete-user/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const userId = req.params.id;

    // Get user profile to check if firm admin or member
    const { data: profile } = await supabase
      .from('profiles')
      .select('firm_id, firm_role, is_firm_member')
      .eq('id', userId)
      .single();

    // If firm admin — delete entire firm and remove all members first
    if (profile?.firm_role === 'admin' && profile?.firm_id) {
      await supabase
        .from('profiles')
        .update({ firm_id: null, firm_role: null, is_firm_member: false })
        .eq('firm_id', profile.firm_id);

      await supabase
        .from('firm_profiles')
        .delete()
        .eq('id', profile.firm_id);
    }

    // If regular firm member — just remove firm association
    if (profile?.firm_role === 'member' && profile?.firm_id) {
      await supabase
        .from('profiles')
        .update({ firm_id: null, firm_role: null, is_firm_member: false })
        .eq('id', userId);
    }

    // Delete from Supabase Auth
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) throw error;

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user: ' + err.message });
  }
});

// ─── DELETE /api/admin/delete-firm/:id ────────────────────
router.delete('/delete-firm/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const firmId = req.params.id;

    // Remove all members from firm
    await supabase
      .from('profiles')
      .update({ firm_id: null, firm_role: null, is_firm_member: false })
      .eq('firm_id', firmId);

    // Delete firm profile
    await supabase
      .from('firm_profiles')
      .delete()
      .eq('id', firmId);

    res.json({ success: true, message: 'Firm deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete firm' });
  }
});

// ─── GET /api/admin/user-documents/:id ────────────────────
router.get('/user-documents/:id', verifyToken, isAdmin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('documents')
      .select('id, document_type_name, category_name, created_at, status')
      .eq('user_id', req.params.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    res.json({ success: true, documents: data || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user documents' });
  }
});

module.exports = router;