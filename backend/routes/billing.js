const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');

// GET /api/billing/usage — get usage logs for user
router.get('/usage', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('usage_logs')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json({ success: true, logs: data });
  } catch (err) {
    console.error('GET /billing/usage error:', err);
    res.status(500).json({ error: 'Failed to fetch usage logs' });
  }
});

// GET /api/billing/stats — get usage stats summary
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, documents_generated, lawgpt_usage')
      .eq('id', req.user.id)
      .single();

    const { data: logs } = await supabase
      .from('usage_logs')
      .select('action_type, credits_used')
      .eq('user_id', req.user.id);

    const totalCreditsUsed = logs?.reduce((sum, l) => sum + (l.credits_used || 0), 0) || 0;
    const docCount = logs?.filter(l => l.action_type === 'document_generated').length || 0;
    const lawgptCount = logs?.filter(l => l.action_type === 'lawgpt_message').length || 0;
    const pdfCount = logs?.filter(l => l.action_type === 'pdf_uploaded').length || 0;

    res.json({
      success: true,
      stats: {
        creditsRemaining: profile?.credits || 0,
        documentsGenerated: profile?.documents_generated || 0,
        lawgptUsage: profile?.lawgpt_usage || 0,
        totalCreditsUsed,
        docCount,
        lawgptCount,
        pdfCount
      }
    });
  } catch (err) {
    console.error('GET /billing/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch billing stats' });
  }
});

// POST /api/billing/log — log a usage action
router.post('/log', verifyToken, async (req, res) => {
  try {
    const { action_type, action_label, credits_used, metadata } = req.body;

    const { error } = await supabase
      .from('usage_logs')
      .insert({
        user_id: req.user.id,
        action_type,
        action_label,
        credits_used: credits_used || 0,
        metadata: metadata || {}
      });

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('POST /billing/log error:', err);
    res.status(500).json({ error: 'Failed to log usage' });
  }
});

module.exports = router;