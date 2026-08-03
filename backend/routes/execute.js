// backend/routes/execute.js
// Code execution via JDoodle API (FREE — 20 credits/day, no credit card)
// Sign up at https://www.jdoodle.com → Dashboard → API → Get Client ID & Secret
const express = require('express');
const axios   = require('axios');
const router  = express.Router();

const JDOODLE_URL = 'https://api.jdoodle.com/v1/execute';

// JDoodle language identifiers + version indexes
// Version index 0 = latest available
const LANG_MAP = {
  python:     { language: 'python3',    versionIndex: '5' },
  javascript: { language: 'nodejs',     versionIndex: '4' },
  java:       { language: 'java',       versionIndex: '4' },
  c:          { language: 'c',          versionIndex: '5' },
};

router.post('/', async (req, res) => {
  try {
    const { language, code, stdin } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Missing "code" or "language" field' });
    }

    const langConfig = LANG_MAP[language];
    if (!langConfig) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    const clientId     = process.env.JDOODLE_CLIENT_ID;
    const clientSecret = process.env.JDOODLE_CLIENT_SECRET;

    if (!clientId || clientId === 'your-jdoodle-client-id') {
      return res.status(500).json({
        error: 'JDoodle API not configured. Add JDOODLE_CLIENT_ID and JDOODLE_CLIENT_SECRET to backend/.env\n\n'
             + 'Get them FREE at: https://www.jdoodle.com → Sign up → Dashboard → API',
      });
    }

    // ── Call JDoodle API ─────────────────────────────────────────────────────
    const startTime = Date.now();

    const response = await axios.post(JDOODLE_URL, {
      clientId,
      clientSecret,
      script:       code,
      stdin:        stdin || '',
      language:     langConfig.language,
      versionIndex: langConfig.versionIndex,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(4);
    const data    = response.data;

    // JDoodle returns: { output, statusCode, memory, cpuTime }
    // statusCode 200 = success, anything else = error
    const isError = data.statusCode !== 200;
    const output  = data.output || '';
    const memory  = data.memory ? `${(data.memory / 1024).toFixed(2)} Mb` : '—';
    const cpuTime = data.cpuTime ? `${data.cpuTime} secs` : `${elapsed} secs`;

    // JDoodle puts both stdout and stderr in the same "output" field
    // Compilation errors also go here
    // We detect errors by statusCode or common error patterns
    const hasCompileError = isError ||
      output.includes('error:') ||
      output.includes('Error:') ||
      output.includes('Traceback') ||
      output.includes('SyntaxError') ||
      output.includes('Exception');

    res.json({
      status: hasCompileError ? 'Error' : 'Success',
      stdout: hasCompileError ? '' : output,
      stderr: hasCompileError ? output : '',
      time:   cpuTime,
      memory: memory,
    });

  } catch (err) {
    console.error('Execute error:', err.response?.data || err.message);

    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: 'Execution timed out (30s). Try simpler code.' });
    }

    const msg = err.response?.data?.error || err.message || 'Execution failed';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
