const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const parseRouter = require('./routes/parse');
const analyzeRouter = require('./routes/analyze');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/parse', parseRouter);
app.use('/api/analyze', analyzeRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'CodeViz AI Server running', time: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n🚀 CodeViz AI Server running on http://localhost:${PORT}`);
  console.log(`   Gemini API Key: ${process.env.GEMINI_API_KEY ? '✅ Configured' : '❌ Missing (set GEMINI_API_KEY in .env)'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/health`);
  console.log(`     POST /api/parse`);
  console.log(`     POST /api/analyze\n`);
});
