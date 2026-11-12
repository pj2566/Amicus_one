const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split('Bearer ')[1];
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token verification failed' });
  }
};

router.get('/profile', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) return res.status(404).json({ error: 'User not found' });
    res.json({ user: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.post('/register', verifyToken, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .update({ name: req.body.name || '' })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update profile' });
    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ error: 'Registration update failed' });
  }
});

router.put('/profile', verifyToken, async (req, res) => {
  try {
    const { name, phone, law_firm, specialization } = req.body;

    const { data, error } = await supabase
      .from('profiles')
      .update({ name, phone, law_firm, specialization })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to update profile' });
    res.json({ success: true, user: data });
  } catch (err) {
    res.status(500).json({ error: 'Profile update failed' });
  }
});

router.verifyToken = verifyToken;
module.exports = router;