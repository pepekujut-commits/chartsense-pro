require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── MIDDLEWARE ───
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ─── SERVE FRONTEND ───
// On Vercel, static files in the root are served automatically.
// However, if the API is configured to handle the root, we serve the file manually.
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Explicitly serve other static assets if needed
app.use(express.static(path.join(__dirname, '../')));

// ─── IN-MEMORY STATE ───
const usageStats = {}; // { ip: { count: number, isPro: boolean } }
const FREE_LIMIT = 3;

// ─── ROUTES (API) ───
const router = express.Router();

// 1. Sync user status (credits + pro)
router.get('/status', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip;
  if (!usageStats[ip]) {
    usageStats[ip] = { count: 0, isPro: false };
  }
  
  res.json({
    creditsRemaining: Math.max(0, FREE_LIMIT - usageStats[ip].count),
    isPro: usageStats[ip].isPro
  });
});

// 2. Mock Checkout (UPGRADE TO PRO)
router.post('/checkout', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip;
  if (!usageStats[ip]) usageStats[ip] = { count: 0, isPro: false };
  
  usageStats[ip].isPro = true;
  console.log(`[Billing] User upgraded to PRO: ${ip}`);
  
  res.json({ success: true, message: 'Upgraded to PRO' });
});

// 3. Main Analysis Proxy
router.post('/analyze', async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!usageStats[ip]) usageStats[ip] = { count: 0, isPro: false };

  // Check Limit
  if (!usageStats[ip].isPro && usageStats[ip].count >= FREE_LIMIT) {
    return res.status(403).json({ 
      error: { message: 'Out of free analyses. Please upgrade to Pro.' } 
    });
  }

  const { model, contents, generationConfig } = req.body;
  const analysisModel = model || "gemini-2.0-flash";

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${analysisModel}:generateContent?key=${API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig })
    });

    const data = await response.json();

    if (response.ok) {
      if (!usageStats[ip].isPro) usageStats[ip].count++;
      
      return res.json({
        ...data,
        creditsRemaining: usageStats[ip].isPro ? null : Math.max(0, FREE_LIMIT - usageStats[ip].count)
      });
    } else {
      return res.status(response.status).json(data);
    }
  } catch (error) {
    res.status(500).json({ error: { message: 'Internal server proxy error' } });
  }
});

// Mount the router
app.use('/api', router);
// Support legacy/direct calls without /api if needed (for local)
app.use(router);

// ─── SERVE FRONTEND (NUCLEAR FALLBACK) ───
// This ensures that even if Vercel routes incorrectly, the API can serve the UI.
app.get('*', (req, res) => {
  // If it's an API route that wasn't caught above, send 404 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { message: 'API Endpoint not found' } });
  }
  // Otherwise, always serve the main website
  res.sendFile(path.join(__dirname, '../index.html'));
});

// Standard Vercel Export
module.exports = app;
