/* =====================================================
   Goal Striver – app.js
   - Renders Step → Lecture → Problem accordion
   - Retains UI state (accordions, filters, scroll) in DB
   ===================================================== */

let allProblems = [];
let noteProblem = null;

// UI state (persisted)
let expandedSteps    = {};   // stepName -> bool (true=open)
let expandedLectures = {};   // "step|lec" -> bool
let currentFilters   = { search: '', step: '', difficulty: '', status: '', revision: '', link: '' };
let scrollY          = 0;

// Debounce timer for state saving
let saveTimer = null;

// ── DOM refs ─────────────────────────────────────────
const root       = document.getElementById('accordionRoot');
const summaryEl  = document.getElementById('summary');
const searchEl   = document.getElementById('search');
const stepSel    = document.getElementById('stepFilter');
const diffSel    = document.getElementById('difficultyFilter');
const statusSel  = document.getElementById('statusFilter');
const revSel     = document.getElementById('revisionFilter');
const linkSel    = document.getElementById('linkFilter');
const noteDialog = document.getElementById('noteDialog');
const noteTitle  = document.getElementById('noteTitle');
const noteText   = document.getElementById('noteText');

// ── SVG icons ────────────────────────────────────────
const ICONS = {
  article: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  youtube: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>`,
  note:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  gfg:     `<svg viewBox="0 0 48 48" fill="none"><text x="4" y="34" font-size="28" font-weight="bold" fill="#fff" font-family="sans-serif">G</text></svg>`,
  chevron: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>`,
  edit:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
};

// ── Helpers ───────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function diffBadge(d) {
  if (!d) return '<span class="diff-badge diff-badge--default">—</span>';
  const cl = { easy: 'easy', medium: 'medium', hard: 'hard' }[d.toLowerCase()] || 'default';
  return `<span class="diff-badge diff-badge--${cl}">${escHtml(d)}</span>`;
}

function practiceLinks(p) {
  const links = [];
  (p.tuf     || []).forEach(u => links.push(`<a class="icon-link icon-link--tuf" href="${escHtml(u)}" target="_blank" rel="noreferrer" title="TUF+">T</a>`));
  (p.naukri  || []).forEach(u => links.push(`<a class="icon-link icon-link--naukri" href="${escHtml(u)}" target="_blank" rel="noreferrer" title="Naukri">N</a>`));
  (p.leetcode|| []).forEach(u => links.push(`<a class="icon-link icon-link--leet"   href="${escHtml(u)}" target="_blank" rel="noreferrer" title="LeetCode">L</a>`));
  (p.gfg     || []).forEach(u => links.push(`<a class="icon-link icon-link--gfg"    href="${escHtml(u)}" target="_blank" rel="noreferrer" title="GFG">G</a>`));
  (p.other   || []).forEach(u => links.push(`<a class="icon-link icon-link--other"  href="${escHtml(u)}" target="_blank" rel="noreferrer" title="Other">O</a>`));
  return links.length ? `<div class="practice-links">${links.join('')}</div>` : `<span class="empty-icon">–</span>`;
}

function fillSelect(sel, values) {
  const existing = new Set([...sel.options].map(o => o.value));
  const uniqueItems = [...new Set(values.map(v => v ? String(v).trim() : "").filter(Boolean))];
  uniqueItems.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).forEach(v => {
    if (!existing.has(v)) {
      const o = document.createElement('option');
      o.value = o.textContent = v;
      sel.append(o);
    }
  });
}

// ── Filtering ─────────────────────────────────────────
function matches(p) {
  const q = currentFilters.search.trim().toLowerCase();
  if (q) {
    const hay = [p.title, p.step, p.lecture, p.difficulty, p.notes,
      ...(p.practice.naukri||[]), ...(p.practice.leetcode||[]), ...(p.practice.gfg||[])
    ].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (currentFilters.step       && p.step       !== currentFilters.step)       return false;
  if (currentFilters.difficulty && p.difficulty !== currentFilters.difficulty) return false;
  if (currentFilters.status === 'done'         && !p.done)     return false;
  if (currentFilters.status === 'pending'      &&  p.done)     return false;
  if (currentFilters.revision === 'revision'   && !p.revision) return false;
  if (currentFilters.revision === 'not-revision' && p.revision) return false;
  if (currentFilters.link) {
    const pLinks = p.practice || {};
    if (currentFilters.link === 'tuf' && (!pLinks.tuf || pLinks.tuf.length === 0)) return false;
    if (currentFilters.link === 'naukri' && (!pLinks.naukri || pLinks.naukri.length === 0)) return false;
    if (currentFilters.link === 'leetcode' && (!pLinks.leetcode || pLinks.leetcode.length === 0)) return false;
    if (currentFilters.link === 'gfg' && (!pLinks.gfg || pLinks.gfg.length === 0)) return false;
    if (currentFilters.link === 'other' && (!pLinks.other || pLinks.other.length === 0)) return false;
  }
  return true;
}

// ── State persistence ─────────────────────────────────
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveState, 800);
}

