require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Security Headers (Helmet) ─────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ──────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));

// ─── Body Size Limit ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '50kb' }));

// ─── Rate Limiting (execution routes only) ─────────────────────────────────────
const execLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute window
  max: 30,               // max 30 requests per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});
app.use(require('./middleware/auth'));

// ─── Routes ───────────────────────────────────────────────────────────────────
// Rate limiter applied to the 3 heavy execution routes
app.use('/api/execute',    execLimiter, require('./routes/execute'));
app.use('/api/visualize',  execLimiter, require('./routes/visualize'));
app.use('/api/dryrun',     execLimiter, require('./routes/dryrun'));
app.use('/api/complexity', require('./routes/complexity'));
app.use('/api/history',    require('./routes/history'));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Codeoscope backend running' });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
