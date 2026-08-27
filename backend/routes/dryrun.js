// backend/routes/dryrun.js
// Dry-run analysis using local code-tracing engine (no AI, no external LLM).
// Instruments code → executes via JDoodle → builds:
//   1. Step-by-step dry-run table (with call stack, variables, output, explanation)
//   2. Mermaid.js control-flow diagram from the actual execution trace
//
// Works with complex algorithms: 4-Queens, DP, recursion, sorting, BFS/DFS.
const express  = require('express');
const router   = express.Router();
const { buildDryRunData } = require('../engines/dryRunEngine');

router.post('/', async (req, res) => {
  try {
    const { code, language, stdin } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Both "code" and "language" fields are required.' });
    }

    const supported = ['python', 'javascript', 'java', 'c'];
    if (!supported.includes(language.toLowerCase())) {
      return res.status(400).json({
        error: `Unsupported language: ${language}. Supported: ${supported.join(', ')}`,
      });
    }

    // ── Code size guard ──────────────────────────────────────────────────────────────────────
    if (code.length > 10000) {
      return res.status(413).json({ error: 'Code too large. Maximum 10,000 characters allowed.' });
    }

    console.log(`[dryrun] ${language} code (${code.length} chars) — local trace engine`);

    const result = await buildDryRunData(code, language, stdin || '');

    console.log(`[dryrun] Generated ${result.dryRun.length} steps`);

    return res.json(result);
  } catch (err) {
    console.error('[dryrun] Error:', err.message);

    if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
      return res.status(504).json({ error: 'Execution timed out (30s). Try simpler code.' });
    }

    return res.status(500).json({
      error: err.message || 'Dry run failed',
    });
  }
});

module.exports = router;
