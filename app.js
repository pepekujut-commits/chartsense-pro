/* ─────────────────────────────────────────
   ChartSense AI — Core Logic (Premium SaaS)
───────────────────────────────────────── */

const CONFIG = {
  DEFAULT_MODEL: 'gemini-2.5-flash',
  BACKEND_URL: '/api/analyze',
  STATUS_URL: '/api/status',
  CHECKOUT_URL: '/api/checkout'
};

// ─── STATE ───
let state = {
  model: CONFIG.DEFAULT_MODEL,
  creditsRemaining: 3,
  isPro: false,
  selectedFile: null,
  isAnalyzing: false
};

// ─── DOM ELEMENTS ───
const el = {
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('fileInput'),
  previewImg: document.getElementById('previewImg'),
  dropzoneInner: document.getElementById('dropzoneInner'),
  tickerInput: document.getElementById('tickerInput'),
  timeframeSelect: document.getElementById('timeframeSelect'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  analyzeBtnText: document.getElementById('analyzeBtnText'),
  spinner: document.getElementById('spinner'),
  creditsCount: document.getElementById('creditsCount'),
  paywallNote: document.getElementById('paywallNote'),
  upgradeBtn: document.getElementById('upgradeBtn'),
  
  resultsPlaceholder: document.getElementById('resultsPlaceholder'),
  resultsPanel: document.getElementById('resultsPanel'),
  resultsContent: document.getElementById('resultsContent'),
  verdictBadge: document.getElementById('verdictBadge'),
  verdictTicker: document.getElementById('verdictTicker'),
  verdictTf: document.getElementById('verdictTf'),
  confidencePct: document.getElementById('confidencePct'),
  ringFill: document.getElementById('ringFill'),
  pillsRow: document.getElementById('pillsRow'),
  levelsGrid: document.getElementById('levelsGrid'),
  reasoningBox: document.getElementById('reasoningBox'),
  riskRow: document.getElementById('riskRow'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),

  checkoutModal: document.getElementById('checkoutModal'),
  closeCheckout: document.getElementById('closeCheckout'),
  completeCheckout: document.getElementById('completeCheckout')
};

// ─── INIT ───
async function init() {
  await syncStatus();
  setupEventListeners();
}

async function syncStatus() {
  try {
    const response = await fetch(CONFIG.STATUS_URL);
    const data = await response.json();
    state.creditsRemaining = data.creditsRemaining;
    state.isPro = data.isPro;
    updateCreditsUI();
    checkAnalyzeStatus();
  } catch (e) {
    console.error('Failed to sync status:', e);
  }
}

function setupEventListeners() {
  // Upload handlers
  el.dropzone.onclick = () => el.fileInput.click();
  el.fileInput.onchange = (e) => handleFile(e.target.files[0]);
  
  el.dropzone.ondragover = (e) => { e.preventDefault(); el.dropzone.classList.add('drag-over'); };
  el.dropzone.ondragleave = () => el.dropzone.classList.remove('drag-over');
  el.dropzone.ondrop = (e) => {
    e.preventDefault();
    el.dropzone.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  };

  // Analysis
  el.analyzeBtn.onclick = startAnalysis;

  // Monetization
  el.upgradeBtn.onclick = () => el.checkoutModal.classList.remove('hidden');
  el.closeCheckout.onclick = () => el.checkoutModal.classList.add('hidden');
  el.completeCheckout.onclick = handlePayment;
  el.exportPdfBtn.onclick = exportToPdf;

  // Paywall triggers
  document.querySelectorAll('.link-btn').forEach(btn => {
    btn.addEventListener('click', () => el.checkoutModal.classList.remove('hidden'));
  });
}

// ─── FILE HANDLING ───
function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  
  state.selectedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    el.previewImg.src = e.target.result;
    el.previewImg.classList.remove('hidden');
    el.dropzoneInner.classList.add('hidden');
    el.dropzone.classList.add('has-image');
    checkAnalyzeStatus();
  };
  reader.readAsDataURL(file);
}

