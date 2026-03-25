/* =============================================
   COFFEE FEVER — Main App JS
   ============================================= */

// ---- CONFIG ----
const GITHUB_OWNER  = 'rathialok901';
const GITHUB_REPO   = 'coffee-fever';
const GITHUB_BRANCH = 'main';

// ---- STATE ----
const state = {
  gear:     [],
  roasters: [],
  journal:  [],
  recipes:  [],
  coffees:  [],
  activeSection: 'journal',
  search:   '',
  filters:  { coffee: '', roaster: '', roastLevel: '', method: '', taste: '', days: '' },
  catalogStatus: 'current',
  recipeFilter: '',
  adminMode: false
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

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
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
  const [gear, roasters, journal, recipes, coffees] = await Promise.all([
    loadJSON('gear.json'),
    loadJSON('roasters.json'),
    loadJSON('journal.json'),
    loadJSON('recipes.json'),
    loadJSON('coffees.json')
  ]);
  state.gear     = gear;
  state.roasters = roasters;
  state.journal  = journal;
  state.recipes  = recipes;
  state.coffees  = coffees;
  populateFilters();
  updateStatStrip();
  renderSection(state.activeSection);
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
  $('mainNav').classList.remove('open');
  renderSection(name);
}

function renderSection(name) {
  if (name === 'journal')  renderJournal();
  if (name === 'catalog')  renderCatalog();
  if (name === 'roasters') renderRoasters();
  if (name === 'gear')     renderGear();
  if (name === 'recipes')  renderRecipes();
}

