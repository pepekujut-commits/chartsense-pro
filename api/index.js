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

// ─── ENDPOINTS ───

// 1. Sync user status (credits + pro)
app.get('/status', (req, res) => {
  const ip = req.ip;
  if (!usageStats[ip]) {
    usageStats[ip] = { count: 0, isPro: false };
  }
  
  res.json({
    creditsRemaining: Math.max(0, FREE_LIMIT - usageStats[ip].count),
    isPro: usageStats[ip].isPro
  });
});

// 2. Mock Checkout (UPGRADE TO PRO)
app.post('/checkout', (req, res) => {
  const ip = req.ip;
  if (!usageStats[ip]) usageStats[ip] = { count: 0, isPro: false };
  
  usageStats[ip].isPro = true;
  console.log(`[Billing] User upgraded to PRO: ${ip}`);
  
  res.json({ success: true, message: 'Upgraded to PRO' });
});

// 3. Main Analysis Proxy
app.post('/analyze', async (req, res) => {
  const ip = req.ip;
  const API_KEY = process.env.GEMINI_API_KEY;

  if (!usageStats[ip]) {
    usageStats[ip] = { count: 0, isPro: false };
  }

  // Check Limit
  if (!usageStats[ip].isPro && usageStats[ip].count >= FREE_LIMIT) {
    return res.status(403).json({ 
      error: { message: 'Out of free analyses. Please upgrade to Pro.' } 
    });
  }

  const { model, contents, generationConfig } = req.body;
  console.log(`[Backend] Analyzing with model: ${model} for IP: ${ip} (Pro: ${usageStats[ip].isPro})`);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, generationConfig })
    });

    const data = await response.json();

    if (response.ok) {
      if (!usageStats[ip].isPro) {
        usageStats[ip].count++;
      }
      
      return res.json({
        ...data,
        creditsRemaining: usageStats[ip].isPro ? null : Math.max(0, FREE_LIMIT - usageStats[ip].count)
      });
    } else {
      console.error('[Backend] Google API Error:', data);
      return res.status(response.status).json({ 
        error: { message: 'Technical Analysis failed. Please try again later.' } 
      });
    }
  } catch (error) {
    console.error('[Backend] Critical Error:', error);
    res.status(500).json({ error: { message: 'Internal server proxy error' } });
  }
});

// 4. Utility: List models
app.get('/models', async (req, res) => {
  const API_KEY = process.env.GEMINI_API_KEY;
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Standard Vercel Export
module.exports = app;
