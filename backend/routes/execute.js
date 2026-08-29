// backend/routes/execute.js
// Code execution via Judge0 (self-hosted)
// Judge0 runs locally at http://localhost:2358 via Docker

const express = require('express');
const axios = require('axios');
const router = express.Router();

const JUDGE0_URL = 'http://localhost:2358/submissions?base64_encoded=false&wait=true';

// Judge0 Language IDs
const LANG_MAP = {
  python: 71,   // Python 3.8.1
  javascript: 63,   // Node.js 12.14.0
  java: 62,   // OpenJDK 14.0.1
  c: 50,   // GCC 9.2.0 (C)
  cpp: 54,   // GCC 9.2.0 (C++)
};

// Judge0 Status ID → human-readable 
const STATUS_MAP = {
  4: 'Wrong Answer',
  5: 'Time Limit Exceeded',
  6: 'Compilation Error',
  7: 'Runtime Error',
  8: 'Runtime Error',
  9: 'Runtime Error',
  10: 'Runtime Error',
  11: 'Runtime Error',
  12: 'Runtime Error',
  13: 'Internal Error',
  14: 'Exec Format Error',
};

router.post('/', async (req, res) => {
  try {
    const { language, code, stdin } = req.body;

    if (!code || !language) {
      return res.status(400).json({ error: 'Missing "code" or "language" field' });
    }

    const languageId = LANG_MAP[language];
    if (!languageId) {
      return res.status(400).json({ error: `Unsupported language: ${language}` });
    }

    // ── Code size guard ───────────────────────────────────────────────────────────────────────
    const MAX_CODE_SIZE = 10000; // 10 KB max
    if (code.length > MAX_CODE_SIZE) {
      return res.status(413).json({ error: 'Code too large. Maximum 10,000 characters allowed.' });
    }

    // ── Call Judge0 API ─────────────────────────────────────────────────────
    const startTime = Date.now();

    const response = await axios.post(JUDGE0_URL, {
      source_code: code,
      language_id: languageId,
      stdin: stdin || '',
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(4);
    const data = response.data;

    // Judge0 returns: { stdout, stderr, compile_output, status, time, memory  }
    // Status IDs: 3 = Accepted
    // NOTE: Python/JS runtime errors still get status=3 from Judge0
    //       but the traceback lands in stderr — treat stderr as an error indicator too.

    const stdout = data.stdout || '';
    const stderr = data.stderr || '';
    const compileOutput = data.compile_output || '';
    const statusId = data.status?.id;

    // isError: bad Judge0 status OR stderr non-empty (Python/JS runtime exceptions)
    const isError = statusId !== 3 || !!stderr;

    // Determine human-readable error type
    let errorType = STATUS_MAP[statusId] || null;
    if (!errorType && isError) errorType = 'Runtime Error'; // stderr-only case

    // Best available error message — never blank when there is an error
    const rawError = compileOutput || stderr || data.message || '';
    const errorMessage = isError
      ? (rawError || `Execution failed (status ${statusId}: ${data.status?.description || 'Unknown'})`)
      : '';

    const cpuTime = data.time ? `${data.time} secs` : `${elapsed} secs`;
    const memory = data.memory ? `${(data.memory / 1024).toFixed(2)} Mb` : '—';

    res.json({
      status: isError ? 'Error' : 'Success',
      errorType: errorType || null,
      stdout: stdout,          // always pass stdout — might have output before crash
      stderr: isError ? errorMessage : '',
      time: cpuTime,
      memory: memory,
    });

  } catch (err) {
    console.error('Execute error:', err.response?.data || err.message);

    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return res.status(504).json({ error: 'Execution timed out (30s). Try simpler code.' });
    }

    if (err.code === 'ECONNREFUSED') {
      return res.status(503).json({
        error: 'Judge0 compiler is not running.\nOpen a terminal in the judge0 folder and run: docker-compose up -d',
      });
    }

    const msg = err.response?.data?.error || err.message || 'Execution failed';
    res.status(500).json({ error: msg });
  }
});

module.exports = router;
