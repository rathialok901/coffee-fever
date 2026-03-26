/* =============================================
   COFFEE FEVER — Main App JS
   ============================================= */

// ---- CONFIG ----
const GITHUB_OWNER  = 'rathialok901';
const CURRENCY      = '₹';
const GEAR_TO_METHOD = {
  'v60':                'V60 / Pour Over',
  'french-press':       'French Press',
  'moka-pot':           'Moka Pot',
  'clever-dripper':     'Clever Dripper',
  'south-indian-filter':'South Indian Filter',
  'espresso':           'Basic Home Espresso'
};
const GITHUB_REPO   = 'coffee-fever';
const GITHUB_BRANCH = 'main';

const PAGE_SIZE = { catalog: 9, journal: 9, gear: 6, recipes: 12, dispatches: 9 };

// ---- STATE ----
const state = {
  gear:     [],
  roasters: [],
  journal:  [],
  recipes:  [],
  coffees:  [],
  posts:    [],
  activeSection: 'catalog',
  search:   '',
  filters:  { coffee: '', roaster: '', roastLevel: '', method: '', taste: '', days: '7' },
  catalogStatus: 'current',
  catalogFilters: { roaster: '', roastLevel: '', process: '' },
  recipeFilter: '',
  dispatchFilter: '',
  adminMode: false,
  pages: { catalog: 1, journal: 1, gear: 1, recipes: 1, dispatches: 1 }
};

// ---- UTILITIES ----
function $(id) { return document.getElementById(id); }

function showToast(msg, type = '') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' toast-' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3000);
}

function highlight(text, query) {
  if (!query || !text) return text || '';
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return String(text).replace(re, '<mark class="search-highlight">$1</mark>');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function daysLasted(dateAdded, dateFinished) {
  if (!dateAdded || !dateFinished) return null;
  const d = Math.round((new Date(dateFinished + 'T00:00:00') - new Date(dateAdded + 'T00:00:00')) / 86400000);
  return d > 0 ? d : null;
}

function fmtCost(n) {
  return CURRENCY + Number(n).toLocaleString('en-IN');
}

function getFreshness(roastDate) {
  if (!roastDate) return null;
  const days = Math.floor((Date.now() - new Date(roastDate + 'T00:00:00')) / 86400000);
  if (days < 0)  return { label: 'Pre-roast',        cls: 'fresh-pre' };
  if (days < 7)  return { label: days + 'd · Degassing', cls: 'fresh-early' };
  if (days < 21) return { label: days + 'd · Peak',      cls: 'fresh-peak' };
  if (days < 35) return { label: days + 'd · Good',      cls: 'fresh-good' };
  if (days < 60) return { label: days + 'd · Fading',    cls: 'fresh-fading' };
  return           { label: days + 'd · Stale',      cls: 'fresh-stale' };
}

function calcBrewStreak() {
  if (!state.journal.length) return 0;
  const dates = new Set(state.journal.map(e => e.date));
  let streak = 0;
  const d = new Date(); d.setHours(0,0,0,0);
  const fmt = x => x.toISOString().split('T')[0];
  // Allow today or yesterday as starting point
  if (!dates.has(fmt(d))) { d.setDate(d.getDate() - 1); }
  while (dates.has(fmt(d))) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ---- PAGINATION ----
function setPage(section, page) {
  state.pages[section] = page;
  renderSection(section);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function buildPagination(total, section) {
  const size = PAGE_SIZE[section] || 9;
  const current = state.pages[section] || 1;
  const totalPages = Math.ceil(total / size);
  if (totalPages <= 1) return '';

  const start = (current - 1) * size + 1;
  const end = Math.min(current * size, total);

  let pages = [];
  // Always show first, last, and current ±1
  const range = new Set([1, totalPages, current, current - 1, current + 1].filter(p => p >= 1 && p <= totalPages));
  const sorted = [...range].sort((a, b) => a - b);
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) pages.push('…');
    pages.push(p);
    prev = p;
  }

  const pageButtons = pages.map(p => p === '…'
    ? `<span class="pagination-info">…</span>`
    : `<button class="pagination-btn ${p === current ? 'active' : ''}" onclick="setPage('${section}', ${p})">${p}</button>`
  ).join('');

  return `<div class="pagination">
    <button class="pagination-btn" onclick="setPage('${section}', ${current - 1})" ${current === 1 ? 'disabled' : ''}>← Prev</button>
    ${pageButtons}
    <button class="pagination-btn" onclick="setPage('${section}', ${current + 1})" ${current === totalPages ? 'disabled' : ''}>Next →</button>
    <span class="pagination-info">${start}–${end} of ${total}</span>
  </div>`;
}

function getTasteClass(tag) {
  if (!tag) return 'default';
  const t = tag.toLowerCase();
  if (t.includes('fruity') || t.includes('bright') || t.includes('berry')) return 'fruity';
  if (t.includes('choc') || t.includes('cocoa')) return 'chocolatey';
  if (t.includes('nutty') || t.includes('almond') || t.includes('hazelnut')) return 'nutty';
  if (t.includes('floral') || t.includes('delicate') || t.includes('jasmine')) return 'floral';
  if (t.includes('earthy') || t.includes('smoky') || t.includes('tobacco')) return 'earthy';
  if (t.includes('caramel') || t.includes('toffee') || t.includes('honey')) return 'caramel';
  if (t.includes('brown sugar') || t.includes('molasses')) return 'brown-sugar';
  if (t.includes('spicy') || t.includes('complex') || t.includes('pepper')) return 'spicy';
  if (t.includes('citrus') || t.includes('lemon') || t.includes('orange') || t.includes('acidic')) return 'citrus';
  return 'default';
}

function buildCardImage(imagePath, altText, showEditBtn = false, editCb = null) {
  const hasImg = !!imagePath;
  const editHtml = (showEditBtn && editCb)
    ? `<button class="card-edit-btn" data-action="edit" aria-label="Edit">✏️ Edit</button>`
    : '';
  if (hasImg) {
    return `<div class="card-image">
      ${editHtml}
      <img src="${imagePath}" alt="${altText}" loading="lazy"
           onerror="this.parentElement.classList.add('card-image--fallback');this.remove();" />
    </div>`;
  }
  return `<div class="card-image card-image--fallback">
    ${editHtml}
  </div>`;
}

function starsHtml(rating) {
  if (!rating) return '';
  const r = Math.round(rating);
  return '★'.repeat(r) + '☆'.repeat(5 - r);
}

// ---- CRYPTO (admin password hashing) ----
async function hashPassword(pw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- GITHUB API ----
async function loadJSON(path) {
  try {
    const r = await fetch(path + '?v=' + Date.now());
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

async function getFileSha(filename) {
  const pat = localStorage.getItem('cf_pat');
  if (!pat) throw new Error('No GitHub token set — enter it in the admin panel');
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`;
  const headers = { Authorization: `token ${pat}`, Accept: 'application/vnd.github+json' };
  const res = await fetch(url, { headers });
  if (!res.ok) {
    if (res.status === 401) throw new Error('GitHub token invalid or expired');
    if (res.status === 404) return null; // File doesn't exist yet (e.g. first image)
    throw new Error(`GitHub API error: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.sha || null;
}

async function writeDataFile(filename, updatedData, commitMessage) {
  const pat = localStorage.getItem('cf_pat');
  if (!pat) throw new Error('No GitHub token set — enter it in the admin panel');

  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filename}`;
  const headers = {
    Authorization: `token ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json'
  };

  // Step 1: Get current SHA (null if file doesn't exist yet)
  const getRes = await fetch(url, { headers });
  if (!getRes.ok && getRes.status === 401) throw new Error('GitHub token invalid or expired');
  let sha = null;
  if (getRes.ok) {
    const current = await getRes.json();
    sha = current.sha || null;
  }

  // Step 2: Encode updated JSON content
  const jsonStr = JSON.stringify(updatedData, null, 2);
  const content = btoa(unescape(encodeURIComponent(jsonStr)));

  // Step 3: PUT updated file (omit sha for new files)
  const body = { message: commitMessage, content, branch: GITHUB_BRANCH };
  if (sha) body.sha = sha;

  const putRes = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    if (putRes.status === 401) throw new Error('GitHub token invalid or expired');
    if (putRes.status === 409) throw new Error('Conflict — please refresh the page and try again');
    throw new Error(err.message || `Save failed: HTTP ${putRes.status}`);
  }

  return putRes.json();
}

async function resizeImage(file, maxWidth = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
    img.src = url;
  });
}

