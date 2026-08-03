// backend/routes/complexity.js
// Analyses time & space complexity using a LOCAL static analysis engine.
// Zero external API calls — no API key needed.
const express = require('express');
const router = express.Router();
const { analyzeComplexity } = require('../engines/complexityEngine');

router.post('/', async (req, res) => {
  try {
    const { code, language } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Both "code" and "language" fields are required.' });
    }

    const supported = ['python', 'javascript', 'java', 'c'];
    if (!supported.includes(language.toLowerCase())) {
      return res.status(400).json({
        error: `Unsupported language: ${language}. Supported: ${supported.join(', ')}`,
      });
    }

    console.log(`[complexity] Analysing ${language} code (${code.length} chars) — local engine`);

    const result = analyzeComplexity(code, language);

    console.log(`[complexity] Result: Time ${result.timeComplexity}, Space ${result.spaceComplexity}`);

    return res.json(result);
  } catch (err) {
    console.error('[complexity] Engine error:', err);
    return res.status(500).json({
      error: 'Complexity analysis failed.',
      details: err.message,
    });
  }
});

module.exports = router;
