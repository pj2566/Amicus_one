const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { verifyToken } = require('./auth');

// GET /api/clients — get all clients for user
router.get('/', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ success: true, clients: data });
  } catch (err) {
    console.error('GET /clients error:', err);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
});

// POST /api/clients — create new client
router.post('/', verifyToken, async (req, res) => {
  try {
    const { name, phone, email, address, notes, previous_matters } = req.body;
    if (!name) return res.status(400).json({ error: 'Client name is required' });

    const { data, error } = await supabase
      .from('clients')
      .insert({
        user_id: req.user.id,
        name, phone, email, address, notes, previous_matters
      })
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, client: data });
  } catch (err) {
    console.error('POST /clients error:', err);
    res.status(500).json({ error: 'Failed to create client' });
  }
});

// PUT /api/clients/:id — update client
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { name, phone, email, address, notes, previous_matters } = req.body;

    const { data, error } = await supabase
      .from('clients')
      .update({
        name, phone, email, address, notes, previous_matters,
        updated_at: new Date().toISOString()
      })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, client: data });
  } catch (err) {
    console.error('PUT /clients/:id error:', err);
    res.status(500).json({ error: 'Failed to update client' });
  }
});

// DELETE /api/clients/:id — delete client
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', req.user.id);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /clients/:id error:', err);
    res.status(500).json({ error: 'Failed to delete client' });
  }
});

module.exports = router;