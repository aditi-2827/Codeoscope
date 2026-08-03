// backend/routes/history.js
// Save and retrieve code snippets from Supabase snippets table.
// Auth: reads req.user set by middleware/auth.js (JWT verification).

const express = require('express');
const router  = express.Router();
const supabase = require('../lib/supabase');

/* ── Guard helper ───────────────────────────────────────────────────────────── */
function requireUser(req, res) {
  if (!req.user) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  return true;
}

/* ── GET /api/history — list all snippets for the signed-in user ─────────── */
router.get('/', async (req, res) => {
  if (!requireUser(req, res)) return;

  const { data, error } = await supabase
    .from('snippets')
    .select('id, name, language, code, created_at')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('history GET error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

/* ── POST /api/history/save — create a new snippet ─────────────────────── */
router.post('/save', async (req, res) => {
  if (!requireUser(req, res)) return;

  const { name, language, code } = req.body;
  if (!name || !language || !code) {
    return res.status(400).json({ error: 'name, language, and code are required' });
  }

  const { data, error } = await supabase
    .from('snippets')
    .insert({ user_id: req.user.id, name, language, code })
    .select('id, name, language, code, created_at')
    .single();

  if (error) {
    console.error('history SAVE error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.status(201).json(data);
});

/* ── DELETE /api/history/:id — delete a snippet (must belong to user) ───── */
router.delete('/:id', async (req, res) => {
  if (!requireUser(req, res)) return;

  const { error } = await supabase
    .from('snippets')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id); // RLS double-check

  if (error) {
    console.error('history DELETE error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json({ success: true });
});

/* ── PATCH /api/history/:id — rename or update snippet code ─────────────── */
router.patch('/:id', async (req, res) => {
  if (!requireUser(req, res)) return;

  const { name, code } = req.body;
  if (!name && !code) {
    return res.status(400).json({ error: 'Provide name or code to update' });
  }

  const updates = {};
  if (name) updates.name = name;
  if (code) updates.code = code;

  const { data, error } = await supabase
    .from('snippets')
    .update(updates)
    .eq('id', req.params.id)
    .eq('user_id', req.user.id)
    .select('id, name, language, code, created_at')
    .single();

  if (error) {
    console.error('history PATCH error:', error);
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

module.exports = router;