// ─── CREDITS & STATUS ───
function updateCreditsUI() {
  if (state.isPro) {
    el.creditsCount.textContent = '∞';
    el.creditsCount.classList.remove('out');
    el.creditsCount.style.color = 'var(--purple)';
    el.paywallNote.classList.add('hidden');
    el.upgradeBtn.innerHTML = '✨ Pro Active';
    el.upgradeBtn.style.color = 'var(--purple)';
    el.upgradeBtn.disabled = true;
    return;
  }

  el.creditsCount.textContent = state.creditsRemaining;
  
  if (state.creditsRemaining <= 0) {
    el.creditsCount.classList.add('out');
    el.paywallNote.classList.remove('hidden');
    checkAnalyzeStatus();
  } else {
    el.creditsCount.classList.remove('out');
    el.paywallNote.classList.add('hidden');
  }
}

function checkAnalyzeStatus() {
  const hasImage = !!state.selectedFile;
  const hasCredits = state.creditsRemaining > 0 || state.isPro;
  el.analyzeBtn.disabled = !hasImage || !hasCredits || state.isAnalyzing;
}

// ─── MONETIZATION LOGIC ───
async function handlePayment() {
  const btn = el.completeCheckout;
  const originalText = btn.innerHTML;
  
  btn.disabled = true;
  btn.innerHTML = `<div class="spinner"></div> <span>Processing...</span>`;
  
  try {
    // Simulate API delay
    await new Promise(r => setTimeout(r, 2000));
    
    // Call server to upgrade
    const response = await fetch(CONFIG.CHECKOUT_URL, { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      state.isPro = true;
      el.checkoutModal.classList.add('hidden');
      updateCreditsUI();
      checkAnalyzeStatus();
      
      // Fun success animation/confetti could go here
      alert('🚀 Welcome to Pro! You now have unlimited analyses.');
    }
  } catch (e) {
    alert('Payment simulation failed. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

function exportToPdf() {
  if (!state.isPro) {
    el.checkoutModal.classList.remove('hidden');
    return;
  }
  
  const ticker = el.verdictTicker.textContent || 'Chart';
  window.print(); // Simple PDF export via browser print
}

// ─── ANALYSIS LOGIC ───
async function startAnalysis() {
  if (state.isAnalyzing) return;
  
  const ticker = el.tickerInput.value.trim() || 'Unspecified Asset';
  const tf = el.timeframeSelect.value || 'Unspecified Timeframe';
  
  setLoading(true);
  
  try {
    const base64Image = await fileToBase64(state.selectedFile);
    const result = await callGemini(base64Image, ticker, tf);
    
    renderResults(result, ticker, tf);
    
    // Update local state from server response if available
    if (result.creditsRemaining !== undefined) {
      state.creditsRemaining = result.creditsRemaining;
      updateCreditsUI();
    }
    
    el.resultsPanel.scrollIntoView({ behavior: 'smooth' });
    
  } catch (err) {
    console.error('Analysis failed:', err);
    showError(err.message);
  } finally {
    setLoading(false);
  }
}

function showError(msg) {
  el.resultsPlaceholder.classList.add('hidden');
  el.resultsContent.classList.remove('hidden');
  el.resultsContent.innerHTML = `
    <div class="api-status err" style="margin-bottom: 20px;">
      <strong>⚠️ Error:</strong> ${msg}
    </div>
    <p style="color: var(--text-muted); font-size: 14px;">
      If the issue persists, please contact support or check your internet connection.
    </p>
    <button class="btn-ghost" onclick="location.reload()" style="margin-top: 20px;">Reload App</button>
  `;
}

function setLoading(val) {
  state.isAnalyzing = val;
  el.analyzeBtn.disabled = val;
  el.spinner.classList.toggle('hidden', !val);
  el.analyzeBtnText.textContent = val ? 'Analyzing Network...' : 'Analyze Chart';
}

async function callGemini(base64Data, ticker, timeframe) {
  const imageData = base64Data.split(',')[1];
  
  const userPrompt = `
    Analyze this trading chart for ${ticker} on the ${timeframe} timeframe.
    Look for:
    1. Overall trend (bullish, bearish, neutral).
    2. Key support and resistance levels.
    3. Technical patterns (e.g. head & shoulders, triangles, wedges).
    4. Indicators present (RSI, MACD, Moving Averages, Volume).
    5. A final recommendation: BUY, SELL, or HOLD.
    
    Return ONLY a JSON object with this structure:
    {
      "verdict": "BUY" | "SELL" | "HOLD",
      "confidence": 0-100,
      "signals": [
        {"label": "Strong RSI Overbought", "type": "bearish"},
        {"label": "Testing Resistance", "type": "caution"},
        {"label": "Ascending Triangle", "type": "bullish"}
      ],
      "levels": {
        "support": "$150.20",
        "resistance": "$165.00",
        "target": "$180.00",
        "stop_loss": "$145.00"
      },
      "reasoning": "Brief 3-4 sentence technical explanation.",
      "risk_note": "Specific risk concern for this chart."
    }
  `;

  const response = await fetch(CONFIG.BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: state.model,
      contents: [{
        parts: [
          { text: userPrompt },
          { inline_data: { mime_type: "image/jpeg", data: imageData } }
        ]
      }],
      generationConfig: {
        response_mime_type: "application/json"
      }
    })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || 'Server analysis failed');
  }

  // Parse the candidates to get the JSON text
  const textBody = data.candidates[0].content.parts[0].text;
  const parsed = JSON.parse(textBody);

  return { ...parsed, creditsRemaining: data.creditsRemaining };
}

// ─── RENDERING ───
function renderResults(data, ticker, tf) {
  el.resultsPlaceholder.classList.add('hidden');
  el.resultsContent.classList.remove('hidden');
  
  // Verdict
  el.verdictBadge.textContent = data.verdict;
  el.verdictBadge.className = `verdict-badge ${data.verdict.toLowerCase()}`;
  el.verdictTicker.textContent = ticker;
  el.verdictTf.textContent = tf;
  
  // Confidence
  el.confidencePct.textContent = `${data.confidence}%`;
  const offset = 163.4 - (163.4 * (data.confidence / 100));
  el.ringFill.style.strokeDashoffset = offset;
  
  // Colors for ring
  if (data.verdict === 'BUY') el.ringFill.style.stroke = 'var(--green)';
  else if (data.verdict === 'SELL') el.ringFill.style.stroke = 'var(--red)';
  else el.ringFill.style.stroke = 'var(--yellow)';

  // Signals
  el.pillsRow.innerHTML = data.signals.map(s => `
    <span class="pill ${s.type}">${s.label}</span>
  `).join('');

  // Levels
  el.levelsGrid.innerHTML = `
    <div class="level-item support">
      <div class="level-label">Support</div>
      <div class="level-value">${data.levels.support || 'N/A'}</div>
    </div>
    <div class="level-item resistance">
      <div class="level-label">Resistance</div>
      <div class="level-value">${data.levels.resistance || 'N/A'}</div>
    </div>
    <div class="level-item target">
      <div class="level-label">Target</div>
      <div class="level-value">${data.levels.target || 'N/A'}</div>
    </div>
    <div class="level-item stop">
      <div class="level-label">Stop Loss</div>
      <div class="level-value">${data.levels.stop_loss || 'N/A'}</div>
    </div>
  `;

  // Reasoning
  el.reasoningBox.textContent = data.reasoning;
  
  // Risk
  el.riskRow.innerHTML = `<strong>⚠️ Risk Factor:</strong> ${data.risk_note}`;
}

// ─── HELPERS ───
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

// Start the app
init();