async function uploadImageFile(file, category, itemId) {
  const pat = localStorage.getItem('cf_pat');
  if (!pat) throw new Error('No GitHub token set — enter it in the admin panel');

  const base64 = await resizeImage(file);
  const ext = file.type === 'image/png' ? 'png' : 'jpg';
  const path = `images/${category}/${itemId}.${ext}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
  const headers = {
    Authorization: `token ${pat}`,
    'Content-Type': 'application/json',
    Accept: 'application/vnd.github+json'
  };

  // Check if file already exists (get SHA for update)
  let sha;
  const check = await fetch(url, { headers });
  if (check.ok) { const ex = await check.json(); sha = ex.sha; }

  const putRes = await fetch(url, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      message: `Add image: ${path}`,
      content: base64,
      ...(sha ? { sha } : {}),
      branch: GITHUB_BRANCH
    })
  });

  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(err.message || `Image upload failed: HTTP ${putRes.status}`);
  }

  return path; // return the relative path to store in JSON
}

// ---- DATA LOADING ----
async function loadAll() {
  const [gear, roasters, journal, recipes, coffees, posts] = await Promise.all([
    loadJSON('gear.json'),
    loadJSON('roasters.json'),
    loadJSON('journal.json'),
    loadJSON('recipes.json'),
    loadJSON('coffees.json'),
    loadJSON('posts.json')
  ]);
  state.gear     = gear;
  state.roasters = roasters;
  state.journal  = journal;
  state.recipes  = recipes;
  state.coffees  = coffees;
  state.posts    = posts;
  populateFilters();
  updateStatStrip();
  renderSection(state.activeSection);
  updateBottomNav(state.activeSection);
}

// ---- ADMIN MODE ----
function setAdminMode(active) {
  state.adminMode = active;
  // Toggle all admin-only elements
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = active ? '' : 'none';
  });
  // Update lock button
  const btn = $('adminLockBtn');
  btn.textContent = active ? '🔓' : '🔒';
  btn.classList.toggle('unlocked', active);
  const bnl = $('bottomNavLockIcon');
  if (bnl) bnl.textContent = active ? '🔓' : '🔒';
  // Admin badge in search bar
  const badge = $('adminBadge');
  badge.style.display = active ? 'flex' : 'none';
  // Re-render current section to show/hide edit buttons
  renderSection(state.activeSection);
}

function openAdminPanel() {
  $('adminPanel').classList.add('open');
  $('adminPanelOverlay').classList.add('visible');
  $('adminPanel').setAttribute('aria-hidden', 'false');
  // Check if password is already set
  const storedHash = localStorage.getItem('cf_admin_hash');
  const hint = $('adminHint');
  const setupNote = $('adminSetupNote');
  if (!storedHash) {
    hint.textContent = 'First time setup: choose an admin password for this site.';
    setupNote.style.display = 'block';
  } else {
    hint.textContent = state.adminMode
      ? 'Admin mode is active.'
      : 'Enter your admin password to unlock editing.';
    setupNote.style.display = 'none';
  }
  // If already admin, show controls directly
  if (state.adminMode) {
    $('adminLoginSection').style.display = 'none';
    $('adminControls').style.display = 'block';
    const savedPat = localStorage.getItem('cf_pat');
    if (savedPat) {
      $('githubTokenInput').value = '••••••••••••';
      $('patStatus').textContent = '✓ Token saved';
      $('patStatus').className = 'admin-pat-status ok';
    }
    const savedAnthropicKey = localStorage.getItem('cf_anthropic_key');
    if (savedAnthropicKey) {
      $('anthropicKeyInput').value = '••••••••••••';
      $('anthropicKeyStatus').textContent = '✓ Key saved — URL import active';
      $('anthropicKeyStatus').className = 'admin-pat-status ok';
    }
  } else {
    $('adminLoginSection').style.display = 'block';
    $('adminControls').style.display = 'none';
  }
  $('adminPasswordInput').focus();
}

function closeAdminPanel() {
  $('adminPanel').classList.remove('open');
  $('adminPanelOverlay').classList.remove('visible');
  $('adminPanel').setAttribute('aria-hidden', 'true');
  $('adminPasswordInput').value = '';
}

async function handleAdminLogin() {
  const pw = $('adminPasswordInput').value;
  if (!pw) { showToast('Please enter a password', 'error'); return; }

  const storedHash = localStorage.getItem('cf_admin_hash');
  const inputHash = await hashPassword(pw);

  if (!storedHash) {
    // First time: set the password
    localStorage.setItem('cf_admin_hash', inputHash);
    sessionStorage.setItem('cf_admin_unlocked', '1');
    setAdminMode(true);
    $('adminLoginSection').style.display = 'none';
    $('adminControls').style.display = 'block';
    showToast('Admin password set. You are now in admin mode.', 'success');
    $('adminHint').textContent = 'Admin mode is active.';
  } else if (inputHash === storedHash) {
    sessionStorage.setItem('cf_admin_unlocked', '1');
    setAdminMode(true);
    $('adminLoginSection').style.display = 'none';
    $('adminControls').style.display = 'block';
    showToast('Admin mode unlocked', 'success');
    $('adminHint').textContent = 'Admin mode is active.';
  } else {
    showToast('Incorrect password', 'error');
    $('adminPasswordInput').value = '';
    $('adminPasswordInput').focus();
  }
}

function handleAdminLogout() {
  sessionStorage.removeItem('cf_admin_unlocked');
  setAdminMode(false);
  closeAdminPanel();
  showToast('Admin mode locked');
}

function initAdmin() {
  // Check if already unlocked in this session
  if (sessionStorage.getItem('cf_admin_unlocked') === '1') {
    setAdminMode(true);
  }
  // Check URL param
  if (new URLSearchParams(window.location.search).has('admin')) {
    openAdminPanel();
  }
}

// ---- NAVIGATION ----
function setSection(name) {
  state.activeSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const sec = document.getElementById('section-' + name);
  if (sec) sec.classList.add('active');
  const link = document.querySelector(`.nav-link[data-section="${name}"]`);
  if (link) link.classList.add('active');
  $('mainNav')?.classList.remove('open');
  updateBottomNav(name);
  renderSection(name);
}

function updateBottomNav(name) {
  document.querySelectorAll('.bottom-nav-item[data-section]').forEach(el => {
    el.classList.toggle('active', el.dataset.section === name);
  });
  // Keep lock icon in sync
  const lockIcon = $('bottomNavLockIcon');
  if (lockIcon) lockIcon.textContent = state.adminMode ? '🔓' : '🔒';
}

function renderSection(name) {
  if (name === 'journal')    renderJournal();
  if (name === 'catalog')    { populateCatalogFilters(); renderCatalog(); }
  if (name === 'gear')       renderGear();
  if (name === 'recipes')    renderRecipes();
  if (name === 'dispatches') renderDispatches();
  if (name === 'spend')      renderSpend();
  if (name === 'insights')   renderInsights();
}

// ---- STAT STRIP ----
function updateStatStrip() {
  const j = state.journal;
  $('statCups').textContent     = j.length;
  $('statBeans').textContent    = new Set(j.map(e => e.coffeeId || e.beanName)).size;
  $('statRoasters').textContent = state.roasters.length;
  $('statMethods').textContent  = new Set(j.map(e => e.brewMethod).filter(Boolean)).size;
  $('statStreak').textContent   = calcBrewStreak();
}

// ---- FILTERS ----
function populateFilters() {
  // Coffee filter
  const coffeesel = $('filterCoffee');
  const existingCoffees = Array.from(coffeesel.options).map(o => o.value);
  state.coffees.forEach(c => {
    if (!existingCoffees.includes(c.id)) {
      const opt = document.createElement('option');
      opt.value = c.id; opt.textContent = c.name;
      coffeesel.appendChild(opt);
    }
  });
  // Roaster filter
  const rsel = $('filterRoaster');
  const existingR = Array.from(rsel.options).map(o => o.value);
  state.roasters.forEach(r => {
    if (!existingR.includes(r.id)) {
      const opt = document.createElement('option');
      opt.value = r.id; opt.textContent = r.name;
      rsel.appendChild(opt);
    }
  });
}

function populateCatalogFilters() {
  const rsel = $('catFilterRoaster');
  const existing = Array.from(rsel.options).map(o => o.value);
  state.roasters.forEach(r => {
    if (!existing.includes(r.id)) {
      const opt = document.createElement('option');
      opt.value = r.id; opt.textContent = r.name;
      rsel.appendChild(opt);
    }
  });
}

// ---- SECTION: JOURNAL ----
function getFilteredJournal() {
  const q = state.search.toLowerCase();
  const { coffee, roaster, roastLevel, method, taste, days } = state.filters;
  const cutoff = days ? Date.now() - parseInt(days) * 86400000 : null;
  return state.journal.filter(e => {
    if (coffee    && e.coffeeId !== coffee)                                                         return false;
    if (roaster   && e.roasterId !== roaster)                                                       return false;
    if (roastLevel && e.roastLevel !== roastLevel)                                                  return false;
    if (method    && e.brewMethod !== method)                                                       return false;
    if (taste     && !(e.tasteTags || []).some(t => t.toLowerCase().includes(taste.toLowerCase()))) return false;
    if (cutoff    && e.date && new Date(e.date + 'T00:00:00').getTime() < cutoff)                   return false;
    if (q) {
      const blob = [e.beanName, e.roasterName, e.origin, e.brewMethod, e.notes,
                    ...(e.tasteTags || [])].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function renderJournal() {
  const grid = $('journalGrid');
  const empty = $('journalEmpty');
  const entries = getFilteredJournal().sort((a, b) => b.date.localeCompare(a.date));

  Array.from(grid.children).forEach(c => { if (c !== empty) c.remove(); });
  // Remove old pagination
  const oldPag = $('journalPagination');
  if (oldPag) oldPag.remove();

  if (entries.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const page = state.pages.journal || 1;
  const size = PAGE_SIZE.journal;
  const sliced = entries.slice((page - 1) * size, page * size);

  sliced.forEach(e => {
    const card = buildJournalCard(e);
    grid.appendChild(card);
  });

  if (entries.length > size) {
    const pag = document.createElement('div');
    pag.id = 'journalPagination';
    pag.innerHTML = buildPagination(entries.length, 'journal');
    grid.parentElement.appendChild(pag);
  }
}

function buildJournalCard(e) {
  const q = state.search;
  const div = document.createElement('div');
  div.className = 'journal-card journal-card--compact';

  div.innerHTML = `
    <div class="jc-name">${highlight(e.beanName || 'Unnamed Bean', q)}</div>
    <div class="jc-method">${e.brewMethod || '—'}</div>
    <div class="jc-footer">
      <div class="jc-stars">${e.overallRating ? starsHtml(e.overallRating) : ''}</div>
      <div class="jc-date">${formatDate(e.date)}</div>
    </div>
  `;

  div.addEventListener('click', (ev) => {
    if (ev.target.closest('.card-edit-btn')) { ev.stopPropagation(); openJournalForm(e); return; }
    openJournalModal(e);
  });

  return div;
}

function openJournalModal(e) {
  const scores = e.scores || {};
  const coffee = e.coffeeId ? state.coffees.find(c => c.id === e.coffeeId) : null;
  const imgPath = e.image || (coffee && coffee.image) || null;

  $('modalBody').innerHTML = `
    ${imgPath ? `<img src="${imgPath}" class="modal-hero" alt="${e.beanName}" style="margin:-2rem -2rem 1.5rem;width:calc(100% + 4rem);border-radius:var(--radius) var(--radius) 0 0;" />` : ''}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem;">
      <h2 style="font-family:var(--font-display);font-size:1.65rem;color:var(--text);flex:1;">${e.beanName || 'Unnamed'}</h2>
      <span class="roast-badge" style="margin-left:0.75rem;flex-shrink:0;">${e.roastLevel || '—'}</span>
    </div>
    <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.25rem;">${[e.roasterName, e.origin].filter(Boolean).join(' · ')}</p>

    <div class="modal-detail-grid">
      ${[
        ['Date',        formatDate(e.date)],
        ['Brew Method', e.brewMethod],
        ['Grind',       e.grindClicks ? e.grindClicks + ' clicks' : e.grindLabel],
        ['Dose',        e.dose],
        ['Water',       e.water],
        ['Ratio',       e.ratio],
        ['Temp',        e.waterTemp],
        ['Time',        e.totalTime]
      ].filter(([,v]) => v).map(([l,v]) => `
        <div class="modal-detail-item">
          <div class="modal-detail-label">${l}</div>
          <div class="modal-detail-value">${v}</div>
        </div>
      `).join('')}
    </div>

    ${Object.keys(scores).length ? `
      <p class="modal-section-title">Scores</p>
      <div class="journal-scores" style="margin-bottom:1.25rem;">
        ${['acidity','body','sweetness','finish'].map(s => `
          <div class="score-item">
            <div class="score-label">${s}</div>
            <div class="score-bar-wrap"><div class="score-bar" style="width:${(scores[s]||0)*10}%"></div></div>
            <div class="score-num">${scores[s] ?? '—'}/10</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${e.notes ? `
      <p class="modal-section-title">Tasting Notes</p>
      <div class="recipe-notes-box" style="margin-bottom:1.25rem;">${e.notes}</div>
    ` : ''}

    ${(e.tasteTags||[]).length ? `
      <div class="journal-tags" style="margin-bottom:1rem;">
        ${e.tasteTags.map(t => `<span class="taste-tag ${getTasteClass(t)}">${t}</span>`).join('')}
      </div>
    ` : ''}

    ${e.overallRating ? `
      <div style="display:flex;align-items:center;gap:0.5rem;font-size:1.2rem;">
        <span class="star-rating">${starsHtml(e.overallRating)}</span>
        <span style="color:var(--text-muted);font-size:0.875rem;font-family:var(--font-mono);">${e.overallRating}/5</span>
      </div>
    ` : ''}

    ${(() => { const rec = e.recipeId ? state.recipes.find(r => r.id === e.recipeId) : null;
      return rec ? `<p style="margin-top:1rem;font-size:0.85rem;color:var(--text-muted);">
        📋 Recipe: <a href="#" style="color:var(--accent);text-decoration:none;" onclick="closeModal();setTimeout(()=>setSection('recipes'),200)">${rec.title}</a></p>` : '';
    })()}

    ${state.adminMode ? `
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);">
        <button class="btn-secondary" onclick="openJournalForm(window._modalEntry)">✏️ Edit Entry</button>
      </div>
    ` : ''}
  `;

  window._modalEntry = e;
  $('modalOverlay').classList.add('active');
}

// ---- SECTION: CATALOG ----
function renderCatalog() {
  const grid = $('catalogGrid');
  const empty = $('catalogEmpty');
  const q = state.search.toLowerCase();
  const { roaster, roastLevel, process } = state.catalogFilters;
  // When roaster filter is active, show all statuses; otherwise respect tab
  const statusFilter = roaster ? '' : state.catalogStatus;

  const filtered = state.coffees.filter(c => {
    if (statusFilter && c.status !== statusFilter)               return false;
    if (roaster    && c.roasterId !== roaster)                   return false;
    if (roastLevel && c.roastLevel !== roastLevel)               return false;
    if (process    && c.process !== process)                     return false;
    if (q) {
      const blob = [c.name, c.origin, c.region, c.process, c.variety, c.roastLevel,
                    ...(c.tasteTags||[])].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  Array.from(grid.children).forEach(c => { if (c !== empty) c.remove(); });
  const oldPag = $('catalogPagination');
  if (oldPag) oldPag.remove();

  if (filtered.length === 0) {
    empty.style.display = 'block';
    empty.querySelector('p').textContent = (q || roaster || roastLevel || process)
      ? 'No coffees match your filters.'
      : `No ${statusFilter === 'current' ? 'in-stock' : statusFilter === 'past' ? 'past' : ''} coffees yet. ${state.adminMode ? 'Add one above.' : 'Check back later.'}`;
    return;
  }
  empty.style.display = 'none';

  const page = state.pages.catalog || 1;
  const size = PAGE_SIZE.catalog;
  const sliced = filtered.slice((page - 1) * size, page * size);

  sliced.forEach(c => {
    const card = buildCoffeeCard(c);
    grid.appendChild(card);
  });

  if (filtered.length > size) {
    const pag = document.createElement('div');
    pag.id = 'catalogPagination';
    pag.innerHTML = buildPagination(filtered.length, 'catalog');
    grid.parentElement.appendChild(pag);
  }
}

function buildCoffeeCard(c) {
  const q = state.search;
  const roaster = state.roasters.find(r => r.id === c.roasterId);
  const roasterName = roaster ? roaster.name : (c.roasterId || '');
  const journalCount = state.journal.filter(e => e.coffeeId === c.id).length;
  const lasted = c.status === 'past' ? daysLasted(c.dateAdded, c.dateFinished) : null;

  // Use roaster image as fallback if coffee has no image
  const roasterFallbackImg = !c.image && c.roasterId
    ? (state.roasters.find(r => r.id === c.roasterId)?.image || null)
    : null;
  const displayImage = c.image || roasterFallbackImg;

  const div = document.createElement('div');
  div.className = 'coffee-card';

  const freshness = c.status === 'current' ? getFreshness(c.roastDate) : null;

  const bagToggle = c.status === 'current'
    ? (state.adminMode
        ? `<button class="bag-toggle ${c.bagOpened ? 'opened' : ''}" onclick="event.stopPropagation();toggleBagOpened('${c.id}')" title="${c.bagOpened ? 'Mark sealed' : 'Mark opened'}">
             ${c.bagOpened ? '▶ Opened' : '○ Sealed'}
           </button>`
        : (c.bagOpened ? `<span class="bag-toggle opened no-click">▶ Opened</span>` : ''))
    : '';

  const statusBadge = c.status === 'current'
    ? `<span class="status-current">● In Stock</span>`
    : c.status === 'wishlist'
    ? `<span class="status-wishlist">★ Want to Try</span>`
    : `<span class="status-past">Finished</span>`;

  div.innerHTML = `
    ${buildCardImage(displayImage, c.name)}
    <div class="coffee-card-body">
      <div class="coffee-card-name">${highlight(c.name, q)}</div>
      <div class="coffee-card-roaster">${highlight(roasterName, q)}</div>
      <div class="coffee-card-meta">
        ${c.roastLevel ? `<span class="roast-badge">${c.roastLevel}</span>` : ''}
        ${c.process ? `<span class="coffee-process-tag">${c.process}</span>` : ''}
        ${c.beanType ? `<span class="bean-type-tag">${c.beanType}</span>` : ''}
        ${statusBadge}
        ${lasted ? `<span class="lasted-chip">${lasted}d</span>` : ''}
        ${freshness ? `<span class="freshness-chip ${freshness.cls}">${freshness.label}</span>` : ''}
      </div>
      <div class="journal-tags">
        ${(c.tasteTags||[]).slice(0,4).map(t => `<span class="taste-tag ${getTasteClass(t)}">${t}</span>`).join('')}
      </div>
    </div>
    <div class="coffee-card-footer">
      <span class="coffee-date">${c.origin || '—'}</span>
      <div style="display:flex;align-items:center;gap:0.5rem;">
        ${bagToggle}
        <span style="font-size:0.775rem;color:var(--text-light);font-family:var(--font-mono);">
          ${journalCount ? journalCount + ' brew' + (journalCount > 1 ? 's' : '') : 'No brews yet'}
        </span>
      </div>
    </div>
  `;

  div.addEventListener('click', (ev) => {
    if (ev.target.closest('.card-edit-btn')) { ev.stopPropagation(); openCoffeeForm(c); return; }
    if (ev.target.closest('.bag-toggle')) return;
    openCoffeeModal(c);
  });

  return div;
}

async function toggleBagOpened(coffeeId) {
  if (!state.adminMode) return;
  const coffee = state.coffees.find(c => c.id === coffeeId);
  if (!coffee) return;
  const updated = state.coffees.map(c =>
    c.id === coffeeId ? { ...c, bagOpened: !c.bagOpened } : c
  );
  try {
    await writeDataFile('coffees.json', updated,
      `☕ ${coffee.name}: mark bag as ${!coffee.bagOpened ? 'opened' : 'sealed'}`);
    state.coffees = updated;
    renderCatalog();
    showToast(!coffee.bagOpened ? 'Bag marked as opened' : 'Bag marked as sealed', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function openCoffeeModal(c) {
  const roaster = state.roasters.find(r => r.id === c.roasterId);
  const roasterName = roaster ? roaster.name : (c.roasterId || '');
  const journalEntries = state.journal.filter(e => e.coffeeId === c.id);

  $('modalBody').innerHTML = `
    ${c.image ? `<img src="${c.image}" class="modal-hero" alt="${c.name}" style="margin:-2rem -2rem 1.5rem;width:calc(100% + 4rem);border-radius:var(--radius) var(--radius) 0 0;" />` : ''}
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem;">
      <h2 style="font-family:var(--font-display);font-size:1.65rem;color:var(--text);flex:1;">${c.name}</h2>
      ${c.status === 'current'
        ? `<span class="status-current" style="flex-shrink:0;margin-left:0.75rem;">● In Stock</span>`
        : `<span class="status-past" style="flex-shrink:0;margin-left:0.75rem;">Finished</span>`}
    </div>
    <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1.25rem;">${roasterName}</p>

    <div class="modal-detail-grid">
      ${[
        ['Origin',      c.origin],
        ['Region',      c.region],
        ['Roast Level', c.roastLevel],
        ['Process',     c.process],
        ['Variety',     c.variety],
        ['Bean Type',   c.beanType],
        ['Added',       formatDate(c.dateAdded)],
        ['Roast Date',  c.roastDate ? formatDate(c.roastDate) : null],
        ['Finished',    c.dateFinished ? formatDate(c.dateFinished) : null],
        ['Bag Lasted',  (() => { const d = daysLasted(c.dateAdded, c.dateFinished); return d ? d + ' days' : null; })()],
        ['Cost',        c.cost ? fmtCost(c.cost) : null]
      ].filter(([,v]) => v).map(([l,v]) => `
        <div class="modal-detail-item">
          <div class="modal-detail-label">${l}</div>
          <div class="modal-detail-value" style="font-family:var(--font-body);">${v}</div>
        </div>
      `).join('')}
    </div>

    ${c.description ? `<p style="font-size:0.9rem;color:var(--text);line-height:1.7;margin-bottom:1.25rem;">${c.description}</p>` : ''}
    ${c.dialInNotes ? `
      <p class="modal-section-title">Dial-In Notes</p>
      <div class="recipe-notes-box" style="margin-bottom:1.25rem;font-family:var(--font-mono);font-size:0.84rem;">${c.dialInNotes}</div>
    ` : ''}

    ${(c.tasteTags||[]).length ? `
      <div class="journal-tags" style="margin-bottom:1.25rem;">
        ${c.tasteTags.map(t => `<span class="taste-tag ${getTasteClass(t)}">${t}</span>`).join('')}
      </div>
    ` : ''}

    ${journalEntries.length ? `
      <p class="modal-section-title">Brew Journal (${journalEntries.length})</p>
      <div class="modal-entry-list">
        ${journalEntries.map(e => `
          <div class="modal-entry-item" onclick="closeModal();setTimeout(()=>{setSection('journal')},200)">
            <div class="modal-entry-name">${e.brewMethod || 'Brew'}</div>
            <div class="modal-entry-sub">${formatDate(e.date)}${e.overallRating ? ' · ' + starsHtml(e.overallRating) : ''}</div>
          </div>
        `).join('')}
      </div>
    ` : `<p style="color:var(--text-light);font-size:0.875rem;font-style:italic;">No journal entries for this coffee yet.</p>`}

    ${state.adminMode ? `
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);display:flex;gap:0.75rem;flex-wrap:wrap;">
        <button class="btn-secondary" onclick="openCoffeeForm(window._modalCoffee)">✏️ Edit Coffee</button>
        ${c.status === 'current'
          ? `<button class="btn-secondary" onclick="markCoffeeStatus(window._modalCoffee,'past')">Mark as Finished</button>`
          : `<button class="btn-secondary" onclick="markCoffeeStatus(window._modalCoffee,'current')">Mark as In Stock</button>`}
      </div>
    ` : ''}
  `;

  window._modalCoffee = c;
  $('modalOverlay').classList.add('active');
}

async function markCoffeeStatus(coffee, newStatus) {
  const updated = state.coffees.map(c =>
    c.id === coffee.id
      ? { ...c, status: newStatus, dateFinished: newStatus === 'past' ? new Date().toISOString().split('T')[0] : null }
      : c
  );
  try {
    showToast('Saving…');
    await writeDataFile('coffees.json', updated, `☕ Mark ${coffee.name} as ${newStatus}`);
    state.coffees = updated;
    closeModal();
    renderCatalog();
    showToast(`Marked as ${newStatus === 'past' ? 'finished' : 'in stock'}`, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ---- SECTION: ROASTERS ----
function renderRoasters() {
  const grid = $('roasterGrid');
  grid.innerHTML = '';
  const q = state.search.toLowerCase();
  const filtered = state.roasters.filter(r => {
    if (!q) return true;
    return [r.name, r.location, r.description, ...(r.speciality||[])].join(' ').toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">🏭</div>
      <h3>No roasters found</h3>
      <p>${state.adminMode ? 'Add a roaster above.' : 'No roasters match your search.'}</p>
    </div>`;
    return;
  }

  filtered.forEach(r => {
    const card = document.createElement('div');
    card.className = 'roaster-card';

    card.innerHTML = `
      ${buildCardImage(r.image, r.name)}
      <div class="roaster-card-body">
        <div class="roaster-name">${highlight(r.name, q)}</div>
        <div class="roaster-location">📍 ${highlight(r.location, q)}</div>
        <div class="roaster-desc">${highlight(r.description, q)}</div>
        <div class="roaster-tags">
          ${(r.speciality||[]).map(s => `<span class="roaster-tag">${s}</span>`).join('')}
        </div>
        <div class="roaster-levels" style="margin-top:0.25rem;">
          <span style="font-size:0.73rem;color:var(--text-muted);">Roasts:</span>
          ${(r.roastLevels||[]).map(l =>
            `<span class="level-dot ${l.toLowerCase().replace(/[\s-]/g,'')}" title="${l}"></span>`
          ).join('')}
        </div>
      </div>
      <div class="roaster-card-footer">
        <span style="font-size:0.78rem;color:var(--text-light);">Added ${formatDate(r.added)}</span>
        ${r.website ? `<a href="${r.website}" target="_blank" rel="noopener" class="btn-secondary" onclick="event.stopPropagation()" style="font-size:0.8rem;padding:0.3rem 0.75rem;">Visit →</a>` : ''}
      </div>
    `;

    card.addEventListener('click', (ev) => {
      if (ev.target.closest('.card-edit-btn')) { ev.stopPropagation(); openRoasterForm(r); return; }
      if (ev.target.closest('.btn-secondary')) return;
      openRoasterModal(r);
    });

    grid.appendChild(card);
  });
}

