// src/index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { resolveTenant } = require('./middleware/auth');
const routes = require('./routes/index');
const { startJobs } = require('./jobs/reminders');

const app = express();
const PORT = process.env.PORT || 3001;

// Security
app.use(helmet());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS — allow any subdomain of beautybook.lv + custom domains
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allowed = [
      /\.beautybook\.lv$/,
      /^https?:\/\/localhost/,
      process.env.FRONTEND_URL,
    ].filter(Boolean);
    const ok = allowed.some(p => typeof p === 'string' ? origin === p : p.test(origin));
    cb(null, ok || true); // In production: cb(null, ok)
  },
  credentials: true,
}));

// Rate limiting
app.use('/api/public/book', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many booking attempts' } }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, max: 20 }));
app.use('/api', rateLimit({ windowMs: 1 * 60 * 1000, max: 300 }));

// Tenant resolver (from domain/subdomain)
app.use(resolveTenant);

// Routes
app.use('/api', routes);

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 BeautyBook API running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'test') {
    startJobs();
  }
});

module.exports = app;