// ---- STAT STRIP ----
function updateStatStrip() {
  const j = state.journal;
  $('statCups').textContent     = j.length;
  $('statBeans').textContent    = new Set(j.map(e => e.coffeeId || e.beanName)).size;
  $('statRoasters').textContent = state.roasters.length;
  $('statMethods').textContent  = new Set(j.map(e => e.brewMethod).filter(Boolean)).size;
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
  const entries = getFilteredJournal();

  Array.from(grid.children).forEach(c => { if (c !== empty) c.remove(); });

  if (entries.length === 0) {
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  entries.forEach(e => {
    const card = buildJournalCard(e);
    grid.appendChild(card);
  });
}

function buildJournalCard(e) {
  const q = state.search;
  const div = document.createElement('div');
  div.className = 'journal-card journal-card--compact';

  div.innerHTML = `
    <div class="jc-main">
      <div class="jc-name">${highlight(e.beanName || 'Unnamed Bean', q)}</div>
      <div class="jc-method">${e.brewMethod || '—'}</div>
    </div>
    <div class="jc-right">
      ${e.overallRating ? `<div class="jc-stars">${starsHtml(e.overallRating)}</div>` : '<div class="jc-stars"></div>'}
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
  const filtered = state.coffees.filter(c => {
    if (c.status !== state.catalogStatus) return false;
    if (q) {
      const blob = [c.name, c.origin, c.region, c.process, c.variety, c.roastLevel,
                    ...(c.tasteTags||[])].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });

  Array.from(grid.children).forEach(c => { if (c !== empty) c.remove(); });

  if (filtered.length === 0) {
    empty.style.display = 'block';
    empty.querySelector('p').textContent = q
      ? 'No coffees match your search.'
      : `No ${state.catalogStatus === 'current' ? 'in-stock' : 'past'} coffees yet. ${state.adminMode ? 'Add one above.' : 'Check back later.'}`;
    return;
  }
  empty.style.display = 'none';

  filtered.forEach(c => {
    const card = buildCoffeeCard(c);
    grid.appendChild(card);
  });
}

function buildCoffeeCard(c) {
  const q = state.search;
  const roaster = state.roasters.find(r => r.id === c.roasterId);
  const roasterName = roaster ? roaster.name : (c.roasterId || '');
  const journalCount = state.journal.filter(e => e.coffeeId === c.id).length;

  const div = document.createElement('div');
  div.className = 'coffee-card';

  div.innerHTML = `
    ${buildCardImage(c.image, c.name)}
    <div class="coffee-card-body">
      <div class="coffee-card-name">${highlight(c.name, q)}</div>
      <div class="coffee-card-roaster">${highlight(roasterName, q)}</div>
      <div class="coffee-card-meta">
        ${c.roastLevel ? `<span class="roast-badge">${c.roastLevel}</span>` : ''}
        ${c.process ? `<span class="coffee-process-tag">${c.process}</span>` : ''}
        ${c.status === 'current'
          ? `<span class="status-current">● In Stock</span>`
          : `<span class="status-past">Finished</span>`}
      </div>
      <div class="journal-tags">
        ${(c.tasteTags||[]).slice(0,4).map(t => `<span class="taste-tag ${getTasteClass(t)}">${t}</span>`).join('')}
      </div>
    </div>
    <div class="coffee-card-footer">
      <span class="coffee-date">${c.origin || '—'}</span>
      <span style="font-size:0.775rem;color:var(--text-light);font-family:var(--font-mono);">
        ${journalCount ? journalCount + ' brew' + (journalCount > 1 ? 's' : '') : 'No brews yet'}
      </span>
    </div>
  `;

  div.addEventListener('click', (ev) => {
    if (ev.target.closest('.card-edit-btn')) { ev.stopPropagation(); openCoffeeForm(c); return; }
    openCoffeeModal(c);
  });

  return div;
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
        ['Added',       formatDate(c.dateAdded)],
        ['Finished',    c.dateFinished ? formatDate(c.dateFinished) : null]
      ].filter(([,v]) => v).map(([l,v]) => `
        <div class="modal-detail-item">
          <div class="modal-detail-label">${l}</div>
          <div class="modal-detail-value" style="font-family:var(--font-body);">${v}</div>
        </div>
      `).join('')}
    </div>

    ${c.description ? `<p style="font-size:0.9rem;color:var(--text);line-height:1.7;margin-bottom:1.25rem;">${c.description}</p>` : ''}

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

  filtered.forEach(g => {
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

  if (filtered.length === 0) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">
      <div class="empty-icon">⚙️</div>
      <h3>No gear found</h3>
      <p>${state.adminMode ? 'Add gear above.' : 'No gear matches your search.'}</p>
    </div>`;
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
            <span class="recipe-meta-item"><strong>${recipe.dose}</strong> coffee</span>
            <span class="recipe-meta-item"><strong>${recipe.water}</strong></span>
            <span class="recipe-meta-item"><strong>${recipe.ratio}</strong> ratio</span>
            <span class="recipe-meta-item"><strong>${recipe.totalTime}</strong></span>
          </div>
        </div>
        <span class="recipe-toggle">▼</span>
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
  const coffeeOptions = state.coffees.map(c => `<option value="${c.id}" ${e.coffeeId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
  const roasterOptions = state.roasters.map(r => `<option value="${r.id}" ${e.roasterId === r.id ? 'selected' : ''}>${r.name}</option>`).join('');
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
      <div class="form-field">
        <label class="form-label">Coffee (from catalog)</label>
        <select class="form-select" id="jCoffeeId" onchange="handleJournalCoffeeSelect(this.value)">
          <option value="">— Select or type manually —</option>
          ${coffeeOptions}
        </select>
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
      coffeeId: $('jCoffeeId').value || null,
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

  $('modalBody').innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:1.5rem;color:var(--text);margin-bottom:1.5rem;">
      ${isEdit ? 'Edit Coffee' : 'Add Coffee'}
    </h2>
    <div class="admin-form" id="coffeeForm">
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
          <label class="form-label">Status</label>
          <select class="form-select" id="cStatus">
            <option value="current" ${(c.status||'current')==='current'?'selected':''}>In Stock (Current)</option>
            <option value="past" ${c.status==='past'?'selected':''}>Finished (Past)</option>
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

    const coffee = {
      id: existingId || itemId,
      name,
      roasterId:    $('cRoasterId').value || null,
      origin:       $('cOrigin').value.trim(),
      region:       $('cRegion').value.trim(),
      roastLevel:   $('cRoastLevel').value,
      process:      $('cProcess').value,
      variety:      $('cVariety').value.trim(),
      status:       $('cStatus').value,
      dateAdded:    $('cDateAdded').value,
      dateFinished: $('cDateFinished').value || null,
      tasteTags,
      description:  $('cDescription').value.trim(),
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

// ---- SEARCH ----
function handleSearch(q) {
  state.search = q;
  $('searchClear').classList.toggle('visible', q.length > 0);
  renderSection(state.activeSection);
}

// ---- EVENT LISTENERS ----
document.addEventListener('DOMContentLoaded', () => {
  loadAll();
  initAdmin();

  // Nav links
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      setSection(link.dataset.section);
    });
  });

  // Hamburger
  $('hamburger').addEventListener('click', () => {
    $('mainNav').classList.toggle('open');
  });

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
      renderJournal();
    });
  });

  $('filterReset').addEventListener('click', () => {
    Object.keys(filterMap).forEach(id => $(id).value = '');
    state.filters = { coffee: '', roaster: '', roastLevel: '', method: '', taste: '', days: '' };
    renderJournal();
  });

  // Catalog tabs
  document.querySelectorAll('.catalog-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.catalog-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.catalogStatus = tab.dataset.status;
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

  // Admin section add buttons
  $('addJournalBtn').addEventListener('click', () => openJournalForm());
  $('addCoffeeBtn').addEventListener('click',  () => openCoffeeForm());
  $('addRoasterBtn').addEventListener('click', () => openRoasterForm());
  $('addGearBtn').addEventListener('click',    () => openGearForm());
});