function openRoasterModal(r) {
  const journalEntries = state.journal.filter(e => e.roasterId === r.id);
  const coffees = state.coffees.filter(c => c.roasterId === r.id);

  $('modalBody').innerHTML = `
    ${r.image ? `<img src="${r.image}" class="modal-hero" alt="${r.name}" style="margin:-2rem -2rem 1.5rem;width:calc(100% + 4rem);border-radius:var(--radius) var(--radius) 0 0;" />` : ''}
    <h2 style="font-family:var(--font-display);font-size:1.65rem;color:var(--text);margin-bottom:0.25rem;">${r.name}</h2>
    <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1rem;">📍 ${r.location}</p>
    <p style="font-size:0.9rem;color:var(--text);line-height:1.7;margin-bottom:1.25rem;">${r.description}</p>
    <div class="roaster-tags" style="margin-bottom:1.25rem;">
      ${(r.speciality||[]).map(s=>`<span class="roaster-tag">${s}</span>`).join('')}
    </div>
    ${r.website ? `<a href="${r.website}" target="_blank" rel="noopener" class="btn-primary" style="margin-bottom:1.5rem;display:inline-flex;">Visit Website →</a>` : ''}

    ${coffees.length ? `
      <p class="modal-section-title">Coffees from this roaster (${coffees.length})</p>
      <div class="modal-entry-list" style="margin-bottom:1.25rem;">
        ${coffees.map(c => `
          <div class="modal-entry-item" onclick="closeModal();setTimeout(()=>{setSection('catalog')},200)">
            <div class="modal-entry-name">${c.name}</div>
            <div class="modal-entry-sub">${c.roastLevel || ''}${c.status === 'current' ? ' · In Stock' : ' · Finished'}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${journalEntries.length ? `
      <p class="modal-section-title">Brew entries (${journalEntries.length})</p>
      <div class="modal-entry-list">
        ${journalEntries.map(e => `
          <div class="modal-entry-item" onclick="closeModal();setTimeout(()=>{setSection('journal')},200)">
            <div class="modal-entry-name">${e.beanName}</div>
            <div class="modal-entry-sub">${e.brewMethod} · ${formatDate(e.date)}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${state.adminMode ? `
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);">
        <button class="btn-secondary" onclick="openRoasterForm(window._modalRoaster)">✏️ Edit Roaster</button>
      </div>
    ` : ''}
  `;

  window._modalRoaster = r;
  $('modalOverlay').classList.add('active');
}

// ---- SECTION: GEAR ----
function renderGear() {
  const grid = $('gearGrid');
  grid.innerHTML = '';
  const q = state.search.toLowerCase();
  const filtered = state.gear.filter(g => {
    if (!q) return true;
    return [g.name, g.type, g.description, ...(g.tags||[])].join(' ').toLowerCase().includes(q);
  });

  const oldPag = $('gearPagination');
  if (oldPag) oldPag.remove();

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚙️</div>
      <h3>No gear found</h3>
      <p>${state.adminMode ? 'Add gear above.' : 'No gear matches your search.'}</p>
    </div>`;
    return;
  }

  const page = state.pages.gear || 1;
  const size = PAGE_SIZE.gear;
  const sliced = filtered.slice((page - 1) * size, page * size);

  sliced.forEach(g => {
    const card = document.createElement('div');
    card.className = 'gear-card';

    card.innerHTML = `
      <div style="position:relative;">
        ${buildCardImage(g.image, g.name)}
        <span class="gear-type-badge">${g.type}</span>
      </div>
      <div class="gear-card-body">
        <div class="gear-name">${highlight(g.name, q)}</div>
        <div class="gear-desc">${highlight(g.description, q)}</div>
        <div class="gear-grind">
          <span>⚙️</span>
          <span>${g.grind}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', (ev) => {
      if (ev.target.closest('.card-edit-btn')) { ev.stopPropagation(); openGearForm(g); return; }
      openGearModal(g);
    });

    grid.appendChild(card);
  });

  if (filtered.length > size) {
    const pag = document.createElement('div');
    pag.id = 'gearPagination';
    pag.innerHTML = buildPagination(filtered.length, 'gear');
    grid.parentElement.appendChild(pag);
  }
}

