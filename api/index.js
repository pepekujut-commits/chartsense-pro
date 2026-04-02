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

// ─── SERVE FRONTEND (DEVELOPMENT ONLY) ───
if (process.env.NODE_ENV !== 'production') {
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
  });
  app.use(express.static(path.join(__dirname, '../')));
}

// ─── IN-MEMORY STATE ───
const usageStats = {}; // { ip: { count: number, isPro: boolean } }
const FREE_LIMIT = 3;

// ─── ROUTES (API) ───

// 1. Sync user status (credits + pro)
app.get(['/api/status', '/status'], (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  if (!usageStats[ip]) {
    usageStats[ip] = { count: 0, isPro: false };
  }
  
  res.json({
    creditsRemaining: Math.max(0, FREE_LIMIT - usageStats[ip].count),
    isPro: usageStats[ip].isPro
  });
});

// 2. Mock Checkout (UPGRADE TO PRO)
app.post(['/api/checkout', '/checkout'], (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  if (!usageStats[ip]) usageStats[ip] = { count: 0, isPro: false };
  
  usageStats[ip].isPro = true;
  console.log(`[Billing] User upgraded to PRO: ${ip}`);
  
  res.json({ success: true, message: 'Upgraded to PRO' });
});

// 3. Main Analysis Proxy
app.post(['/api/analyze', '/analyze'], async (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: { message: 'Server configuration error: Missing API Key' } });
  }

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

// ─── CATCH-ALL API 404 ───
app.get('/api/*', (req, res) => {
  res.status(404).json({ error: { message: 'API Endpoint not found: ' + req.path } });
});

// Standard Vercel Export
module.exports = app;

if (process.env.NODE_ENV !== 'production' && require.main === module) {
  app.listen(PORT, () => console.log(`Local dev server running on http://localhost:${PORT}`));
}
