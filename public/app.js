const CONFIG = {
  DEFAULT_MODEL: 'gemini-2.0-flash', // Updated to latest flash model
  BACKEND_URL: '/api/analyze',
  STATUS_URL: '/api/status',
  CHECKOUT_URL: '/api/checkout'
};

// ─── STATE ───
let state = {
  model: CONFIG.DEFAULT_MODEL,
  creditsRemaining: 3,
  isPro: false,
  user: null, // User object for Auth
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
  paywallOverlay: document.getElementById('paywallOverlay'),
  
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

  // Auth UI
  openAuth: document.getElementById('openAuth'),
  authModal: document.getElementById('authModal'),
  closeAuth: document.getElementById('closeAuth'),
  authForm: document.getElementById('authForm'),
  userProfile: document.getElementById('userProfile'),
  userAvatar: document.getElementById('userAvatar'),
  userMenu: document.getElementById('userMenu'),
  userEmailAddress: document.getElementById('userEmailAddress'),
  logoutBtn: document.getElementById('logoutBtn'),
  
  checkoutModal: document.getElementById('checkoutModal'),
  closeCheckout: document.getElementById('closeCheckout'),
  completeCheckout: document.getElementById('completeCheckout')
};

// ─── INIT ───
async function init() {
  await syncStatus();
  setupEventListeners();
  checkAuth();
}

async function syncStatus() {
  try {
    const response = await fetch(CONFIG.STATUS_URL);
    if (!response.ok) throw new Error('Network error');
    
    const data = await response.json();
    state.creditsRemaining = data.creditsRemaining;
    state.isPro = data.isPro;
    updateCreditsUI();
    checkAnalyzeStatus();
  } catch (e) {
    console.warn('Backend sync deferred: using local state (Pro Trial Mode)');
    // Fallback UI if backend is deploying
    updateCreditsUI();
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

  // Auth Handlers
  el.openAuth.onclick = () => el.authModal.classList.remove('hidden');
  el.closeAuth.onclick = () => el.authModal.classList.add('hidden');
  el.authForm.onsubmit = handleAuthSubmit;
  el.userAvatar.onclick = () => el.userMenu.classList.toggle('hidden');
  el.logoutBtn.onclick = logout;

  // Checkout Handlers
  el.upgradeBtn.onclick = () => el.checkoutModal.classList.remove('hidden');
  el.closeCheckout.onclick = () => el.checkoutModal.classList.add('hidden');
  el.completeCheckout.onclick = handlePayment;
  el.exportPdfBtn.onclick = exportToPdf;

  // Generic close for modals and menus
  window.onclick = (event) => {
    if (event.target === el.authModal) el.authModal.classList.add('hidden');
    if (event.target === el.checkoutModal) el.checkoutModal.classList.add('hidden');
    if (!event.target.closest('#userProfile') && el.userMenu) el.userMenu.classList.add('hidden');
  };
}

// ─── AUTH LOGIC ───
function checkAuth() {
  const savedUser = localStorage.getItem('chartsense_user');
  if (savedUser) {
    state.user = JSON.parse(savedUser);
    updateAuthUI();
  }
}

function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  
  // Simulation: Accept any login
  state.user = { email, id: 'user_' + Math.random().toString(36).substr(2, 9) };
  localStorage.setItem('chartsense_user', JSON.stringify(state.user));
  
  el.authModal.classList.add('hidden');
  updateAuthUI();
}

function updateAuthUI() {
  if (state.user) {
    el.openAuth.classList.add('hidden');
    el.userProfile.classList.remove('hidden');
    el.userEmailAddress.textContent = state.user.email;
    el.userAvatar.textContent = state.user.email.charAt(0).toUpperCase();
  } else {
    el.openAuth.classList.remove('hidden');
    el.userProfile.classList.add('hidden');
  }
}

