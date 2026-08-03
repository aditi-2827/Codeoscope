require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(require('./middleware/auth'));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/execute',    require('./routes/execute'));
app.use('/api/visualize',  require('./routes/visualize'));
app.use('/api/complexity', require('./routes/complexity'));
app.use('/api/history',    require('./routes/history'));
app.use('/api/dryrun',     require('./routes/dryrun'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Codeoscope backend running' });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