async function saveState() {
  await fetch('/api/state', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ expandedSteps, expandedLectures, filters: currentFilters, scrollY }),
  });
}

async function loadState() {
  try {
    const res = await fetch('/api/state');
    if (!res.ok) return;
    const s = await res.json();
    if (s.expandedSteps)    expandedSteps    = s.expandedSteps;
    if (s.expandedLectures) expandedLectures = s.expandedLectures;
    if (s.filters) {
      currentFilters = { ...currentFilters, ...s.filters };
      // Apply to DOM
      searchEl.value    = currentFilters.search     || '';
      stepSel.value     = currentFilters.step       || '';
      diffSel.value     = currentFilters.difficulty || '';
      statusSel.value   = currentFilters.status     || '';
      revSel.value      = currentFilters.revision   || '';
      linkSel.value     = currentFilters.link       || '';
    }
    if (s.scrollY) scrollY = s.scrollY;
  } catch {}
}

// ── API helpers ───────────────────────────────────────
async function patchProblem(id, payload) {
  const res = await fetch(`/api/problems/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// ── Render ────────────────────────────────────────────
function render() {
  const visible = allProblems.filter(matches);
  const totalDone = visible.filter(p => p.done).length;
  const revCount  = visible.filter(p => p.revision).length;

  summaryEl.innerHTML = [
    `<span class="pill">${visible.length} shown</span>`,
    `<span class="pill">✅ ${totalDone} done</span>`,
    `<span class="pill">⏳ ${visible.length - totalDone} pending</span>`,
    `<span class="pill">⭐ ${revCount} revision</span>`,
  ].join('');

  // Group: Step -> Lecture -> [problems]
  const groups = {};
  for (const p of visible) {
    if (!groups[p.step]) groups[p.step] = { lectures: {}, total: 0, done: 0 };
    const g = groups[p.step];
    
    if (p.lecture !== "___STUB___") {
      if (!g.lectures[p.lecture]) g.lectures[p.lecture] = { problems: [], total: 0, done: 0 };
      const l = g.lectures[p.lecture];
      
      if (p.title !== "___STUB___") {
        l.problems.push(p);
        l.total++;
        g.total++;
        if (p.done) { l.done++; g.done++; }
      }
    }
  }

  // Build HTML
  let html = '';
  const sortedSteps = [...new Set(visible.map(p => p.step))];

  for (const stepName of sortedSteps) {
    const step       = groups[stepName];
    const stepOpen   = expandedSteps[stepName] !== false;
    const pct        = step.total ? Math.round(step.done / step.total * 100) : 0;

    html += `<div class="step-container">
      <div class="step-header" data-step="${escHtml(stepName)}" style="--progress:${pct}%">
        <span class="step-title">${escHtml(stepName)}</span>
        <div class="step-right">
          <span class="step-count">${step.done} / ${step.total}</span>
          <button class="chevron-btn ${stepOpen ? 'open' : ''}" tabindex="-1">${ICONS.chevron}</button>
        </div>
      </div>`;

    if (stepOpen) {
      html += `<div class="lectures-wrapper">`;
      const sortedLectures = [...new Set(visible.filter(p => p.step === stepName && p.lecture !== "___STUB___").map(p => p.lecture))];
      for (const lecName of sortedLectures) {
        const lec     = step.lectures[lecName];
        const lecKey  = stepName + '|' + lecName;
        const lecOpen = expandedLectures[lecKey] !== false;
        const lecPct  = lec.total ? Math.round(lec.done / lec.total * 100) : 0;

        html += `<div class="lecture-container">
          <div class="lecture-header" data-lec="${escHtml(lecKey)}" style="--progress:${lecPct}%">
            <span class="lecture-title">${escHtml(lecName)}</span>
            <div class="lecture-right">
              <span class="lecture-count">${lec.done} / ${lec.total}</span>
              <button class="chevron-btn ${lecOpen ? 'open' : ''}" tabindex="-1">${ICONS.chevron}</button>
            </div>
          </div>
          <div class="lecture-body ${lecOpen ? 'open' : ''}">
            <table class="problem-table">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Problem</th>
                  <th>Article</th>
                  <th>YouTube</th>
                  <th>Practice</th>
                  <th>Note</th>
                  <th>Difficulty</th>
                  <th>Revision</th>
                </tr>
              </thead>
              <tbody>`;

        for (const p of lec.problems) {
          const hasNote = !!(p.notes && p.notes.trim());
          html += `<tr>
            <td><input type="checkbox" data-action="done" data-id="${escHtml(p.id)}" ${p.done ? 'checked' : ''}></td>
            <td><span class="problem-name">${p.article
              ? `<a href="${escHtml(p.article)}" target="_blank" rel="noreferrer">${escHtml(p.title)}</a>`
              : escHtml(p.title)}</span></td>
            <td>${p.article
              ? `<a class="icon-link icon-link--article" href="${escHtml(p.article)}" target="_blank" rel="noreferrer" title="Article">${ICONS.article}</a>`
              : `<span class="empty-icon">–</span>`}</td>
            <td>${p.youtube
              ? `<a class="icon-link icon-link--yt" href="${escHtml(p.youtube)}" target="_blank" rel="noreferrer" title="YouTube">${ICONS.youtube}</a>`
              : `<span class="empty-icon">–</span>`}</td>
            <td>${practiceLinks(p.practice)}</td>
            <td><button class="note-btn ${hasNote ? 'has-note' : ''}" data-action="note" data-id="${escHtml(p.id)}" title="${hasNote ? 'View note' : 'Add note'}">${ICONS.note}</button></td>
            <td>${diffBadge(p.difficulty)}</td>
            <td style="white-space: nowrap;">
              <button class="star-btn ${p.revision ? 'on' : 'off'}" data-action="revision" data-id="${escHtml(p.id)}" title="Toggle revision">★</button>
              <a class="icon-link" href="/admin/edit?title=${encodeURIComponent(p.title)}" target="_blank" title="Edit problem" style="margin-left: 8px; vertical-align: middle;">${ICONS.edit}</a>
            </td>
          </tr>`;
        }

        html += `</tbody></table></div></div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  if (!html) {
    html = `<div class="empty-state"><p>No problems match the current filters.</p></div>`;
  }

  root.innerHTML = html;
}

// ── Event delegation ──────────────────────────────────
let noteMirror = null;

document.addEventListener('DOMContentLoaded', () => {
  noteMirror = CodeMirror.fromTextArea(document.getElementById('noteText'), {
    mode: "javascript",
    theme: "dracula",
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    indentUnit: 4,
    viewportMargin: Infinity
  });
  
  document.getElementById('maximizeNoteBtn').addEventListener('click', () => {
    noteMirror.setOption("fullScreen", !noteMirror.getOption("fullScreen"));
  });
});

root.addEventListener('click', async e => {
  if (e.target.closest('a') || e.target.closest('input')) return;

  // Step header toggle (click anywhere on header row)
  const stepHdr = e.target.closest('.step-header');
  if (stepHdr && !e.target.closest('input, a, [data-action], .chevron-btn')) {
    const name = stepHdr.dataset.step;
    if (name) {
      expandedSteps[name] = expandedSteps[name] === false ? true : false;
      render();
      scheduleSave();
      return;
    }
  }

  // Lecture header toggle
  const lecHdr = e.target.closest('.lecture-header');
  if (lecHdr && !e.target.closest('input, a, [data-action], .chevron-btn')) {
    const key = lecHdr.dataset.lec;
    if (key) {
      expandedLectures[key] = expandedLectures[key] === false ? true : false;
      render();
      scheduleSave();
      return;
    }
  }

  // Chevron explicit toggle
  const chevron = e.target.closest('.chevron-btn');
  if (chevron) {
    const stepHead = e.target.closest('.step-header');
    if (stepHead) {
      const s = stepHead.dataset.step;
      expandedSteps[s] = expandedSteps[s] === false ? true : false;
      render();
      scheduleSave();
      return;
    }
    const lecHead = e.target.closest('.lecture-header');
    if (lecHead) {
      const l = lecHead.dataset.lec;
      expandedLectures[l] = expandedLectures[l] === false ? true : false;
      render();
      scheduleSave();
      return;
    }
  }

  // Note button
  const noteBtn = e.target.closest('[data-action="note"]');
  if (noteBtn) {
    noteProblem = allProblems.find(p => p.id === noteBtn.dataset.id);
    if (noteProblem) {
      document.getElementById('noteTitle').textContent = `Notes: ${noteProblem.title}`;
      noteMirror.setValue(noteProblem.notes || '');
      noteMirror.setOption("fullScreen", false);
      noteDialog.showModal();
      setTimeout(() => noteMirror.refresh(), 50);
    }
    return;
  }

  // Revision star
  const starBtn = e.target.closest('[data-action="revision"]');
  if (starBtn) {
    const prob = allProblems.find(p => p.id === starBtn.dataset.id);
    if (prob) {
      prob.revision = !prob.revision;
      await patchProblem(prob.id, { revision: prob.revision });
      render();
    }
    return;
  }
});

root.addEventListener('change', async e => {
  const cb = e.target.closest('input[type="checkbox"][data-action="done"]');
  if (cb) {
    const prob = allProblems.find(p => p.id === cb.dataset.id);
    if (prob) {
      prob.done = cb.checked;
      await patchProblem(prob.id, { done: prob.done });
      render();
    }
  }
});

// ── Note save ─────────────────────────────────────────
document.getElementById('saveNote').addEventListener('click', async () => {
  if (!noteProblem) return;
  noteProblem.notes = noteMirror ? noteMirror.getValue() : noteText.value;
  await patchProblem(noteProblem.id, { notes: noteProblem.notes });
  noteDialog.close();
  render();
});

noteDialog.addEventListener('click', (e) => {
  if (e.target === noteDialog) {
    noteDialog.close();
  }
});

// ── Filter listeners ──────────────────────────────────
function onFilterChange() {
  currentFilters.search     = searchEl.value;
  currentFilters.step       = stepSel.value;
  currentFilters.difficulty = diffSel.value;
  currentFilters.status     = statusSel.value;
  currentFilters.revision   = revSel.value;
  currentFilters.link       = linkSel.value;
  render();
  scheduleSave();
}

[searchEl, stepSel, diffSel, statusSel, revSel, linkSel].forEach(el => el.addEventListener('input', onFilterChange));

document.getElementById('resetFilters').addEventListener('click', () => {
  currentFilters = { search: '', step: '', difficulty: '', status: '', revision: '', link: '' };
  searchEl.value    = '';
  stepSel.value     = '';
  diffSel.value     = '';
  statusSel.value   = '';
  revSel.value      = '';
  linkSel.value     = '';
  render();
  scheduleSave();
});

// ── Scroll tracking ───────────────────────────────────
window.addEventListener('scroll', () => {
  scrollY = window.scrollY;
  scheduleSave();
}, { passive: true });

// ── Boot ──────────────────────────────────────────────
async function boot() {
  // 1. Load saved state first
  await loadState();

  // 2. Fetch problems
  const res = await fetch('/api/problems');
  if (!res.ok) { window.location.href = '/login'; return; }
  const data = await res.json();
  allProblems = data.problems || [];

  // 3. Populate filter dropdowns
  fillSelect(stepSel, allProblems.map(p => p.step));
  fillSelect(diffSel, allProblems.map(p => p.difficulty));

  // 4. Re-apply stored filter values to selects (after options are added)
  stepSel.value   = currentFilters.step       || '';
  diffSel.value   = currentFilters.difficulty || '';
  statusSel.value = currentFilters.status     || '';
  revSel.value    = currentFilters.revision   || '';
  linkSel.value   = currentFilters.link       || '';

  // 5. Render
  render();

  // 6. Restore scroll position
  if (scrollY > 0) {
    requestAnimationFrame(() => window.scrollTo(0, scrollY));
  }
}

boot();
