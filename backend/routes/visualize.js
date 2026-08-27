// backend/routes/visualize.js
// Step-by-step code visualization using CUSTOM tracing engine (no AI)
//
// Python  → sys.settrace()
// JS     → regex-injected trace calls
// Java/C → regex-injected print trace
//
// All execution happens via JDoodle API.
const express = require('express');
const router = express.Router();
const { traceCode } = require('../engines/traceEngine');

router.post('/', async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Both "code" and "language" fields are required.' });
    }

    const supportedLangs = ['python', 'javascript', 'java', 'c'];
    if (!supportedLangs.includes(language)) {
      return res.status(400).json({ error: `Unsupported language: ${language}. Supported: ${supportedLangs.join(', ')}` });
    }

    // ── Code size guard ──────────────────────────────────────────────────────────────────────
    if (code.length > 10000) {
      return res.status(413).json({ error: 'Code too large. Maximum 10,000 characters allowed.' });
    }

    console.log(`[visualize] Tracing ${language} code (${code.length} chars) via custom engine`);

    const result = await traceCode(code, language, req.body.stdin || '');

    console.log(`[visualize] Captured ${result.steps.length} steps`);

    return res.json(result);
  } catch (err) {
    console.error('[visualize] Error:', err.message);

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'Execution timed out (30s). Try simpler code.' });
    }

    return res.status(500).json({
      error: err.message || 'Visualization failed',
    });
  }
});

module.exports = router;