function openGearModal(g) {
  const relatedRecipes = state.recipes.filter(r => r.gear === g.id);
  const grindLines = g.grindSettings
    ? Object.entries(g.grindSettings).map(([k,v]) =>
        `<div class="modal-detail-item"><div class="modal-detail-label">${k}</div><div class="modal-detail-value">${v}</div></div>`
      ).join('')
    : '';

  $('modalBody').innerHTML = `
    ${g.image ? `<img src="${g.image}" class="modal-hero" alt="${g.name}" style="margin:-2rem -2rem 1.5rem;width:calc(100% + 4rem);border-radius:var(--radius) var(--radius) 0 0;" />` : ''}
    <div style="display:inline-block;background:var(--text);color:var(--white);font-size:0.7rem;font-weight:600;letter-spacing:0.05em;padding:0.2rem 0.6rem;border-radius:4px;text-transform:uppercase;margin-bottom:0.75rem;">${g.type}</div>
    <h2 style="font-family:var(--font-display);font-size:1.65rem;color:var(--text);margin-bottom:0.75rem;">${g.name}</h2>
    <p style="font-size:0.9rem;color:var(--text);line-height:1.7;margin-bottom:1.25rem;">${g.description}</p>

    ${grindLines ? `
      <p class="modal-section-title">Grind Settings (1Zpresso K-Ultra)</p>
      <div class="modal-detail-grid" style="margin-bottom:1.25rem;">${grindLines}</div>
    ` : `
      <div class="modal-detail-item" style="margin-bottom:1.25rem;">
        <div class="modal-detail-label">Grind Range</div>
        <div class="modal-detail-value">${g.grind}</div>
      </div>
    `}

    ${g.notes ? `
      <div class="recipe-notes-box" style="margin-bottom:1.25rem;">💡 ${g.notes}</div>
    ` : ''}

    ${relatedRecipes.length ? `
      <p class="modal-section-title">Recipes for this brewer</p>
      <div class="modal-entry-list">
        ${relatedRecipes.map(r => `
          <div class="modal-entry-item" onclick="closeModal();setTimeout(()=>{setSection('recipes')},200)">
            <div class="modal-entry-name">${r.title}</div>
            <div class="modal-entry-sub">${r.dose} · ${r.ratio} · ${r.totalTime}</div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${state.adminMode ? `
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);">
        <button class="btn-secondary" onclick="openGearForm(window._modalGear)">✏️ Edit Gear</button>
      </div>
    ` : ''}
  `;

  window._modalGear = g;
  $('modalOverlay').classList.add('active');
}

// ---- SECTION: RECIPES ----
function renderRecipes() {
  const list = $('recipeList');
  list.innerHTML = '';
  window._recipes = {};
  state.recipes.forEach(r => { window._recipes[r.id] = r; });
  const q = state.search.toLowerCase();
  const filtered = state.recipes.filter(r => {
    if (state.recipeFilter && r.gear !== state.recipeFilter) return false;
    if (q && ![r.title, r.notes, ...(r.tags||[])].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>No recipes found</h3>
      <p>Try a different filter or search term.</p>
    </div>`;
    return;
  }

  filtered.forEach(recipe => {
    const card = document.createElement('div');
    card.className = 'recipe-card';
    card.innerHTML = `
      <div class="recipe-card-header" onclick="this.parentElement.classList.toggle('open')">
        <div>
          <div class="recipe-title">${recipe.title}</div>
          <div class="recipe-meta-row">
            ${recipe.dose ? `<span class="recipe-meta-item"><strong>${recipe.dose}</strong> coffee</span>` : ''}
            ${recipe.water ? `<span class="recipe-meta-item"><strong>${recipe.water}</strong></span>` : ''}
            ${recipe.ratio ? `<span class="recipe-meta-item"><strong>${recipe.ratio}</strong> ratio</span>` : ''}
            ${recipe.totalTime ? `<span class="recipe-meta-item"><strong>${recipe.totalTime}</strong></span>` : ''}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          ${state.adminMode ? `<button class="btn-secondary" style="font-size:0.75rem;padding:0.25rem 0.6rem;" onclick="event.stopPropagation();openRecipeForm(window._recipes['${recipe.id}'])">✏️</button>` : ''}
          <span class="recipe-toggle">▼</span>
        </div>
      </div>
      <div class="recipe-card-body">
        <div class="recipe-info-grid">
          ${[
            ['Yield',       recipe.yield],
            ['Dose',        recipe.dose],
            ['Water',       recipe.water],
            ['Ratio',       recipe.ratio],
            ['Total Time',  recipe.totalTime],
            ['Grind (K-Ultra)', recipe.grindSize]
          ].map(([l,v]) => v ? `
            <div class="recipe-info-item">
              <div class="recipe-info-label">${l}</div>
              <div class="recipe-info-value">${v}</div>
            </div>
          ` : '').join('')}
        </div>
        <p class="recipe-steps-title">Steps</p>
        <ul class="recipe-steps">
          ${(recipe.steps||[]).map(s => `
            <li class="recipe-step">
              <span class="step-time">${s.time}</span>
              <span class="step-action">${s.action}</span>
            </li>
          `).join('')}
        </ul>
        ${recipe.notes ? `<div class="recipe-notes-box">💡 ${recipe.notes}</div>` : ''}
      </div>
    `;
    list.appendChild(card);
  });
}

// ---- MODAL HELPERS ----
function closeModal() {
  $('modalOverlay').classList.remove('active');
  $('modalBody').innerHTML = '';
}

// ---- ADMIN FORMS ----

// --- Journal Entry Form ---
function openJournalForm(existing = null) {
  const isEdit = !!existing;
  const e = existing || {};
  const coffeeOptions  = state.coffees.map(c => `<option value="${c.id}" ${e.coffeeId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  const roasterOptions = state.roasters.map(r => `<option value="${r.id}" ${e.roasterId === r.id ? 'selected' : ''}>${r.name}</option>`).join('');
  const recipeOptions  = state.recipes.map(r => `<option value="${r.id}" ${e.recipeId === r.id ? 'selected' : ''}>${r.title}</option>`).join('');
  const scores = e.scores || {};
  const rating = e.overallRating || 0;

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);margin-bottom:1.5rem;">
      ${isEdit ? 'Edit Entry' : 'Log a Cup'}
    </h2>
    <div class="admin-form" id="journalForm">
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Date <span>*</span></label>
          <input class="form-input" type="date" id="jDate" value="${e.date || new Date().toISOString().split('T')[0]}" required />
        </div>
        <div class="form-field">
          <label class="form-label">Brew Method <span>*</span></label>
          <select class="form-select" id="jMethod">
            <option value="">Select…</option>
            ${['V60 / Pour Over','French Press','Moka Pot','South Indian Filter','Clever Dripper','Basic Home Espresso']
              .map(m => `<option value="${m}" ${e.brewMethod===m?'selected':''}>${m}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Recipe Used (optional)</label>
          <select class="form-select" id="jRecipeId" onchange="handleJournalRecipeSelect(this.value)">
            <option value="">— Link a recipe —</option>
            ${recipeOptions}
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Coffee (from catalog)</label>
          <select class="form-select" id="jCoffeeId" onchange="handleJournalCoffeeSelect(this.value)">
            <option value="">— Select or type manually —</option>
            ${coffeeOptions}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Bean Name <span>*</span></label>
          <input class="form-input" type="text" id="jBeanName" placeholder="e.g. Attikan Estate" value="${e.beanName||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Roaster</label>
          <select class="form-select" id="jRoasterId" onchange="handleJournalRoasterSelect(this.value)">
            <option value="">Select or type…</option>
            ${roasterOptions}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Origin</label>
          <input class="form-input" type="text" id="jOrigin" placeholder="e.g. Chikmagalur, India" value="${e.origin||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Roast Level</label>
          <select class="form-select" id="jRoastLevel">
            <option value="">Select…</option>
            ${['Light','Medium-Light','Medium','Medium-Dark','Dark']
              .map(l => `<option ${e.roastLevel===l?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Grind Clicks (K-Ultra)</label>
          <input class="form-input" type="number" id="jGrindClicks" placeholder="e.g. 24" min="1" max="48" value="${e.grindClicks||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Grind Label</label>
          <input class="form-input" type="text" id="jGrindLabel" placeholder="e.g. Medium-Fine" value="${e.grindLabel||''}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Dose</label>
          <input class="form-input" type="text" id="jDose" placeholder="e.g. 18g" value="${e.dose||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Water</label>
          <input class="form-input" type="text" id="jWater" placeholder="e.g. 300ml" value="${e.water||''}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Water Temp</label>
          <input class="form-input" type="text" id="jWaterTemp" placeholder="e.g. 94°C" value="${e.waterTemp||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Total Time</label>
          <input class="form-input" type="text" id="jTotalTime" placeholder="e.g. 3:30" value="${e.totalTime||''}" />
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Scores (0–10)</label>
        <div class="score-fields">
          ${['acidity','body','sweetness','finish'].map(s => `
            <div class="score-field">
              <div class="score-field-label">${s}</div>
              <div class="score-range-wrap">
                <input class="score-range" type="range" min="0" max="10" step="0.5" id="jScore_${s}"
                       value="${scores[s] || 5}"
                       oninput="document.getElementById('jScoreVal_${s}').textContent=this.value" />
                <span class="score-preview" id="jScoreVal_${s}">${scores[s] || 5}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Overall Rating</label>
        <div class="star-rating-input">
          ${[5,4,3,2,1].map(n => `
            <input type="radio" name="jRating" id="jStar${n}" value="${n}" ${rating===n?'checked':''} />
            <label for="jStar${n}">★</label>
          `).join('')}
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Taste Tags</label>
        <input class="taste-tags-input" type="text" id="jTasteTags"
               placeholder="e.g. Chocolate, Caramel, Bright (comma-separated)"
               value="${(e.tasteTags||[]).join(', ')}" />
        <p class="form-hint">Separate tags with commas</p>
      </div>
      <div class="form-field">
        <label class="form-label">Tasting Notes</label>
        <textarea class="form-textarea" id="jNotes" placeholder="What did you notice? Any flavour details, texture, finish…">${e.notes||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Brew Photo (optional)</label>
        <div class="form-image-upload" id="jImgUpload">
          <input type="file" accept="image/*" id="jImgFile" onchange="previewFormImage(this,'jImgPreview','jImgUpload')" />
          <div class="form-image-upload-label">📷 Click to upload a photo</div>
          ${e.image ? `<img src="${e.image}" class="form-image-preview" id="jImgPreview" style="display:block;" />` :
            `<img class="form-image-preview" id="jImgPreview" />`}
        </div>
      </div>
      <div class="form-actions">
        <div class="form-saving" id="jSaving" style="display:none;">☕ Saving…</div>
        <button class="btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" type="button" onclick="saveJournalEntry('${isEdit ? e.id : ''}')">
          ${isEdit ? 'Save Changes' : 'Log Cup'}
        </button>
      </div>
    </div>
  `;

  $('modalOverlay').classList.add('active');
}

function handleJournalCoffeeSelect(coffeeId) {
  if (!coffeeId) return;
  const c = state.coffees.find(x => x.id === coffeeId);
  if (!c) return;
  $('jBeanName').value = c.name;
  if (c.roasterId) $('jRoasterId').value = c.roasterId;
  if (c.roastLevel) $('jRoastLevel').value = c.roastLevel;
  if (c.origin) $('jOrigin').value = c.origin;
  if (c.tasteTags && !$('jTasteTags').value) $('jTasteTags').value = c.tasteTags.join(', ');
}

function handleJournalRoasterSelect(roasterId) {
  // No auto-fill needed; just for data integrity
}

function handleJournalRecipeSelect(recipeId) {
  if (!recipeId) return;
  const recipe = state.recipes.find(r => r.id === recipeId);
  if (!recipe) return;

  const method = GEAR_TO_METHOD[recipe.gear];
  if (method && $('jMethod')) $('jMethod').value = method;
  if (recipe.dose)      $('jDose').value      = recipe.dose;
  if (recipe.totalTime) $('jTotalTime').value  = recipe.totalTime;

  if (recipe.water) {
    const waterMatch = recipe.water.match(/^(.+?)\s+at\s+(.+)$/);
    if (waterMatch) {
      $('jWater').value     = waterMatch[1].trim();
      $('jWaterTemp').value = waterMatch[2].trim();
    } else {
      $('jWater').value = recipe.water;
    }
  }

  if (recipe.grindSize) {
    const clicksMatch = recipe.grindSize.match(/(\d+)[–\-–](\d+)\s*clicks/);
    if (clicksMatch) {
      $('jGrindClicks').value = Math.round((parseInt(clicksMatch[1]) + parseInt(clicksMatch[2])) / 2);
    }
    const labelMatch = recipe.grindSize.match(/^([^(]+)/);
    if (labelMatch) $('jGrindLabel').value = labelMatch[1].trim();
  }
}

async function saveJournalEntry(existingId) {
  const beanName = $('jBeanName').value.trim();
  const method   = $('jMethod').value;
  const date     = $('jDate').value;
  if (!beanName || !method || !date) {
    showToast('Please fill in Bean Name, Date, and Brew Method', 'error');
    return;
  }

  const ratingEl = document.querySelector('input[name="jRating"]:checked');
  const scores = {};
  ['acidity','body','sweetness','finish'].forEach(s => {
    scores[s] = parseFloat($(`jScore_${s}`).value);
  });

  const tagsRaw = $('jTasteTags').value;
  const tasteTags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const roasterId = $('jRoasterId').value;
  const roasterName = roasterId
    ? (state.roasters.find(r => r.id === roasterId)?.name || '')
    : '';

  // Handle image upload
  const fileInput = $('jImgFile');
  let imagePath = existingId ? (state.journal.find(e => e.id === existingId)?.image || null) : null;

  $('jSaving').style.display = 'flex';

  try {
    if (fileInput && fileInput.files[0]) {
      const entryId = existingId || generateId('entry');
      imagePath = await uploadImageFile(fileInput.files[0], 'journal', entryId);
    }

    const entry = {
      id: existingId || generateId('entry'),
      date,
      coffeeId:  $('jCoffeeId').value  || null,
      recipeId:  $('jRecipeId').value  || null,
      beanName,
      roasterId:   roasterId || null,
      roasterName: roasterName || $('jBeanName').value, // fallback
      origin:      $('jOrigin').value.trim(),
      roastLevel:  $('jRoastLevel').value,
      brewMethod:  method,
      grindClicks: $('jGrindClicks').value ? parseFloat($('jGrindClicks').value) : null,
      grindLabel:  $('jGrindLabel').value.trim(),
      dose:        $('jDose').value.trim(),
      water:       $('jWater').value.trim(),
      ratio:       null, // auto-calculate or leave blank
      waterTemp:   $('jWaterTemp').value.trim(),
      totalTime:   $('jTotalTime').value.trim(),
      scores,
      overallRating: ratingEl ? parseInt(ratingEl.value) : null,
      tasteTags,
      notes:   $('jNotes').value.trim(),
      image:   imagePath
    };

    let updated;
    if (existingId) {
      updated = state.journal.map(e => e.id === existingId ? entry : e);
    } else {
      updated = [entry, ...state.journal];
    }

    await writeDataFile('journal.json', updated,
      `☕ ${existingId ? 'Update' : 'Add'} journal entry: ${beanName}`);
    state.journal = updated;
    updateStatStrip();
    populateFilters();
    closeModal();
    renderJournal();
    showToast(existingId ? 'Entry updated' : 'Cup logged!', 'success');
  } catch (err) {
    $('jSaving').style.display = 'none';
    showToast(err.message, 'error');
  }
}

// --- Coffee Form ---
function openCoffeeForm(existing = null) {
  const isEdit = !!existing;
  const c = existing || {};
  const roasterOptions = state.roasters.map(r =>
    `<option value="${r.id}" ${c.roasterId === r.id ? 'selected' : ''}>${r.name}</option>`
  ).join('');

  const hasAnthropicKey = true; // import always available

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);margin-bottom:1.5rem;">
      ${isEdit ? 'Edit Coffee' : 'Add Coffee'}
    </h2>
    <div class="admin-form" id="coffeeForm">
      ${!isEdit && hasAnthropicKey ? `
      <div class="import-url-section">
        <label class="form-label" style="display:flex;align-items:center;gap:0.4rem;">
          <span>🔗</span> Import from URL
          <span style="font-size:0.72rem;color:var(--text-muted);font-weight:400;font-style:italic;">— paste any roaster product page</span>
        </label>
        <div class="import-url-row">
          <input class="form-input" type="url" id="importUrl" placeholder="https://bluetokaicoffee.com/products/attikan-estate…" />
          <button class="btn-secondary" type="button" id="importUrlBtn" onclick="importCoffeeFromUrl()">Look up</button>
        </div>
        <p class="import-url-status" id="importUrlStatus"></p>
      </div>
      ` : ''}
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Bean Name <span>*</span></label>
          <input class="form-input" type="text" id="cName" placeholder="e.g. Attikan Estate" value="${c.name||''}" required />
        </div>
        <div class="form-field">
          <label class="form-label">Roaster</label>
          <select class="form-select" id="cRoasterId">
            <option value="">Select roaster…</option>
            ${roasterOptions}
          </select>
          <button class="btn-link" type="button" onclick="toggleInlineRoasterForm()" id="addRoasterToggle">＋ Add new roaster</button>
          <div id="inlineRoasterForm" style="display:none;background:var(--surface);border-radius:var(--radius-sm);padding:1rem;margin-top:0.5rem;border:1px solid var(--border);">
            <div class="form-row" style="margin-bottom:0.75rem;">
              <div class="form-field">
                <label class="form-label">Roaster Name *</label>
                <input class="form-input" type="text" id="irName" placeholder="e.g. Blue Tokai" />
              </div>
              <div class="form-field">
                <label class="form-label">Location (optional)</label>
                <input class="form-input" type="text" id="irLocation" placeholder="e.g. Bangalore, India" />
              </div>
            </div>
            <div style="display:flex;gap:0.5rem;justify-content:flex-end;">
              <button class="btn-secondary" type="button" onclick="toggleInlineRoasterForm()">Cancel</button>
              <button class="btn-primary" type="button" id="irSaveBtn" onclick="saveInlineRoaster()">Save Roaster</button>
            </div>
          </div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Origin</label>
          <input class="form-input" type="text" id="cOrigin" placeholder="e.g. Chikmagalur, India" value="${c.origin||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Region</label>
          <input class="form-input" type="text" id="cRegion" placeholder="e.g. Karnataka" value="${c.region||''}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Roast Level</label>
          <select class="form-select" id="cRoastLevel">
            <option value="">Select…</option>
            ${['Light','Medium-Light','Medium','Medium-Dark','Dark']
              .map(l => `<option ${c.roastLevel===l?'selected':''}>${l}</option>`).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Process</label>
          <select class="form-select" id="cProcess">
            <option value="">Select…</option>
            ${['Washed','Natural','Honey','Anaerobic','Wet-Hulled']
              .map(p => `<option ${c.process===p?'selected':''}>${p}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Variety</label>
          <input class="form-input" type="text" id="cVariety" placeholder="e.g. S795, Catuai" value="${c.variety||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Bean Type</label>
          <select class="form-select" id="cBeanType">
            <option value="">Select…</option>
            ${['Arabica','Robusta','Liberica','Excelsa','Blend']
              .map(bt => `<option ${c.beanType===bt?'selected':''}>${bt}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field" style="flex:1;">
          <label class="form-label">Status</label>
          <select class="form-select" id="cStatus">
            <option value="current" ${(c.status||'current')==='current'?'selected':''}>In Stock (Current)</option>
            <option value="past" ${c.status==='past'?'selected':''}>Finished (Past)</option>
            <option value="wishlist" ${c.status==='wishlist'?'selected':''}>Want to Try</option>
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Date Added</label>
          <input class="form-input" type="date" id="cDateAdded" value="${c.dateAdded || new Date().toISOString().split('T')[0]}" />
        </div>
        <div class="form-field">
          <label class="form-label">Date Finished</label>
          <input class="form-input" type="date" id="cDateFinished" value="${c.dateFinished||''}" />
        </div>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Cost (optional)</label>
          <div class="form-input-prefix-wrap">
            <span class="form-input-prefix">${CURRENCY}</span>
            <input class="form-input form-input--prefixed" type="number" id="cCost" placeholder="e.g. 450" value="${c.cost||''}" min="0" step="1" />
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Roast Date (optional)</label>
          <input class="form-input" type="date" id="cRoastDate" value="${c.roastDate||''}" />
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Taste Tags</label>
        <input class="taste-tags-input" type="text" id="cTasteTags"
               placeholder="e.g. Chocolate, Caramel, Citrus (comma-separated)"
               value="${(c.tasteTags||[]).join(', ')}" />
      </div>
      <div class="form-field">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="cDescription" placeholder="Notes about this coffee, what makes it special…">${c.description||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Dial-In Notes (optional)</label>
        <textarea class="form-textarea" id="cDialInNotes" placeholder="Grind settings per method, adjustments that worked, e.g. 26 clicks for Clever, 22 for V60…" style="min-height:70px;">${c.dialInNotes||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Photo (optional)</label>
        <div class="form-image-upload" id="cImgUpload">
          <input type="file" accept="image/*" id="cImgFile" onchange="previewFormImage(this,'cImgPreview','cImgUpload')" />
          <div class="form-image-upload-label">📷 Click to upload a photo of the bag or beans</div>
          ${c.image ? `<img src="${c.image}" class="form-image-preview" id="cImgPreview" style="display:block;" />` :
            `<img class="form-image-preview" id="cImgPreview" />`}
        </div>
      </div>
      <div class="form-actions">
        <div class="form-saving" id="cSaving" style="display:none;">☕ Saving…</div>
        <button class="btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" type="button" onclick="saveCoffee('${isEdit ? c.id : ''}')">
          ${isEdit ? 'Save Changes' : 'Add Coffee'}
        </button>
      </div>
    </div>
  `;
  $('modalOverlay').classList.add('active');
}

async function saveCoffee(existingId) {
  const name = $('cName').value.trim();
  if (!name) { showToast('Please enter a bean name', 'error'); return; }

  const tagsRaw = $('cTasteTags').value;
  const tasteTags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const fileInput = $('cImgFile');
  let imagePath = existingId ? (state.coffees.find(c => c.id === existingId)?.image || null) : null;

  $('cSaving').style.display = 'flex';

  try {
    const itemId = existingId || slugify(name);

    if (fileInput && fileInput.files[0]) {
      imagePath = await uploadImageFile(fileInput.files[0], 'coffee', itemId);
    }

    const existingCoffee = existingId ? state.coffees.find(c => c.id === existingId) : null;
    const coffee = {
      id: existingId || itemId,
      name,
      roasterId:    $('cRoasterId').value || null,
      origin:       $('cOrigin').value.trim(),
      region:       $('cRegion').value.trim(),
      roastLevel:   $('cRoastLevel').value,
      process:      $('cProcess').value,
      variety:      $('cVariety').value.trim(),
      beanType:     $('cBeanType').value || null,
      status:       $('cStatus').value,
      dateAdded:    $('cDateAdded').value,
      dateFinished: $('cDateFinished').value || null,
      tasteTags,
      description:  $('cDescription').value.trim(),
      cost:         $('cCost').value ? parseFloat($('cCost').value) : null,
      roastDate:    $('cRoastDate').value || null,
      dialInNotes:  $('cDialInNotes').value.trim() || null,
      bagOpened:    existingCoffee?.bagOpened || false,
      image:        imagePath
    };

    let updated;
    if (existingId) {
      updated = state.coffees.map(c => c.id === existingId ? coffee : c);
    } else {
      updated = [...state.coffees, coffee];
    }

    await writeDataFile('coffees.json', updated,
      `☕ ${existingId ? 'Update' : 'Add'} coffee: ${name}`);
    state.coffees = updated;
    populateFilters();
    closeModal();
    renderCatalog();
    showToast(existingId ? 'Coffee updated' : 'Coffee added!', 'success');
  } catch (err) {
    $('cSaving').style.display = 'none';
    showToast(err.message, 'error');
  }
}

// --- Roaster Form ---
function openRoasterForm(existing = null) {
  const isEdit = !!existing;
  const r = existing || {};

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);margin-bottom:1.5rem;">
      ${isEdit ? 'Edit Roaster' : 'Add Roaster'}
    </h2>
    <div class="admin-form" id="roasterForm">
      <div class="form-field">
        <label class="form-label">Roaster Name <span>*</span></label>
        <input class="form-input" type="text" id="rName" placeholder="e.g. Blue Tokai Coffee Roasters" value="${r.name||''}" required />
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">City</label>
          <input class="form-input" type="text" id="rCity" placeholder="e.g. Delhi" value="${r.city||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Country</label>
          <input class="form-input" type="text" id="rCountry" placeholder="e.g. India" value="${r.country||''}" />
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Location (display text)</label>
        <input class="form-input" type="text" id="rLocation" placeholder="e.g. India (Delhi, Mumbai, Bengaluru)" value="${r.location||''}" />
      </div>
      <div class="form-field">
        <label class="form-label">Website</label>
        <input class="form-input" type="url" id="rWebsite" placeholder="https://…" value="${r.website||''}" />
      </div>
      <div class="form-field">
        <label class="form-label">Speciality Tags</label>
        <input class="form-input" type="text" id="rSpeciality"
               placeholder="e.g. Single Origin, Direct Trade (comma-separated)"
               value="${(r.speciality||[]).join(', ')}" />
      </div>
      <div class="form-field">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="rDescription" placeholder="What makes this roaster special?">${r.description||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Photo (optional)</label>
        <div class="form-image-upload">
          <input type="file" accept="image/*" id="rImgFile" onchange="previewFormImage(this,'rImgPreview','rImgUpload')" />
          <div class="form-image-upload-label">📷 Upload a photo or logo</div>
          ${r.image ? `<img src="${r.image}" class="form-image-preview" id="rImgPreview" style="display:block;" />` :
            `<img class="form-image-preview" id="rImgPreview" />`}
        </div>
      </div>
      <div class="form-actions">
        <div class="form-saving" id="rSaving" style="display:none;">☕ Saving…</div>
        <button class="btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" type="button" onclick="saveRoaster('${isEdit ? r.id : ''}')">
          ${isEdit ? 'Save Changes' : 'Add Roaster'}
        </button>
      </div>
    </div>
  `;
  $('modalOverlay').classList.add('active');
}

async function saveRoaster(existingId) {
  const name = $('rName').value.trim();
  if (!name) { showToast('Please enter a roaster name', 'error'); return; }

  const specialityRaw = $('rSpeciality').value;
  const speciality = specialityRaw ? specialityRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

  const fileInput = $('rImgFile');
  let imagePath = existingId ? (state.roasters.find(r => r.id === existingId)?.image || null) : null;

  $('rSaving').style.display = 'flex';

  try {
    const itemId = existingId || slugify(name);

    if (fileInput && fileInput.files[0]) {
      imagePath = await uploadImageFile(fileInput.files[0], 'roasters', itemId);
    }

    const roaster = {
      id: existingId || itemId,
      name,
      location:    $('rLocation').value.trim() || name,
      city:        $('rCity').value.trim(),
      country:     $('rCountry').value.trim(),
      website:     $('rWebsite').value.trim(),
      description: $('rDescription').value.trim(),
      speciality,
      roastLevels: existingId ? (state.roasters.find(r => r.id === existingId)?.roastLevels || []) : [],
      added:       existingId ? (state.roasters.find(r => r.id === existingId)?.added || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0],
      image:       imagePath
    };

    let updated;
    if (existingId) {
      updated = state.roasters.map(r => r.id === existingId ? roaster : r);
    } else {
      updated = [...state.roasters, roaster];
    }

    await writeDataFile('roasters.json', updated,
      `🏭 ${existingId ? 'Update' : 'Add'} roaster: ${name}`);
    state.roasters = updated;
    populateFilters();
    closeModal();
    renderRoasters();
    showToast(existingId ? 'Roaster updated' : 'Roaster added!', 'success');
  } catch (err) {
    $('rSaving').style.display = 'none';
    showToast(err.message, 'error');
  }
}

function toggleInlineRoasterForm() {
  const form = $('inlineRoasterForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? '' : 'none';
  if (form.style.display !== 'none') $('irName').focus();
}

async function saveInlineRoaster() {
  const name = $('irName').value.trim();
  if (!name) { showToast('Enter a roaster name', 'error'); return; }
  const btn = $('irSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const roaster = {
      id:       slugify(name),
      name,
      location: $('irLocation').value.trim() || null,
      website:  null,
      description: null,
      image:    null
    };
    const updated = [...state.roasters, roaster];
    await writeDataFile('roasters.json', updated, `Add roaster: ${name}`);
    state.roasters = updated;
    // Add new option to the dropdown and select it
    const sel = $('cRoasterId');
    if (sel) {
      const opt = document.createElement('option');
      opt.value = roaster.id; opt.textContent = roaster.name;
      sel.appendChild(opt);
      sel.value = roaster.id;
    }
    toggleInlineRoasterForm();
    showToast('Roaster added!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if ($('irSaveBtn')) { $('irSaveBtn').disabled = false; $('irSaveBtn').textContent = 'Save Roaster'; }
  }
}

// --- Gear Form ---
function openGearForm(existing = null) {
  const isEdit = !!existing;
  const g = existing || {};

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);margin-bottom:1.5rem;">
      ${isEdit ? 'Edit Gear' : 'Add Gear'}
    </h2>
    <div class="admin-form" id="gearForm">
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Name <span>*</span></label>
          <input class="form-input" type="text" id="gName" placeholder="e.g. Hario V60" value="${g.name||''}" required />
        </div>
        <div class="form-field">
          <label class="form-label">Type</label>
          <select class="form-select" id="gType">
            <option value="">Select…</option>
            ${['Pour Over','Immersion','Stovetop','Hybrid Immersion','Drip / Percolation','Espresso Machine','Hand Grinder','Electric Grinder','Kettle','Scale','Accessories']
              .map(t => `<option ${g.type===t?'selected':''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Grind Range</label>
        <input class="form-input" type="text" id="gGrind" placeholder="e.g. Medium-Fine" value="${g.grind||''}" />
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Cost (optional)</label>
          <div class="form-input-prefix-wrap">
            <span class="form-input-prefix">${CURRENCY}</span>
            <input class="form-input form-input--prefixed" type="number" id="gCost" placeholder="e.g. 12000" value="${g.cost||''}" min="0" step="1" />
          </div>
        </div>
        <div class="form-field">
          <label class="form-label">Date Purchased</label>
          <input class="form-input" type="date" id="gDateAdded" value="${g.dateAdded||''}" />
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Description</label>
        <textarea class="form-textarea" id="gDescription" placeholder="What does this piece of gear do? What's special about it?">${g.description||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Notes / Tips</label>
        <textarea class="form-textarea" id="gNotes" placeholder="Tips, quirks, things to remember…" style="min-height:70px;">${g.notes||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Photo (optional)</label>
        <div class="form-image-upload">
          <input type="file" accept="image/*" id="gImgFile" onchange="previewFormImage(this,'gImgPreview','gImgUpload')" />
          <div class="form-image-upload-label">📷 Upload a photo of this piece of gear</div>
          ${g.image ? `<img src="${g.image}" class="form-image-preview" id="gImgPreview" style="display:block;" />` :
            `<img class="form-image-preview" id="gImgPreview" />`}
        </div>
      </div>
      <div class="form-actions">
        <div class="form-saving" id="gSaving" style="display:none;">☕ Saving…</div>
        <button class="btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" type="button" onclick="saveGear('${isEdit ? g.id : ''}')">
          ${isEdit ? 'Save Changes' : 'Add Gear'}
        </button>
      </div>
    </div>
  `;
  $('modalOverlay').classList.add('active');
}

async function saveGear(existingId) {
  const name = $('gName').value.trim();
  if (!name) { showToast('Please enter a gear name', 'error'); return; }

  const fileInput = $('gImgFile');
  let imagePath = existingId ? (state.gear.find(g => g.id === existingId)?.image || null) : null;

  $('gSaving').style.display = 'flex';

  try {
    const itemId = existingId || slugify(name);

    if (fileInput && fileInput.files[0]) {
      imagePath = await uploadImageFile(fileInput.files[0], 'gear', itemId);
    }

    const existing = existingId ? state.gear.find(g => g.id === existingId) : null;

    const gear = {
      id:          existingId || itemId,
      name,
      type:        $('gType').value,
      description: $('gDescription').value.trim(),
      grind:       $('gGrind').value.trim(),
      grindSettings: existing?.grindSettings || null,
      notes:       $('gNotes').value.trim(),
      tags:        existing?.tags || [],
      cost:        $('gCost').value ? parseFloat($('gCost').value) : null,
      dateAdded:   $('gDateAdded').value || null,
      image:       imagePath
    };

    let updated;
    if (existingId) {
      updated = state.gear.map(g => g.id === existingId ? gear : g);
    } else {
      updated = [...state.gear, gear];
    }

    await writeDataFile('gear.json', updated,
      `⚙️ ${existingId ? 'Update' : 'Add'} gear: ${name}`);
    state.gear = updated;
    closeModal();
    renderGear();
    showToast(existingId ? 'Gear updated' : 'Gear added!', 'success');
  } catch (err) {
    $('gSaving').style.display = 'none';
    showToast(err.message, 'error');
  }
}

// ---- IMAGE PREVIEW HELPER ----
function previewFormImage(input, previewId, uploadId) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = $(previewId);
    img.src = e.target.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// ---- RECIPE FORM ----
function openRecipeForm(existing = null) {
  const isEdit = !!existing;
  const r = existing || {};
  const steps = r.steps && r.steps.length ? r.steps : [{time:'0:00',action:''},{time:'',action:''},{time:'',action:''}];

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);margin-bottom:1.5rem;">
      ${isEdit ? 'Edit Recipe' : 'Add Recipe'}
    </h2>
    <div class="admin-form">
      <div class="form-row">
        <div class="form-field" style="flex:2;">
          <label class="form-label">Title <span>*</span></label>
          <input class="form-input" type="text" id="rTitle" placeholder="e.g. My V60 Recipe" value="${r.title||''}" />
        </div>
        <div class="form-field">
          <label class="form-label">Brew Method</label>
          <select class="form-select" id="rGear">
            <option value="">Select…</option>
            ${Object.entries(GEAR_TO_METHOD).map(([k,v]) => `<option value="${k}" ${r.gear===k?'selected':''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Dose</label>
          <input class="form-input" type="text" id="rDose" placeholder="e.g. 18g" value="${r.dose||''}" /></div>
        <div class="form-field"><label class="form-label">Water</label>
          <input class="form-input" type="text" id="rWater" placeholder="e.g. 300ml at 94°C" value="${r.water||''}" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Ratio</label>
          <input class="form-input" type="text" id="rRatio" placeholder="e.g. 1:16.7" value="${r.ratio||''}" /></div>
        <div class="form-field"><label class="form-label">Total Time</label>
          <input class="form-input" type="text" id="rTotalTime" placeholder="e.g. 3:30" value="${r.totalTime||''}" /></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label class="form-label">Yield</label>
          <input class="form-input" type="text" id="rYield" placeholder="e.g. 300ml" value="${r.yield||''}" /></div>
        <div class="form-field"><label class="form-label">Grind Size</label>
          <input class="form-input" type="text" id="rGrindSize" placeholder="e.g. Medium-Fine (22–24 clicks)" value="${r.grindSize||''}" /></div>
      </div>

      <div class="form-field">
        <label class="form-label">Steps</label>
        <div id="rStepsContainer">
          ${steps.map(s => `
            <div class="recipe-step-row">
              <input class="form-input step-time-input" type="text" placeholder="0:00" value="${s.time||''}" data-time />
              <input class="form-input step-action-input" type="text" placeholder="Describe this step…" value="${s.action||''}" data-action />
              <button type="button" class="recipe-step-remove" onclick="this.closest('.recipe-step-row').remove()">×</button>
            </div>
          `).join('')}
        </div>
        <button type="button" class="btn-secondary" style="margin-top:0.5rem;font-size:0.8rem;" onclick="addRecipeStep()">+ Add Step</button>
      </div>

      <div class="form-field">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="rNotes" placeholder="Tips, adjustments, what makes this recipe work…" style="min-height:70px;">${r.notes||''}</textarea>
      </div>
      <div class="form-actions">
        <div class="form-saving" id="recipeSaving" style="display:none;">☕ Saving…</div>
        <button class="btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" type="button" onclick="saveRecipe('${isEdit ? r.id : ''}')">
          ${isEdit ? 'Save Changes' : 'Add Recipe'}
        </button>
      </div>
    </div>
  `;
  $('modalOverlay').classList.add('active');
}

function addRecipeStep() {
  const container = $('rStepsContainer');
  if (!container) return;
  const row = document.createElement('div');
  row.className = 'recipe-step-row';
  row.innerHTML = `
    <input class="form-input step-time-input" type="text" placeholder="0:00" data-time />
    <input class="form-input step-action-input" type="text" placeholder="Describe this step…" data-action />
    <button type="button" class="recipe-step-remove" onclick="this.closest('.recipe-step-row').remove()">×</button>
  `;
  container.appendChild(row);
  row.querySelector('[data-action]').focus();
}

async function saveRecipe(existingId) {
  const title = $('rTitle').value.trim();
  if (!title) { showToast('Please enter a recipe title', 'error'); return; }

  const steps = Array.from(document.querySelectorAll('.recipe-step-row'))
    .map(row => ({
      time:   row.querySelector('[data-time]').value.trim(),
      action: row.querySelector('[data-action]').value.trim()
    }))
    .filter(s => s.action);

  const recipe = {
    id:        existingId || slugify(title),
    title,
    gear:      $('rGear').value,
    yield:     $('rYield').value.trim(),
    dose:      $('rDose').value.trim(),
    water:     $('rWater').value.trim(),
    ratio:     $('rRatio').value.trim(),
    totalTime: $('rTotalTime').value.trim(),
    grindSize: $('rGrindSize').value.trim(),
    steps,
    notes:     $('rNotes').value.trim(),
    tags:      existingId ? (state.recipes.find(r => r.id === existingId)?.tags || []) : []
  };

  $('recipeSaving').style.display = 'flex';
  try {
    const updated = existingId
      ? state.recipes.map(r => r.id === existingId ? recipe : r)
      : [...state.recipes, recipe];
    await writeDataFile('recipes.json', updated,
      `📋 ${existingId ? 'Update' : 'Add'} recipe: ${title}`);
    state.recipes = updated;
    closeModal();
    renderRecipes();
    showToast(existingId ? 'Recipe updated' : 'Recipe added!', 'success');
  } catch (err) {
    $('recipeSaving').style.display = 'none';
    showToast(err.message, 'error');
  }
}

// ---- SECTION: INSIGHTS ----
function renderInsights() {
  const content = $('insightsContent');
  const j = state.journal;

  if (j.length === 0) {
    content.innerHTML = `<div class="empty-state"><div class="empty-icon">📊</div><h3>No data yet</h3><p>Log some cups to see insights here.</p></div>`;
    return;
  }

  // Taste tags frequency
  const tagCounts = {};
  j.forEach(e => (e.tasteTags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const maxTagCount = topTags[0]?.[1] || 1;

  // Brew method breakdown
  const methodMap = {};
  j.forEach(e => {
    if (!e.brewMethod) return;
    if (!methodMap[e.brewMethod]) methodMap[e.brewMethod] = { count: 0, ratings: [], scores: [] };
    methodMap[e.brewMethod].count++;
    if (e.overallRating) methodMap[e.brewMethod].ratings.push(e.overallRating);
    const s = e.scores || {};
    const vals = ['acidity','body','sweetness','finish'].map(k => s[k]).filter(v => v != null);
    if (vals.length) methodMap[e.brewMethod].scores.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  });
  const methods = Object.entries(methodMap).sort((a, b) => b[1].count - a[1].count);

  // Top rated coffees
  const coffeeRatings = {};
  j.forEach(e => {
    const key = e.coffeeId || e.beanName || 'Unknown';
    if (!coffeeRatings[key]) coffeeRatings[key] = { name: e.beanName || key, ratings: [] };
    if (e.overallRating) coffeeRatings[key].ratings.push(e.overallRating);
  });
  const topCoffees = Object.values(coffeeRatings)
    .filter(c => c.ratings.length > 0)
    .map(c => ({ ...c, avg: c.ratings.reduce((a, b) => a + b, 0) / c.ratings.length }))
    .sort((a, b) => b.avg - a.avg || b.ratings.length - a.ratings.length)
    .slice(0, 5);

  // Quick stats
  const roastLevels = {};
  j.forEach(e => { if (e.roastLevel) roastLevels[e.roastLevel] = (roastLevels[e.roastLevel] || 0) + 1; });
  const favRoast = Object.entries(roastLevels).sort((a, b) => b[1] - a[1])[0]?.[0];
  const ratedEntries = j.filter(e => e.overallRating);
  const avgRating = ratedEntries.length
    ? (ratedEntries.reduce((s, e) => s + e.overallRating, 0) / ratedEntries.length).toFixed(1)
    : null;

  content.innerHTML = `
    <div class="insights-grid">

      <div class="insight-quick-row">
        ${favRoast ? `<div class="insight-quick-card"><div class="iq-val">${favRoast}</div><div class="iq-label">Favourite Roast</div></div>` : ''}
        ${methods[0] ? `<div class="insight-quick-card"><div class="iq-val">${methods[0][0].replace('Basic Home ','')}</div><div class="iq-label">Top Brew Method</div></div>` : ''}
        ${avgRating ? `<div class="insight-quick-card"><div class="iq-val">${avgRating}★</div><div class="iq-label">Avg Rating</div></div>` : ''}
        <div class="insight-quick-card"><div class="iq-val">${new Set(j.map(e => e.coffeeId || e.beanName)).size}</div><div class="iq-label">Unique Coffees</div></div>
      </div>

      ${topTags.length ? `
        <div class="insight-card">
          <h3 class="insight-card-title">Taste Profile</h3>
          <div class="insight-bars">
            ${topTags.map(([tag, count]) => `
              <div class="insight-bar-row">
                <div class="insight-bar-label">${tag}</div>
                <div class="insight-bar-track">
                  <div class="insight-bar-fill" style="width:${Math.round(count / maxTagCount * 100)}%"></div>
                </div>
                <div class="insight-bar-count">${count}</div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${methods.length ? `
        <div class="insight-card">
          <h3 class="insight-card-title">Brew Methods</h3>
          <div class="insight-method-table">
            <div class="insight-method-header">
              <span>Method</span><span>Brews</span><span>Avg ★</span><span>Avg Score</span>
            </div>
            ${methods.map(([method, data]) => {
              const avgR = data.ratings.length ? (data.ratings.reduce((a,b)=>a+b,0)/data.ratings.length).toFixed(1) : '—';
              const avgS = data.scores.length  ? (data.scores.reduce((a,b)=>a+b,0)/data.scores.length).toFixed(1)   : '—';
              return `<div class="insight-method-row">
                <span class="insight-method-name">${method}</span>
                <span class="insight-method-num">${data.count}</span>
                <span class="insight-method-num">${avgR !== '—' ? avgR + '★' : '—'}</span>
                <span class="insight-method-num">${avgS !== '—' ? avgS + '/10' : '—'}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      ` : ''}

      ${topCoffees.length ? `
        <div class="insight-card">
          <h3 class="insight-card-title">Top Rated Coffees</h3>
          <div class="insight-top-list">
            ${topCoffees.map((c, i) => `
              <div class="insight-top-item">
                <span class="insight-top-rank">${i + 1}</span>
                <div class="insight-top-info">
                  <div class="insight-top-name">${c.name}</div>
                  <div class="insight-top-sub">${c.ratings.length} brew${c.ratings.length > 1 ? 's' : ''}</div>
                </div>
                <div class="insight-top-rating">${starsHtml(Math.round(c.avg))} <span style="font-size:0.75rem;color:var(--text-muted);font-family:var(--font-mono);">${c.avg.toFixed(1)}</span></div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

    </div>
  `;
}

// ---- SECTION: SPEND ----
function renderSpend() {
  const content = $('spendContent');
  const now = Date.now();
  const cutoff30 = now - 30 * 86400000;
  const cutoff90 = now - 90 * 86400000;

  const coffeeItems = state.coffees
    .filter(c => c.cost)
    .map(c => ({ name: c.name, cost: c.cost, date: c.dateAdded, type: 'coffee' }));

  const gearItems = state.gear
    .filter(g => g.cost)
    .map(g => ({ name: g.name, cost: g.cost, date: g.dateAdded, type: 'gear' }));

  const all = [...coffeeItems, ...gearItems]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  function itemsInPeriod(items, cutoff) {
    return items.filter(i => i.date && new Date(i.date + 'T00:00:00').getTime() >= cutoff);
  }

  const total = arr => arr.reduce((s, i) => s + (i.cost || 0), 0);

  const last30  = itemsInPeriod(all, cutoff30);
  const last90  = itemsInPeriod(all, cutoff90);
  const allTime = all;

  const coffee90 = itemsInPeriod(coffeeItems, cutoff90);
  const gear90   = itemsInPeriod(gearItems, cutoff90);

  if (all.length === 0) {
    content.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💰</div>
        <h3>No spend tracked yet</h3>
        <p>Add a cost when logging a coffee or gear item to track spend here.</p>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="spend-summary">
      <div class="spend-card">
        <div class="spend-card-amount">${fmtCost(total(last30))}</div>
        <div class="spend-card-label">Last 30 days</div>
        <div class="spend-card-sub">${last30.length} item${last30.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="spend-card">
        <div class="spend-card-amount">${fmtCost(total(last90))}</div>
        <div class="spend-card-label">Last 90 days</div>
        <div class="spend-card-sub">${last90.length} item${last90.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="spend-card">
        <div class="spend-card-amount">${fmtCost(total(allTime))}</div>
        <div class="spend-card-label">All time</div>
        <div class="spend-card-sub">${allTime.length} item${allTime.length !== 1 ? 's' : ''}</div>
      </div>
    </div>

    ${last90.length ? `
      <div class="spend-breakdown">
        <h3 class="spend-breakdown-title">Last 90 days breakdown</h3>
        <div class="spend-breakdown-row">
          <span>☕ Coffee</span>
          <span class="spend-breakdown-amt">${fmtCost(total(coffee90))}</span>
        </div>
        <div class="spend-breakdown-row">
          <span>⚙️ Gear</span>
          <span class="spend-breakdown-amt">${fmtCost(total(gear90))}</span>
        </div>
      </div>
    ` : ''}

    <h3 class="spend-list-title">All purchases</h3>
    <div class="spend-list">
      ${all.map(i => `
        <div class="spend-list-item">
          <div class="spend-list-left">
            <span class="spend-list-icon">${i.type === 'coffee' ? '☕' : '⚙️'}</span>
            <div>
              <div class="spend-list-name">${i.name}</div>
              <div class="spend-list-date">${i.date ? formatDate(i.date) : '—'}</div>
            </div>
          </div>
          <div class="spend-list-cost">${fmtCost(i.cost)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

// ---- QUICK LOG ----
function openQuickLogForm() {
  const lastEntry = state.journal.length
    ? [...state.journal].sort((a,b) => b.date.localeCompare(a.date))[0]
    : null;
  const today = new Date().toISOString().split('T')[0];

  const currentCoffees = state.coffees.filter(c => c.status === 'current');
  const coffeeOptions = [
    ...currentCoffees.map(c =>
      `<option value="${c.id}" ${lastEntry?.coffeeId === c.id ? 'selected' : ''}>${c.name}</option>`
    ),
    ...state.coffees.filter(c => c.status !== 'current').map(c =>
      `<option value="${c.id}" ${lastEntry?.coffeeId === c.id && !currentCoffees.find(x=>x.id===c.id) ? 'selected' : ''}>${c.name} (past)</option>`
    )
  ].join('');

  const brewMethods = ['V60 / Pour Over','French Press','Moka Pot','South Indian Filter','Clever Dripper','Basic Home Espresso'];
  const methodOptions = brewMethods.map(m =>
    `<option ${lastEntry?.brewMethod === m ? 'selected' : ''}>${m}</option>`
  ).join('');

  const tasteTags = ['Fruity','Chocolatey','Nutty','Caramel','Citrus','Floral','Earthy','Brown Sugar','Spicy','Bright','Smooth','Complex'];
  const lastTags = lastEntry?.tasteTags || [];

  const prevRating = lastEntry?.overallRating || 4;

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.4rem;margin-bottom:1.25rem;">Quick Log ☕</h2>
    <div class="admin-form" id="quickLogForm">
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Date</label>
          <input class="form-input" type="date" id="qlDate" value="${today}" />
        </div>
        <div class="form-field">
          <label class="form-label">Brew Method</label>
          <select class="form-select" id="qlMethod">
            ${methodOptions}
          </select>
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Coffee</label>
        <select class="form-select" id="qlCoffeeId" onchange="handleQuickLogCoffeeSelect(this.value)">
          <option value="">— Select coffee —</option>
          ${coffeeOptions}
        </select>
      </div>
      <div class="form-field">
        <label class="form-label">Rating <span style="color:var(--accent-dark);font-size:0.75rem;font-style:italic;font-weight:400;">(required)</span></label>
        <div class="star-rating-input">
          ${[5,4,3,2,1].map(n =>
            `<input type="radio" name="qlRating" id="qlStar${n}" value="${n}" ${prevRating===n?'checked':''} />
             <label for="qlStar${n}">★</label>`
          ).join('')}
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Taste</label>
        <div class="quick-log-taste-chips" id="qlTasteChips">
          ${tasteTags.map(t => `
            <button type="button" class="quick-log-chip ${lastTags.includes(t)?'selected':''}"
              onclick="this.classList.toggle('selected')">${t}</button>
          `).join('')}
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="qlNotes" placeholder="How was it?" style="min-height:60px;"></textarea>
      </div>

      <button class="brew-details-toggle" type="button" onclick="toggleBrewDetails()">
        <span id="brewDetailsArrow">▶</span> Brew details
      </button>
      <div class="brew-details-panel" id="brewDetailsPanel">
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Dose</label>
            <input class="form-input" type="text" id="qlDose" placeholder="e.g. 18g" value="${lastEntry?.dose||''}" />
          </div>
          <div class="form-field">
            <label class="form-label">Water</label>
            <input class="form-input" type="text" id="qlWater" placeholder="e.g. 300ml" value="${lastEntry?.water||''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Temp</label>
            <input class="form-input" type="text" id="qlTemp" placeholder="e.g. 94°C" value="${lastEntry?.waterTemp||''}" />
          </div>
          <div class="form-field">
            <label class="form-label">Time</label>
            <input class="form-input" type="text" id="qlTime" placeholder="e.g. 3:30" value="${lastEntry?.totalTime||''}" />
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label class="form-label">Grind Clicks</label>
            <input class="form-input" type="number" id="qlGrindClicks" placeholder="e.g. 24" value="${lastEntry?.grindClicks||''}" />
          </div>
          <div class="form-field">
            <label class="form-label">Grind Label</label>
            <input class="form-input" type="text" id="qlGrindLabel" placeholder="e.g. Medium-Fine" value="${lastEntry?.grindLabel||''}" />
          </div>
        </div>
      </div>

      <div class="form-actions">
        <div class="form-saving" id="qlSaving" style="display:none;">☕ Saving…</div>
        <button class="btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" type="button" onclick="saveQuickLog()">Log Cup</button>
      </div>
    </div>
  `;
  $('modalOverlay').classList.add('active');

  // Auto-fill bean name from selected coffee
  const preselectedId = $('qlCoffeeId').value;
  if (preselectedId) handleQuickLogCoffeeSelect(preselectedId);
}

function handleQuickLogCoffeeSelect(coffeeId) {
  const coffee = state.coffees.find(c => c.id === coffeeId);
  if (!coffee) return;
  // Pre-fill brew method from dial-in notes? Just leave as-is (last entry method already selected)
}

function toggleBrewDetails() {
  const panel = $('brewDetailsPanel');
  const arrow = $('brewDetailsArrow');
  const isOpen = panel.classList.toggle('open');
  if (arrow) arrow.textContent = isOpen ? '▼' : '▶';
}

async function saveQuickLog() {
  const ratingEl = document.querySelector('input[name="qlRating"]:checked');
  if (!ratingEl) { showToast('Please select a rating', 'error'); return; }

  const coffeeId = $('qlCoffeeId').value || null;
  const coffee = coffeeId ? state.coffees.find(c => c.id === coffeeId) : null;

  const tasteTags = Array.from(document.querySelectorAll('.quick-log-chip.selected'))
    .map(el => el.textContent.trim());

  const entry = {
    id:           generateId('entry'),
    date:         $('qlDate').value || new Date().toISOString().split('T')[0],
    coffeeId:     coffeeId,
    beanName:     coffee?.name || '',
    roasterId:    coffee?.roasterId || null,
    roasterName:  coffee?.roasterId ? (state.roasters.find(r => r.id === coffee.roasterId)?.name || '') : '',
    origin:       coffee?.origin || '',
    roastLevel:   coffee?.roastLevel || '',
    brewMethod:   $('qlMethod').value,
    grindClicks:  $('qlGrindClicks').value ? parseInt($('qlGrindClicks').value) : null,
    grindLabel:   $('qlGrindLabel').value.trim() || '',
    dose:         $('qlDose').value.trim() || '',
    water:        $('qlWater').value.trim() || '',
    ratio:        null,
    waterTemp:    $('qlTemp').value.trim() || '',
    totalTime:    $('qlTime').value.trim() || '',
    scores:       { acidity: 5, body: 5, sweetness: 5, finish: 5 },
    overallRating: parseInt(ratingEl.value),
    tasteTags,
    notes:        $('qlNotes').value.trim() || '',
    image:        null
  };

  $('qlSaving').style.display = 'flex';
  try {
    const updated = [...state.journal, entry];
    await writeDataFile('journal.json', updated, `☕ Quick log: ${entry.beanName || entry.brewMethod}`);
    state.journal = updated;
    updateStatStrip();
    closeModal();
    if (state.activeSection === 'journal') renderJournal();
    showToast('Logged!', 'success');
  } catch (err) {
    $('qlSaving').style.display = 'none';
    showToast(err.message, 'error');
  }
}

// ---- SEARCH ----
function handleSearch(q) {
  state.search = q;
  $('searchClear').classList.toggle('visible', q.length > 0);
  // Reset to page 1 when search changes
  state.pages.catalog = 1;
  state.pages.journal = 1;
  state.pages.gear = 1;
  state.pages.dispatches = 1;
  renderSection(state.activeSection);
}

// ---- IMPORT COFFEE FROM URL ----

// Detection helpers
const KNOWN_ORIGINS = ['ethiopia','kenya','colombia','brazil','india','guatemala','costa rica',
  'panama','indonesia','rwanda','burundi','tanzania','peru','mexico','honduras','nicaragua',
  'el salvador','vietnam','yemen','bolivia','ecuador','china','malawi','zambia','myanmar',
  'laos','haiti','dominican republic','jamaica','hawaii','coorg','chikmagalur','araku',
  'wayanad','pulney','bababudan'];

function detectRoastLevel(text) {
  const t = text.toLowerCase();
  if (t.includes('medium-light') || t.includes('medium light')) return 'Medium-Light';
  if (t.includes('medium-dark')  || t.includes('medium dark'))  return 'Medium-Dark';
  if (t.includes('light roast')  || t.includes('lightly roasted')) return 'Light';
  if (t.includes('dark roast')   || t.includes('darkly roasted'))  return 'Dark';
  if (t.includes('medium roast') || t.includes('medium'))          return 'Medium';
  if (/\blight\b/.test(t)) return 'Light';
  if (/\bdark\b/.test(t))  return 'Dark';
  return null;
}

function detectProcess(text) {
  const t = text.toLowerCase();
  if (t.includes('anaerobic'))                             return 'Anaerobic';
  if (t.includes('wet-hulled') || t.includes('wet hulled') || t.includes('giling basah')) return 'Wet-Hulled';
  if (t.includes('honey process') || t.includes('honey processed')) return 'Honey';
  if (t.includes('natural process') || t.includes('naturally processed') || t.includes('dry process')) return 'Natural';
  if (t.includes('washed process')  || t.includes('fully washed') || t.includes('wet process')) return 'Washed';
  if (/\bhoney\b/.test(t))   return 'Honey';
  if (/\bnatural\b/.test(t)) return 'Natural';
  if (/\bwashed\b/.test(t))  return 'Washed';
  return null;
}

function detectBeanType(text) {
  const t = text.toLowerCase();
  if (t.includes('robusta'))  return 'Robusta';
  if (t.includes('liberica')) return 'Liberica';
  if (t.includes('blend') || t.includes('blended')) return 'Blend';
  if (t.includes('arabica'))  return 'Arabica';
  return null;
}

function detectOrigin(text) {
  const t = text.toLowerCase();
  const found = KNOWN_ORIGINS.find(o => t.includes(o));
  if (!found) return null;
  return found.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function detectRegion(text) {
  const t = text.toLowerCase();
  const regions = ['coorg','chikmagalur','araku','wayanad','pulney','bababudan',
    'sidama','yirgacheffe','guji','gedeo','nyeri','kirinyaga','huila','nariño',
    'antioquia','minas gerais','sul de minas','cauca','santa barbara'];
  const found = regions.find(r => t.includes(r));
  return found ? found.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : null;
}

function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

function buildShopifyJsonUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (!u.pathname.includes('/products/')) return null;
    const handle = u.pathname.split('/products/')[1].split('?')[0].split('/')[0];
    if (!handle) return null;
    return `${u.origin}/products/${handle}.json`;
  } catch { return null; }
}

function parseShopifyProduct(p) {
  const allText = [p.title, p.body_html, ...(p.tags || [])].join(' ');
  const desc = stripHtml(p.body_html || '').slice(0, 400);
  const price = p.variants?.[0]?.price ? parseFloat(p.variants[0].price) : null;

  // Shopify tags often contain tasting notes — filter out structural ones
  const structural = new Set(['new','sale','featured','bestseller','subscription','gift','bundle']);
  const tasteTags = (p.tags || [])
    .filter(t => {
      const tl = t.toLowerCase();
      return !detectRoastLevel(tl) && !detectProcess(tl) && !detectBeanType(tl)
          && !detectOrigin(tl) && !structural.has(tl) && t.length < 25 && !/^\d/.test(t);
    })
    .slice(0, 6);

  return {
    name:        p.title || null,
    roasterName: p.vendor || null,
    origin:      detectOrigin(allText),
    region:      detectRegion(allText),
    process:     detectProcess(allText),
    roastLevel:  detectRoastLevel(allText),
    beanType:    detectBeanType(allText),
    variety:     null,
    description: desc || null,
    tasteTags,
    priceINR:    price
  };
}

function parseJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const raw = JSON.parse(m[1]);
      const items = Array.isArray(raw) ? raw : (raw['@graph'] || [raw]);
      const product = items.find(i => {
        const t = i['@type'];
        return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
      });
      if (!product) continue;
      const allText = [product.name, product.description, product.keywords].filter(Boolean).join(' ');
      const price = product.offers?.price ?? product.offers?.[0]?.price ?? null;
      return {
        name:        product.name || null,
        roasterName: product.brand?.name || null,
        origin:      detectOrigin(allText),
        region:      detectRegion(allText),
        process:     detectProcess(allText),
        roastLevel:  detectRoastLevel(allText),
        beanType:    detectBeanType(allText),
        variety:     null,
        description: (product.description || '').replace(/\s+/g,' ').slice(0, 400) || null,
        tasteTags:   [],
        priceINR:    price ? parseFloat(price) : null
      };
    } catch {}
  }
  return null;
}

function parseMetaTags(html) {
  const get = (...props) => {
    for (const prop of props) {
      const m = html.match(new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"'<>]+)["']`, 'i'
      )) || html.match(new RegExp(
        `<meta[^>]+content=["']([^"'<>]+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'
      ));
      if (m?.[1]) return m[1].trim();
    }
    return null;
  };
  const title = get('og:title','twitter:title');
  if (!title) return null;
  const desc  = get('og:description','twitter:description','description');
  const allText = [title, desc].filter(Boolean).join(' ');
  return {
    name:        title,
    roasterName: null,
    origin:      detectOrigin(allText),
    region:      detectRegion(allText),
    process:     detectProcess(allText),
    roastLevel:  detectRoastLevel(allText),
    beanType:    detectBeanType(allText),
    variety:     null,
    description: desc?.slice(0, 400) || null,
    tasteTags:   [],
    priceINR:    null
  };
}

function applyImportedDetails(d) {
  const set = (id, val) => { if (val && $(id)) $(id).value = val; };
  const sel = (id, val) => {
    if (!val) return;
    const el = $(id);
    if (!el) return;
    const opt = Array.from(el.options).find(o => o.value === val);
    if (opt) el.value = val;
  };
  set('cName',        d.name);
  set('cOrigin',      d.origin);
  set('cRegion',      d.region);
  set('cVariety',     d.variety);
  set('cDescription', d.description);
  if (d.tasteTags?.length) set('cTasteTags', d.tasteTags.join(', '));
  if (d.priceINR)          set('cCost', d.priceINR);
  sel('cProcess',    d.process);
  sel('cRoastLevel', d.roastLevel);
  sel('cBeanType',   d.beanType);

  let roasterNote = '';
  if (d.roasterName) {
    const match = state.roasters.find(r => {
      const rl = r.name.toLowerCase(), dl = d.roasterName.toLowerCase();
      return rl.includes(dl) || dl.includes(rl) || rl.split(' ')[0] === dl.split(' ')[0];
    });
    if (match) {
      const sel = $('cRoasterId');
      if (sel) sel.value = match.id;
    } else {
      roasterNote = ` Roaster "${d.roasterName}" not in your list — use + Add new roaster below.`;
    }
  }
  return roasterNote;
}

async function importCoffeeFromUrl() {
  const urlInput = $('importUrl');
  const rawUrl = urlInput?.value.trim();
  if (!rawUrl) { showToast('Paste a URL first', 'error'); return; }

  const btn = $('importUrlBtn');
  const status = $('importUrlStatus');
  btn.disabled = true;
  btn.textContent = '⏳ Looking up…';
  status.style.color = 'var(--text-muted)';

  try {
    let details = null;
    let source = '';

    // Strategy 1: Shopify JSON endpoint (free, clean, instant)
    const shopifyUrl = buildShopifyJsonUrl(rawUrl);
    if (shopifyUrl) {
      status.textContent = 'Trying Shopify product data…';
      try {
        const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(shopifyUrl)}`);
        if (r.ok) {
          const payload = await r.json();
          const parsed = JSON.parse(payload.contents || '{}');
          if (parsed.product) { details = parseShopifyProduct(parsed.product); source = 'Shopify'; }
        }
      } catch {}
    }

    // Strategy 2: JSON-LD structured data from page HTML
    if (!details) {
      status.textContent = 'Reading page structured data…';
      const r = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(rawUrl)}`);
      if (!r.ok) throw new Error('Could not fetch the page — check the URL and try again.');
      const payload = await r.json();
      const html = payload.contents || '';
      if (!html) throw new Error('Page returned empty content.');

      details = parseJsonLd(html);
      if (details) { source = 'JSON-LD'; }
      else {
        // Strategy 3: Open Graph / meta tags
        details = parseMetaTags(html);
        source = 'meta tags';
      }
    }

    if (!details) throw new Error('Could not extract coffee details from this page. Try copying the details manually.');

    const roasterNote = applyImportedDetails(details);

    const filledCount = Object.entries(details)
      .filter(([k, v]) => k !== 'tasteTags' ? !!v : v?.length > 0).length;

    status.textContent = `✓ Found ${filledCount} details via ${source}. Review and fill in anything missing.${roasterNote}`;
    status.style.color = roasterNote ? 'var(--accent-dark)' : 'var(--green)';

  } catch (err) {
    status.textContent = '✗ ' + err.message;
    status.style.color = 'var(--red)';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Look up'; }
  }
}

// ---- SECTION: DISPATCHES ----
function renderDispatches() {
  const grid = $('dispatchesGrid');
  const empty = $('dispatchesEmpty');
  if (!grid) return;

  Array.from(grid.children).forEach(c => { if (c !== empty) c.remove(); });
  const oldPag = $('dispatchesPagination');
  if (oldPag) oldPag.remove();

  const q = state.search.toLowerCase();
  const cat = state.dispatchFilter;

  const filtered = state.posts.filter(p => {
    if (cat && p.category !== cat) return false;
    if (q) {
      const blob = [p.title, p.category, p.excerpt, p.body, ...(p.tags||[])].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  }).sort((a, b) => b.date.localeCompare(a.date));

  if (filtered.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const page = state.pages.dispatches || 1;
  const size = 9;
  const sliced = filtered.slice((page - 1) * size, page * size);

  sliced.forEach(p => {
    const card = buildPostCard(p);
    grid.appendChild(card);
  });

  if (filtered.length > size) {
    const pag = document.createElement('div');
    pag.id = 'dispatchesPagination';
    pag.innerHTML = buildPagination(filtered.length, 'dispatches');
    grid.parentElement.appendChild(pag);
  }
}

function buildPostCard(p) {
  const q = state.search;
  const card = document.createElement('div');
  card.className = 'post-card';

  const coverHtml = p.coverImage
    ? `<div class="post-card-cover"><img src="${p.coverImage}" alt="${p.title}" loading="lazy" onerror="this.parentElement.innerHTML='<span class=post-card-cover-fallback>✍️</span>'" /></div>`
    : `<div class="post-card-cover"><span class="post-card-cover-fallback">✍️</span></div>`;

  card.innerHTML = `
    ${coverHtml}
    <div class="post-card-body">
      ${p.category ? `<span class="post-category-badge">${p.category}</span>` : ''}
      <div class="post-card-title">${highlight(p.title, q)}</div>
      ${p.excerpt ? `<div class="post-card-excerpt">${highlight(p.excerpt, q)}</div>` : ''}
    </div>
    <div class="post-card-footer">
      <span>${formatDate(p.date)}</span>
      <span>${(p.tags||[]).slice(0,2).map(t=>`#${t}`).join(' ')}</span>
    </div>
  `;

  card.addEventListener('click', (ev) => {
    if (ev.target.closest('.card-edit-btn')) { ev.stopPropagation(); openPostForm(p); return; }
    openPostModal(p);
  });

  return card;
}

function openPostModal(p) {
  $('modalBody').innerHTML = `
    ${p.coverImage ? `<img src="${p.coverImage}" class="modal-hero" alt="${p.title}" style="margin:-2rem -2rem 1.5rem;width:calc(100% + 4rem);max-height:260px;object-fit:cover;border-radius:var(--radius) var(--radius) 0 0;" />` : ''}
    ${p.category ? `<div style="display:inline-block;font-size:0.68rem;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;padding:0.2rem 0.6rem;border-radius:4px;background:var(--surface);color:var(--text-muted);margin-bottom:0.75rem;">${p.category}</div>` : ''}
    <h2 style="font-family:var(--font-display);font-size:1.65rem;color:var(--text);line-height:1.2;margin-bottom:0.5rem;">${p.title}</h2>
    <p style="font-size:0.82rem;color:var(--text-light);margin-bottom:1.25rem;">${formatDate(p.date)}</p>
    ${p.excerpt ? `<p style="font-size:0.95rem;color:var(--text-muted);font-style:italic;line-height:1.7;margin-bottom:1.25rem;padding-bottom:1.25rem;border-bottom:1px solid var(--border);">${p.excerpt}</p>` : ''}
    <div class="post-body-text">${p.body || ''}</div>
    ${(p.tags||[]).length ? `<div class="post-tags">${p.tags.map(t=>`<span class="post-tag">#${t}</span>`).join('')}</div>` : ''}
    ${state.adminMode ? `
      <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid var(--border);">
        <button class="btn-secondary" onclick="openPostForm(window._modalPost)">✏️ Edit Post</button>
      </div>
    ` : ''}
  `;
  window._modalPost = p;
  $('modalOverlay').classList.add('active');
}

function openPostForm(existing = null) {
  const isEdit = !!existing;
  const p = existing || {};

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);margin-bottom:1.5rem;">
      ${isEdit ? 'Edit Post' : 'New Dispatch'}
    </h2>
    <div class="admin-form" id="postForm">
      <div class="form-field">
        <label class="form-label">Title <span>*</span></label>
        <input class="form-input" type="text" id="pTitle" placeholder="e.g. A Weekend at Blue Tokai Indiranagar" value="${p.title||''}" required />
      </div>
      <div class="form-row">
        <div class="form-field">
          <label class="form-label">Category</label>
          <select class="form-select" id="pCategory">
            <option value="">Select…</option>
            ${['Café Visit','Origin Story','Roaster Profile','Recipe Deep-Dive','Musings'].map(c =>
              `<option ${p.category===c?'selected':''}>${c}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-field">
          <label class="form-label">Date</label>
          <input class="form-input" type="date" id="pDate" value="${p.date || new Date().toISOString().split('T')[0]}" />
        </div>
      </div>
      <div class="form-field">
        <label class="form-label">Excerpt <span style="color:var(--text-muted);font-weight:400;">(2–3 sentences)</span></label>
        <textarea class="form-textarea" id="pExcerpt" style="min-height:70px;" placeholder="A short summary shown on the card…">${p.excerpt||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Body <span>*</span></label>
        <textarea class="form-textarea" id="pBody" style="min-height:240px;" placeholder="Write your full post here. Line breaks are preserved.">${p.body||''}</textarea>
      </div>
      <div class="form-field">
        <label class="form-label">Tags <span style="color:var(--text-muted);font-weight:400;">(comma-separated)</span></label>
        <input class="form-input" type="text" id="pTags" placeholder="e.g. bangalore, filter coffee, single origin" value="${(p.tags||[]).join(', ')}" />
      </div>
      <div class="form-field">
        <label class="form-label">Cover Photo (optional)</label>
        <div class="form-image-upload" id="pImgUpload">
          <input type="file" accept="image/*" id="pImgFile" onchange="previewFormImage(this,'pImgPreview','pImgUpload')" />
          <div class="form-image-upload-label">📷 Click to upload a cover photo</div>
          ${p.coverImage
            ? `<img src="${p.coverImage}" class="form-image-preview" id="pImgPreview" style="display:block;" />`
            : `<img class="form-image-preview" id="pImgPreview" />`}
        </div>
      </div>
      <div class="form-actions">
        <div class="form-saving" id="pSaving" style="display:none;">✍️ Saving…</div>
        <button class="btn-secondary" type="button" onclick="closeModal()">Cancel</button>
        <button class="btn-primary" type="button" onclick="savePost('${isEdit ? p.id : ''}')">
          ${isEdit ? 'Save Changes' : 'Publish'}
        </button>
      </div>
    </div>
  `;
  $('modalOverlay').classList.add('active');
}

async function savePost(existingId) {
  const title = $('pTitle').value.trim();
  const body  = $('pBody').value.trim();
  if (!title) { showToast('Please enter a title', 'error'); return; }
  if (!body)  { showToast('Please write the post body', 'error'); return; }

  const tagsRaw = $('pTags').value;
  const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const fileInput = $('pImgFile');
  let coverImage = existingId ? (state.posts.find(p => p.id === existingId)?.coverImage || null) : null;

  $('pSaving').style.display = 'flex';

  try {
    const itemId = existingId || slugify(title) + '-' + Date.now().toString(36);

    if (fileInput && fileInput.files[0]) {
      coverImage = await uploadImageFile(fileInput.files[0], 'posts', itemId);
    }

    const post = {
      id:          itemId,
      title,
      date:        $('pDate').value || new Date().toISOString().split('T')[0],
      category:    $('pCategory').value || null,
      excerpt:     $('pExcerpt').value.trim() || null,
      body,
      tags,
      coverImage
    };

    const updated = existingId
      ? state.posts.map(p => p.id === existingId ? post : p)
      : [...state.posts, post];

    await writeDataFile('posts.json', updated,
      `✍️ ${existingId ? 'Update' : 'Publish'} dispatch: ${title}`);
    state.posts = updated;
    closeModal();
    renderDispatches();
    showToast(existingId ? 'Post updated' : 'Published!', 'success');
  } catch (err) {
    $('pSaving').style.display = 'none';
    showToast(err.message, 'error');
  }
}

// ---- EVENT LISTENERS ----
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  initAdmin();
  updateBottomNav('catalog');

  // Nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setSection(link.dataset.section);
    });
  });

  // Hamburger (may not exist in all layouts)
  const hamburgerEl = $('hamburger');
  if (hamburgerEl) {
    hamburgerEl.addEventListener('click', () => {
      $('mainNav')?.classList.toggle('open');
    });
  }

  // Search
  const searchEl = $('globalSearch');
  searchEl.addEventListener('input', (e) => handleSearch(e.target.value.trim()));
  $('searchClear').addEventListener('click', () => {
    searchEl.value = '';
    handleSearch('');
    searchEl.focus();
  });

  // Journal filters
  const filterMap = {
    filterCoffee:     'coffee',
    filterRoaster:    'roaster',
    filterRoastLevel: 'roastLevel',
    filterMethod:     'method',
    filterTaste:      'taste',
    filterDays:       'days'
  };
  Object.entries(filterMap).forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      state.filters[key] = e.target.value;
      state.pages.journal = 1;
      renderJournal();
    });
  });

  $('filterReset').addEventListener('click', () => {
    Object.keys(filterMap).forEach(id => $(id).value = '');
    state.filters = { coffee: '', roaster: '', roastLevel: '', method: '', taste: '', days: '' };
    state.pages.journal = 1;
    renderJournal();
  });

  // Set default period filter to last 7 days
  $('filterDays').value = state.filters.days;

  // Catalog filters
  const catFilterMap = {
    catFilterRoaster:    'roaster',
    catFilterRoastLevel: 'roastLevel',
    catFilterProcess:    'process'
  };
  Object.entries(catFilterMap).forEach(([id, key]) => {
    $(id).addEventListener('change', (e) => {
      state.catalogFilters[key] = e.target.value;
      state.pages.catalog = 1;
      renderCatalog();
    });
  });

  $('catFilterReset').addEventListener('click', () => {
    Object.keys(catFilterMap).forEach(id => $(id).value = '');
    state.catalogFilters = { roaster: '', roastLevel: '', process: '' };
    state.pages.catalog = 1;
    renderCatalog();
  });

  // Catalog tabs
  document.querySelectorAll('.catalog-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.catalog-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.catalogStatus = tab.dataset.status;
      state.pages.catalog = 1;
      renderCatalog();
    });
  });

  // Recipe filter buttons
  document.querySelectorAll('.recipe-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.recipe-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.recipeFilter = btn.dataset.gear;
      renderRecipes();
    });
  });

  // Dispatches category filter
  document.querySelectorAll('.dispatch-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dispatch-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.dispatchFilter = btn.dataset.category;
      state.pages.dispatches = 1;
      renderDispatches();
    });
  });

  // Add post button
  const addPostBtn = $('addPostBtn');
  if (addPostBtn) addPostBtn.addEventListener('click', () => openPostForm());

  // Modal close
  $('modalClose').addEventListener('click', closeModal);
  $('modalOverlay').addEventListener('click', (e) => {
    if (e.target === $('modalOverlay')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('adminPanel').classList.contains('open')) { closeAdminPanel(); return; }
      closeModal();
    }
  });

  // Admin panel
  $('adminLockBtn').addEventListener('click', openAdminPanel);
  $('adminPanelClose').addEventListener('click', closeAdminPanel);
  $('adminPanelOverlay').addEventListener('click', closeAdminPanel);

  $('adminLoginBtn').addEventListener('click', handleAdminLogin);
  $('adminPasswordInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAdminLogin();
  });

  $('adminLogoutBtn').addEventListener('click', handleAdminLogout);
  $('adminBadgeLock').addEventListener('click', handleAdminLogout);

  // GitHub PAT save
  $('saveTokenBtn').addEventListener('click', () => {
    const tok = $('githubTokenInput').value.trim();
    if (!tok || tok === '••••••••••••') {
      showToast('Please enter your GitHub token', 'error');
      return;
    }
    localStorage.setItem('cf_pat', tok);
    $('patStatus').textContent = '✓ Token saved';
    $('patStatus').className = 'admin-pat-status ok';
    $('githubTokenInput').value = '••••••••••••';
    showToast('GitHub token saved', 'success');
  });

  $('saveAnthropicKeyBtn').addEventListener('click', () => {
    const key = $('anthropicKeyInput').value.trim();
    if (!key || key === '••••••••••••') {
      showToast('Please enter your Anthropic API key', 'error');
      return;
    }
    localStorage.setItem('cf_anthropic_key', key);
    $('anthropicKeyStatus').textContent = '✓ Key saved — URL import active';
    $('anthropicKeyStatus').className = 'admin-pat-status ok';
    $('anthropicKeyInput').value = '••••••••••••';
    showToast('Anthropic key saved', 'success');
  });

  // Admin section add buttons
  $('addJournalBtn').addEventListener('click', () => openJournalForm());
  $('addCoffeeBtn').addEventListener('click',  () => openCoffeeForm());
  $('addGearBtn').addEventListener('click',    () => openGearForm());
  $('addRecipeBtn').addEventListener('click',  () => openRecipeForm());
});
