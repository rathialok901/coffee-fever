/* =============================================
   GROUNDS & GLORY — Main App JS
   ============================================= */

// ---- State ----
const state = {
  gear: [], roasters: [], journal: [], recipes: [],
  activeSection: 'journal',
  search: '',
  filters: { roaster: '', roastLevel: '', method: '', taste: '' },
  recipeFilter: ''
};

// ---- Unsplash proxy via Wikipedia/open image search ----
// We use a curated mapping for known items, fallback to placeholder
const GEAR_IMAGES = {
  'v60': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80',
  'french-press': 'https://images.unsplash.com/photo-1541167760496-1628856ab772?w=600&q=80',
  'moka-pot': 'https://images.unsplash.com/photo-1610889556528-9a770e32642f?w=600&q=80',
  'clever-dripper': 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=600&q=80',
  'south-indian-filter': 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=600&q=80',
  '1zpresso-k-ultra': 'https://images.unsplash.com/photo-1512568400610-62da28bc8a13?w=600&q=80'
};

const ROASTER_IMAGES = {
  'blue-tokai': 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=600&q=80',
  'coffeeverse': 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=600&q=80',
  'humble-bean': 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&q=80'
};

const DEFAULT_JOURNAL_IMG = 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=600&q=80';

// ---- Utility ----
function $(id) { return document.getElementById(id); }
function showToast(msg, duration = 2500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function highlight(text, query) {
  if (!query || !text) return text;
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return String(text).replace(re, '<mark class="search-highlight">$1</mark>');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getTasteClass(tag) {
  const t = tag.toLowerCase();
  if (t.includes('fruity') || t.includes('bright')) return 'fruity';
  if (t.includes('choc') || t.includes('nutty')) return 'chocolatey';
  if (t.includes('floral') || t.includes('delicate')) return 'floral';
  if (t.includes('earthy') || t.includes('smoky')) return 'earthy';
  if (t.includes('caramel') || t.includes('sweet')) return 'caramel';
  if (t.includes('spicy') || t.includes('complex')) return 'spicy';
  if (t.includes('citrus') || t.includes('acidic')) return 'citrus';
  return 'earthy';
}

// ---- Data Loading ----
async function loadJSON(path) {
  try {
    const r = await fetch(path + '?v=' + Date.now());
    if (!r.ok) return [];
    return await r.json();
  } catch (e) { return []; }
}

async function loadAll() {
  const [gear, roasters, journal, recipes] = await Promise.all([
    loadJSON('data/gear.json'),
    loadJSON('data/roasters.json'),
    loadJSON('data/journal.json'),
    loadJSON('data/recipes.json')
  ]);
  state.gear = gear;
  state.roasters = roasters;
  state.journal = journal;
  state.recipes = recipes;
  populateFilters();
  renderAll();
}

// ---- Navigation ----
function setSection(name) {
  state.activeSection = name;
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
  const sec = document.getElementById('section-' + name);
  if (sec) sec.classList.add('active');
  const link = document.querySelector(`.nav-link[data-section="${name}"]`);
  if (link) link.classList.add('active');
  // close mobile nav
  $('mainNav').classList.remove('open');
  renderSection(name);
}

function renderAll() {
  renderSection(state.activeSection);
}

function renderSection(name) {
  if (name === 'journal') renderJournal();
  if (name === 'roasters') renderRoasters();
  if (name === 'gear') renderGear();
  if (name === 'recipes') renderRecipes();
  if (name === 'stats') renderStats();
}

// ---- Filters ----
function populateFilters() {
  const sel = $('filterRoaster');
  const existing = Array.from(sel.options).map(o => o.value);
  state.roasters.forEach(r => {
    if (!existing.includes(r.id)) {
      const opt = document.createElement('option');
      opt.value = r.id; opt.textContent = r.name;
      sel.appendChild(opt);
    }
  });
  // Also add roasters from journal that may not be in roasters.json
  state.journal.forEach(e => {
    if (e.roasterId && !existing.includes(e.roasterId)) {
      const opt = document.createElement('option');
      opt.value = e.roasterId; opt.textContent = e.roasterName || e.roasterId;
      sel.appendChild(opt);
    }
  });
}

// ---- JOURNAL ----
function getFilteredJournal() {
  const q = state.search.toLowerCase();
  const { roaster, roastLevel, method, taste } = state.filters;
  return state.journal.filter(e => {
    if (roaster && e.roasterId !== roaster) return false;
    if (roastLevel && e.roastLevel !== roastLevel) return false;
    if (method && e.brewMethod !== method) return false;
    if (taste && !(e.tasteTags || []).some(t => t === taste)) return false;
    if (q) {
      const blob = [e.beanName, e.roasterName, e.origin, e.brewMethod, e.notes, ...(e.tasteTags || [])].join(' ').toLowerCase();
      if (!blob.includes(q)) return false;
    }
    return true;
  });
}

function renderJournal() {
  const grid = $('journalGrid');
  const entries = getFilteredJournal();
  const empty = $('journalEmpty');

  // Remove old cards, keep empty state
  Array.from(grid.children).forEach(c => {
    if (c !== empty) c.remove();
  });

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
  div.className = 'journal-card';
  div.addEventListener('click', () => openJournalModal(e));

  const scores = e.scores || { acidity: 0, body: 0, sweetness: 0, finish: 0 };

  div.innerHTML = `
    <div class="journal-card-header">
      <div>
        <div class="journal-card-bean">${highlight(e.beanName || 'Unnamed Bean', q)}</div>
        <div class="journal-card-roaster">${highlight(e.roasterName || '', q)}</div>
      </div>
      <span class="roast-badge">${e.roastLevel || 'Unknown'}</span>
    </div>
    <div class="journal-card-body">
      <div class="journal-meta">
        <span class="meta-chip">🌍 ${highlight(e.origin || '—', q)}</span>
        <span class="meta-chip">⚙️ ${e.grindClicks ? e.grindClicks + ' clicks' : e.grindLabel || '—'}</span>
        <span class="meta-chip">⚖️ ${e.dose || '—'}</span>
      </div>
      <div class="journal-scores">
        ${['acidity','body','sweetness','finish'].map(s => `
          <div class="score-item">
            <div class="score-label">${s}</div>
            <div class="score-bar-wrap"><div class="score-bar" style="width:${(scores[s]||0)*10}%"></div></div>
            <div class="score-num">${scores[s] || '—'}</div>
          </div>
        `).join('')}
      </div>
      ${e.notes ? `<div class="journal-notes">${highlight(e.notes, q)}</div>` : ''}
      <div class="journal-tags">
        ${(e.tasteTags || []).map(t => `<span class="taste-tag ${getTasteClass(t)}">${t}</span>`).join('')}
      </div>
    </div>
    <div class="journal-card-footer">
      <span class="journal-date">${formatDate(e.date)}</span>
      <span class="journal-method-badge">${e.brewMethod || '—'}</span>
    </div>
  `;
  return div;
}

function openJournalModal(e) {
  const scores = e.scores || {};
  $('modalBody').innerHTML = `
    <div style="margin-bottom:1.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">
        <h2 style="font-family:var(--font-display);font-size:1.6rem;color:var(--espresso);">${e.beanName || 'Unnamed'}</h2>
        <span class="roast-badge">${e.roastLevel || '—'}</span>
      </div>
      <p style="color:var(--text-muted);font-size:0.9rem;">${e.roasterName || ''} · ${e.origin || ''}</p>
    </div>

    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:0.75rem;margin-bottom:1.5rem;">
      ${[
        ['Brew Method', e.brewMethod],
        ['Grind Setting', e.grindClicks ? e.grindClicks + ' clicks' : e.grindLabel],
        ['Dose', e.dose],
        ['Water', e.water],
        ['Ratio', e.ratio],
        ['Total Time', e.totalTime],
        ['Water Temp', e.waterTemp],
        ['Date', formatDate(e.date)]
      ].filter(([,v]) => v).map(([l,v]) => `
        <div style="background:var(--cream-dark);border:1px solid var(--border);border-radius:8px;padding:0.6rem 0.875rem;">
          <div style="font-size:0.7rem;color:var(--text-light);text-transform:uppercase;letter-spacing:0.05em;">${l}</div>
          <div style="font-size:0.88rem;font-weight:600;color:var(--espresso);margin-top:0.15rem;font-family:var(--font-mono);">${v}</div>
        </div>
      `).join('')}
    </div>

    <div style="margin-bottom:1.25rem;">
      <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.75rem;">Scores</h4>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;">
        ${['acidity','body','sweetness','finish'].map(s => `
          <div class="score-item">
            <div class="score-label">${s}</div>
            <div class="score-bar-wrap"><div class="score-bar" style="width:${(scores[s]||0)*10}%"></div></div>
            <div class="score-num">${scores[s] || '—'}/10</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${e.notes ? `
      <div style="margin-bottom:1.25rem;">
        <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.5rem;">Tasting Notes</h4>
        <div class="recipe-notes-box">${e.notes}</div>
      </div>
    ` : ''}

    ${(e.tasteTags||[]).length ? `
      <div class="journal-tags" style="margin-bottom:1.25rem;">
        ${e.tasteTags.map(t => `<span class="taste-tag ${getTasteClass(t)}">${t}</span>`).join('')}
      </div>
    ` : ''}

    ${e.overallRating ? `
      <div style="display:flex;align-items:center;gap:0.5rem;font-size:1rem;">
        ${'★'.repeat(Math.round(e.overallRating))}${'☆'.repeat(5-Math.round(e.overallRating))}
        <span style="color:var(--text-muted);font-size:0.85rem;">${e.overallRating}/5</span>
      </div>
    ` : ''}
  `;
  $('modalOverlay').classList.add('active');
}

// ---- ROASTERS ----
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
      <p>Add a new roaster via a GitHub Issue.</p>
      <a href="https://github.com/rathialok901/coffee-fever/issues/new?template=add_roaster.yml" target="_blank" class="btn-primary">+ Add Roaster</a>
    </div>`;
    return;
  }

  filtered.forEach(r => {
    const imgSrc = ROASTER_IMAGES[r.id] || '';
    const card = document.createElement('div');
    card.className = 'roaster-card';
    card.addEventListener('click', () => openRoasterModal(r));
    card.innerHTML = `
      <div class="roaster-card-top">
        ${imgSrc
          ? `<img src="${imgSrc}" class="roaster-img" alt="${r.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="roaster-img-placeholder" style="display:none">☕</div>`
          : `<div class="roaster-img-placeholder">☕</div>`}
      </div>
      <div class="roaster-card-body">
        <div class="roaster-name">${highlight(r.name, q)}</div>
        <div class="roaster-location">📍 ${highlight(r.location, q)}</div>
        <div class="roaster-desc">${highlight(r.description, q)}</div>
        <div class="roaster-tags">
          ${(r.speciality||[]).map(s => `<span class="roaster-tag">${s}</span>`).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:0.4rem;margin-top:0.25rem;">
          <span style="font-size:0.75rem;color:var(--text-muted);">Roast levels:</span>
          ${(r.roastLevels||[]).map(l => `<span class="level-dot ${l.toLowerCase().replace('-','')}" title="${l}"></span>`).join('')}
        </div>
      </div>
      <div class="roaster-card-footer">
        <span style="font-size:0.78rem;color:var(--text-light);">Added ${formatDate(r.added)}</span>
        ${r.website ? `<a href="${r.website}" target="_blank" class="btn-secondary" onclick="event.stopPropagation()">Visit →</a>` : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

function openRoasterModal(r) {
  const journalEntries = state.journal.filter(e => e.roasterId === r.id);
  const imgSrc = ROASTER_IMAGES[r.id] || '';
  $('modalBody').innerHTML = `
    ${imgSrc ? `<img src="${imgSrc}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:1.5rem;" alt="${r.name}" />` : ''}
    <h2 style="font-family:var(--font-display);font-size:1.6rem;color:var(--espresso);margin-bottom:0.25rem;">${r.name}</h2>
    <p style="color:var(--text-muted);font-size:0.9rem;margin-bottom:1rem;">📍 ${r.location}</p>
    <p style="font-size:0.9rem;color:var(--text);line-height:1.7;margin-bottom:1.25rem;">${r.description}</p>
    <div class="roaster-tags" style="margin-bottom:1.25rem;">${(r.speciality||[]).map(s=>`<span class="roaster-tag">${s}</span>`).join('')}</div>
    ${r.website ? `<a href="${r.website}" target="_blank" class="btn-primary" style="margin-bottom:1.5rem;display:inline-flex;">Visit Website →</a>` : ''}
    ${journalEntries.length ? `
      <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.75rem;margin-top:1rem;">Your entries from this roaster (${journalEntries.length})</h4>
      ${journalEntries.map(e => `
        <div style="background:var(--cream-dark);border:1px solid var(--border);border-radius:8px;padding:0.75rem 1rem;margin-bottom:0.5rem;">
          <div style="font-weight:600;font-family:var(--font-display);">${e.beanName}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">${e.brewMethod} · ${formatDate(e.date)}</div>
        </div>
      `).join('')}
    ` : `<p style="color:var(--text-light);font-size:0.88rem;font-style:italic;">No journal entries from this roaster yet.</p>`}
  `;
  $('modalOverlay').classList.add('active');
}

// ---- GEAR ----
function renderGear() {
  const grid = $('gearGrid');
  grid.innerHTML = '';
  const q = state.search.toLowerCase();
  const filtered = state.gear.filter(g => {
    if (!q) return true;
    return [g.name, g.type, g.description, ...(g.tags||[])].join(' ').toLowerCase().includes(q);
  });

  filtered.forEach(g => {
    const imgSrc = GEAR_IMAGES[g.id] || '';
    const card = document.createElement('div');
    card.className = 'gear-card';
    card.addEventListener('click', () => openGearModal(g));
    card.innerHTML = `
      <div class="gear-img-wrap">
        ${imgSrc
          ? `<img src="${imgSrc}" class="gear-img" alt="${g.name}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="gear-img-placeholder" style="display:none">☕</div>`
          : `<div class="gear-img-placeholder">☕</div>`}
        <span class="gear-type-badge">${g.type}</span>
      </div>
      <div class="gear-card-body">
        <div class="gear-name">${highlight(g.name, q)}</div>
        <div class="gear-desc">${highlight(g.description, q)}</div>
        <div class="gear-grind">
          <span class="gear-grind-label">⚙️ Grind:</span>
          <span>${g.grind}</span>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });
}

function openGearModal(g) {
  const imgSrc = GEAR_IMAGES[g.id] || '';
  const relatedRecipes = state.recipes.filter(r => r.gear === g.id);
  $('modalBody').innerHTML = `
    ${imgSrc ? `<img src="${imgSrc}" style="width:100%;height:220px;object-fit:cover;border-radius:8px;margin-bottom:1.5rem;" alt="${g.name}" />` : ''}
    <div style="display:inline-block;background:var(--espresso);color:var(--cream);font-size:0.72rem;font-weight:600;letter-spacing:0.05em;padding:0.2rem 0.6rem;border-radius:4px;text-transform:uppercase;margin-bottom:0.75rem;">${g.type}</div>
    <h2 style="font-family:var(--font-display);font-size:1.6rem;color:var(--espresso);margin-bottom:0.75rem;">${g.name}</h2>
    <p style="font-size:0.9rem;color:var(--text);line-height:1.7;margin-bottom:1.25rem;">${g.description}</p>
    <div style="background:var(--cream-dark);border:1px solid var(--border);border-radius:8px;padding:0.75rem 1rem;margin-bottom:1.5rem;">
      <div style="font-size:0.75rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;">Recommended Grind Range</div>
      <div style="font-size:1rem;font-weight:600;color:var(--brown);margin-top:0.25rem;">${g.grind}</div>
    </div>
    ${relatedRecipes.length ? `
      <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.75rem;">Recipes for this brewer</h4>
      ${relatedRecipes.map(r => `
        <div style="background:var(--cream-dark);border:1px solid var(--border);border-radius:8px;padding:0.75rem 1rem;margin-bottom:0.5rem;cursor:pointer;" onclick="document.getElementById('modalOverlay').classList.remove('active');setTimeout(()=>{setSection('recipes');},300)">
          <div style="font-weight:600;">${r.title}</div>
          <div style="font-size:0.8rem;color:var(--text-muted);">${r.dose} · ${r.ratio} · ${r.totalTime}</div>
        </div>
      `).join('')}
    ` : ''}
  `;
  $('modalOverlay').classList.add('active');
}

// ---- RECIPES ----
function renderRecipes() {
  const list = $('recipeList');
  list.innerHTML = '';
  const q = state.search.toLowerCase();
  const filtered = state.recipes.filter(r => {
    if (state.recipeFilter && r.gear !== state.recipeFilter) return false;
    if (q && ![r.title, r.notes, ...(r.tags||[])].join(' ').toLowerCase().includes(q)) return false;
    return true;
  });

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
          <div class="recipe-info-item"><div class="recipe-info-label">Yield</div><div class="recipe-info-value">${recipe.yield}</div></div>
          <div class="recipe-info-item"><div class="recipe-info-label">Dose</div><div class="recipe-info-value">${recipe.dose}</div></div>
          <div class="recipe-info-item"><div class="recipe-info-label">Water</div><div class="recipe-info-value">${recipe.water}</div></div>
          <div class="recipe-info-item"><div class="recipe-info-label">Ratio</div><div class="recipe-info-value">${recipe.ratio}</div></div>
          <div class="recipe-info-item"><div class="recipe-info-label">Total Time</div><div class="recipe-info-value">${recipe.totalTime}</div></div>
          <div class="recipe-info-item"><div class="recipe-info-label">Grind (K-Ultra)</div><div class="recipe-info-value">${recipe.grindSize}</div></div>
        </div>
        <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:0.5rem;">Steps</h4>
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

  if (filtered.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-icon">📋</div>
      <h3>No recipes found</h3>
      <p>Try a different filter or search term.</p>
    </div>`;
  }
}

// ---- STATS ----
function renderStats() {
  const j = state.journal;
  $('statTotalCups').textContent = j.length;
  $('statRoasters').textContent = state.roasters.length;
  $('statBeans').textContent = new Set(j.map(e => e.beanName)).size;
  $('statMethods').textContent = 5; // fixed gear count

  // Methods chart
  const methods = {};
  j.forEach(e => { if (e.brewMethod) methods[e.brewMethod] = (methods[e.brewMethod] || 0) + 1; });
  renderBarChart('chartMethods', methods, j.length);

  // Taste chart
  const tastes = {};
  j.forEach(e => (e.tasteTags||[]).forEach(t => { tastes[t] = (tastes[t]||0)+1; }));
  renderBarChart('chartTastes', tastes, Math.max(...Object.values(tastes), 1));

  // Roast chart
  const roasts = {};
  j.forEach(e => { if (e.roastLevel) roasts[e.roastLevel] = (roasts[e.roastLevel]||0)+1; });
  renderBarChart('chartRoast', roasts, j.length);
}

function renderBarChart(containerId, data, max) {
  const el = $(containerId);
  el.innerHTML = '';
  if (!Object.keys(data).length) {
    el.innerHTML = '<div class="chart-empty">No data yet — start logging!</div>';
    return;
  }
  const maxVal = Math.max(...Object.values(data), 1);
  Object.entries(data).sort((a,b) => b[1]-a[1]).forEach(([label, count]) => {
    const pct = (count / maxVal) * 100;
    el.innerHTML += `
      <div class="chart-row">
        <span class="chart-label">${label}</span>
        <div class="chart-bar-wrap"><div class="chart-bar" style="width:${pct}%"></div></div>
        <span class="chart-count">${count}</span>
      </div>
    `;
  });
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

  // Nav
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

  // Filters
  ['filterRoaster','filterRoastLevel','filterMethod','filterTaste'].forEach(id => {
    $(id).addEventListener('change', (e) => {
      const key = id.replace('filter','').replace(/^./, c => c.toLowerCase());
      // map filterRoastLevel -> roastLevel etc
      const map = { filterRoaster: 'roaster', filterRoastLevel: 'roastLevel', filterMethod: 'method', filterTaste: 'taste' };
      state.filters[map[id]] = e.target.value;
      renderJournal();
    });
  });

  $('filterReset').addEventListener('click', () => {
    ['filterRoaster','filterRoastLevel','filterMethod','filterTaste'].forEach(id => $(id).value = '');
    state.filters = { roaster: '', roastLevel: '', method: '', taste: '' };
    renderJournal();
  });

  // Recipe filters
  document.querySelectorAll('.recipe-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.recipe-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.recipeFilter = btn.dataset.gear;
      renderRecipes();
    });
  });

  // Modal close
  $('modalClose').addEventListener('click', () => $('modalOverlay').classList.remove('active'));
  $('modalOverlay').addEventListener('click', (e) => {
    if (e.target === $('modalOverlay')) $('modalOverlay').classList.remove('active');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') $('modalOverlay').classList.remove('active');
  });
});
