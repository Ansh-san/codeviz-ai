import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';

dotenv.config();

import parseRouter from './routes/parse';
import analyzeRouter from './routes/analyze';
import analyzeRepoRouter from './routes/analyzeRepo';

const app = express();
const PORT = process.env.PORT || 3001;

// ── CORS ──────────────────────────────────────────────────────────────────────
// Origins are configurable via CORS_ORIGINS env var (comma-separated list).
// Falls back to localhost defaults for local development.
// Example: CORS_ORIGINS=https://codeviz.example.com,https://preview.codeviz.example.com
const corsOrigins: string[] = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];

app.use(cors({
  origin: corsOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate Limiting ─────────────────────────────────────────────────────────────
// Applied to AI-heavy endpoints to prevent abuse and excessive Gemini API costs.
// Configurable via env vars:
//   RATE_LIMIT_WINDOW_MS   — time window in ms (default: 15 min)
//   RATE_LIMIT_MAX         — max requests per window per IP (default: 20)
const rateLimitWindowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '900000', 10); // 15 min
const rateLimitMax      = parseInt(process.env.RATE_LIMIT_MAX ?? '20', 10);

const apiLimiter = rateLimit({
  windowMs: rateLimitWindowMs,
  max: rateLimitMax,
  standardHeaders: true,  // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false,
  message: {
    error: `Too many requests — limit is ${rateLimitMax} per ${rateLimitWindowMs / 60000} minutes per IP. Try again later.`
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/parse', parseRouter);
app.use('/api/analyze', apiLimiter, analyzeRouter);
app.use('/api/analyze-repo', apiLimiter, analyzeRepoRouter);

// Health check (no rate limit — used by deployment platforms)
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'CodeViz AI Server running', time: new Date().toISOString() });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 CodeViz AI Server running on http://localhost:${PORT}`);
  console.log(`   Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing (set GEMINI_API_KEY in .env)'}`);
  console.log(`   CORS origins:   ${corsOrigins.join(', ')}`);
  console.log(`   Rate limit:     ${rateLimitMax} req / ${rateLimitWindowMs / 60000}min per IP`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/health`);
  console.log(`     POST /api/parse`);
  console.log(`     POST /api/analyze`);
  console.log(`     POST /api/analyze-repo\n`);
});