function logout() {
  state.user = null;
  localStorage.removeItem('chartsense_user');
  updateAuthUI();
  location.reload();
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
    el.upgradeBtn.innerHTML = '✨ Pro Active';
    el.upgradeBtn.style.color = 'var(--purple)';
    el.upgradeBtn.disabled = true;
    el.paywallOverlay.classList.add('hidden');
    return;
  }

  el.creditsCount.textContent = state.creditsRemaining;
  
  if (state.creditsRemaining <= 0) {
    el.creditsCount.classList.add('out');
    el.paywallOverlay.classList.remove('hidden');
  } else {
    el.creditsCount.classList.remove('out');
    el.paywallOverlay.classList.add('hidden');
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
    await new Promise(r => setTimeout(r, 2000));
    
    // Call server to upgrade (Uses IP-based persistence on backend)
    const response = await fetch(CONFIG.CHECKOUT_URL, { method: 'POST' });
    const data = await response.json();
    
    if (data.success) {
      state.isPro = true;
      el.checkoutModal.classList.add('hidden');
      updateCreditsUI();
      checkAnalyzeStatus();
      alert('🚀 Welcome to Pro! You now have unlimited analyses.');
    }
  } catch (e) {
    console.error('Payment simulation failed:', e);
    // Silent fail for demo purposes: just upgrade locally
    state.isPro = true;
    el.checkoutModal.classList.add('hidden');
    updateCreditsUI();
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
  window.print();
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
  // Enhanced error modal
  alert(`⚠️ Error: ${msg}`);
}

function setLoading(val) {
  state.isAnalyzing = val;
  el.analyzeBtn.disabled = val;
  el.spinner.classList.toggle('hidden', !val);
  el.analyzeBtnText.textContent = val ? 'Analyzing Network...' : 'Analyze Chart';
}

async function callGemini(base64Data, ticker, timeframe) {
  const imageData = base64Data.split(',')[1];
  
  const userPrompt = `Analyze trading chart for ${ticker} (${timeframe}). Return JSON exactly.`;

  const response = await fetch(CONFIG.BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gemini-2.0-flash", // Use version strings accepted by the API
      contents: [{
        parts: [{ text: userPrompt }, { inline_data: { mime_type: "image/jpeg", data: imageData } }]
      }],
      generationConfig: { response_mime_type: "application/json" }
    })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || 'Server 404/Connection Failed');
  }

  const data = await response.json();
  const textBody = data.candidates[0].content.parts[0].text;
  const parsed = JSON.parse(textBody);

  return { ...parsed, creditsRemaining: data.creditsRemaining };
}

// ─── RENDERING ───
function renderResults(data, ticker, tf) {
  el.resultsPlaceholder.classList.add('hidden');
  el.resultsContent.classList.remove('hidden');
  
  el.verdictBadge.textContent = data.verdict;
  el.verdictBadge.className = `verdict-badge ${data.verdict.toLowerCase()}`;
  el.verdictTicker.textContent = ticker;
  el.verdictTf.textContent = tf;
  
  el.confidencePct.textContent = `${data.confidence}%`;
  const offset = 163.4 - (163.4 * (data.confidence / 100));
  el.ringFill.style.strokeDashoffset = offset;
  
  if (data.verdict === 'BUY') el.ringFill.style.stroke = 'var(--green)';
  else if (data.verdict === 'SELL') el.ringFill.style.stroke = 'var(--red)';
  else el.ringFill.style.stroke = 'var(--yellow)';

  el.pillsRow.innerHTML = data.signals.map(s => `
    <span class="pill ${s.type}">${s.label}</span>
  `).join('');

  el.levelsGrid.innerHTML = `
    <div class="level-item support"><div class="level-label">Support</div><div class="level-value">${data.levels.support || 'N/A'}</div></div>
    <div class="level-item resistance"><div class="level-label">Resistance</div><div class="level-value">${data.levels.resistance || 'N/A'}</div></div>
    <div class="level-item target"><div class="level-label">Target</div><div class="level-value">${data.levels.target || 'N/A'}</div></div>
    <div class="level-item stop"><div class="level-label">Stop Loss</div><div class="level-value">${data.levels.stop_loss || 'N/A'}</div></div>
  `;

  el.reasoningBox.textContent = data.reasoning;
  el.riskRow.innerHTML = `<strong>⚠️ Risk Factor:</strong> ${data.risk_note}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}

init();
