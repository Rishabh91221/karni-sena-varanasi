/* ============================================================
   KARNI SENA VARANASI — Admin Dashboard
   Complete file — login, stats, list, detail, export, delete.
   ============================================================ */

(function () {
  'use strict';

  // ============ CONFIG ============
  const API_BASE = 'https://karni-sena-backend.smritiiasacademy.workers.dev';
  const STORAGE_KEY = 'ks_admin_auth';

  // ============ STATE ============
  let auth = null;
  let submissions = [];
  let filters = { q: '', from: '', to: '' };

  // ============ HELPERS ============
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return iso; }
  }

  function maskAadhaar(a) {
    if (!a || a.length !== 12) return a || '—';
    return 'XXXX-XXXX-' + a.slice(-4);
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  // ============ AUTH ============
  function loadAuth() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) auth = JSON.parse(raw);
    } catch (e) { auth = null; }
  }

  function saveAuth(a) {
    auth = a;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(a)); } catch (e) {}
  }

  function clearAuth() {
    auth = null;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
  }

  async function apiFetch(path, opts = {}) {
    if (!auth) throw new Error('Not authenticated');
    const headers = {
      'X-Admin-Username': auth.username,
      'X-Admin-Password': auth.password,
      ...(opts.headers || {}),
    };
    const res = await fetch(API_BASE + path, { ...opts, headers });
    if (res.status === 401) {
      clearAuth();
      showLogin();
      throw new Error('Session expired');
    }
    return res;
  }

  // ============ SCREENS ============
  function showLogin() {
    const ls = $('#login-screen');
    const db = $('#dashboard');
    if (ls) ls.style.display = 'flex';
    if (db) db.style.display = 'none';
  }

  function showDashboard() {
    const ls = $('#login-screen');
    const db = $('#dashboard');
    if (ls) ls.style.display = 'none';
    if (db) db.style.display = 'block';
    loadStats();
    loadSubmissions();
  }

  // ============ LOGIN HANDLER ============
  function setupLogin() {
    const form = $('#login-form');
    const errEl = $('#login-error');
    const btn = $('#login-btn');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      errEl.textContent = '';

      const username = $('#username').value.trim();
      const password = $('#password').value;

      if (!username || !password) {
        errEl.textContent = 'कृपया username और password भरें।';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Checking...';

      try {
        const res = await fetch(API_BASE + '/admin/stats', {
          headers: {
            'X-Admin-Username': username,
            'X-Admin-Password': password,
          },
        });

        if (!res.ok) throw new Error('Invalid credentials');

        saveAuth({ username, password });
        showDashboard();
      } catch (err) {
        errEl.textContent = 'गलत username या password। कृपया पुनः प्रयास करें।';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Log In';
      }
    });

    const logoutBtn = $('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        clearAuth();
        showLogin();
        const f = $('#login-form');
        if (f) f.reset();
      });
    }
  }

  // ============ STATS ============
  async function loadStats() {
    try {
      const res = await apiFetch('/admin/stats');
      const data = await res.json();
      if (data.success) {
        const setIf = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        setIf('#stat-total', data.stats.total);
        setIf('#stat-today', data.stats.today);
        setIf('#stat-week', data.stats.week);
        setIf('#stat-month', data.stats.month);
      }
    } catch (err) {
      console.error('Stats load failed:', err);
    }
  }

  // ============ SUBMISSIONS LIST ============
  async function loadSubmissions() {
    const statusEl = $('#table-status');
    const tableEl = $('#submissions-table');
    if (statusEl) { statusEl.textContent = 'लोड हो रहा है...'; statusEl.style.display = 'block'; }
    if (tableEl) tableEl.style.display = 'none';

    try {
      const params = new URLSearchParams();
      if (filters.q)    params.set('q', filters.q);
      if (filters.from) params.set('from', filters.from);
      if (filters.to)   params.set('to', filters.to);
      const qs = params.toString();

      const res = await apiFetch('/admin/list' + (qs ? '?' + qs : ''));
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Unknown');

      submissions = data.submissions || [];
      renderTable();
    } catch (err) {
      console.error('List failed:', err);
      if (statusEl) statusEl.textContent = 'डेटा लोड नहीं हो सका: ' + err.message;
    }
  }

  function renderTable() {
    const statusEl = $('#table-status');
    const tableEl = $('#submissions-table');
    const tbody = $('#table-body');
    if (!tbody) return;

    if (submissions.length === 0) {
      if (statusEl) { statusEl.textContent = 'कोई आवेदन नहीं मिला।'; statusEl.style.display = 'block'; }
      if (tableEl) tableEl.style.display = 'none';
      return;
    }

    tbody.innerHTML = '';
    submissions.forEach(s => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td class="cell-id">#' + s.id + '</td>' +
        '<td>' + escapeHtml(s.name) + '</td>' +
        '<td>' + escapeHtml(s.father_name) + '</td>' +
        '<td class="cell-mobile">' + escapeHtml(s.mobile) + '</td>' +
        '<td class="cell-aadhaar">' + maskAadhaar(s.aadhaar) + '</td>' +
        '<td>' + escapeHtml(s.district) + '</td>' +
        '<td>' + (s.photo_key
          ? '<img class="photo-thumb" data-key="' + escapeHtml(s.photo_key) + '" alt="" loading="lazy">'
          : '—') + '</td>' +
        '<td>' + fmtDate(s.submitted_at) + '</td>' +
        '<td><div class="row-actions">' +
          '<button class="view-btn" data-id="' + s.id + '" title="View">👁️</button>' +
          '<button class="delete-btn" data-id="' + s.id + '" data-name="' + escapeHtml(s.name) + '" title="Delete">🗑️</button>' +
        '</div></td>';

      tr.addEventListener('click', (e) => {
        if (e.target.closest('.row-actions')) return;
        openDetail(s);
      });
      tbody.appendChild(tr);
    });

    // Load photos with auth
    tbody.querySelectorAll('img.photo-thumb').forEach(img => {
      fetchPhotoInto(img, img.dataset.key);
    });

    // Delete handlers
    tbody.querySelectorAll('.delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const name = btn.dataset.name;
        if (!confirm('Delete submission #' + id + ' (' + name + ')?\nयह वापस नहीं आएगा।')) return;
        try {
          const res = await apiFetch('/admin/delete/' + id, { method: 'DELETE' });
          const data = await res.json();
          if (data.success) {
            loadSubmissions();
            loadStats();
          } else {
            alert('Delete failed: ' + (data.error || 'unknown'));
          }
        } catch (err) {
          alert('Delete failed: ' + err.message);
        }
      });
    });

    if (statusEl) statusEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'table';
  }

  async function fetchPhotoInto(imgEl, key) {
    if (!key) return;
    try {
      const res = await apiFetch('/admin/photo/' + encodeURIComponent(key));
      if (!res.ok) { imgEl.style.background = '#F5E9D0'; return; }
      const blob = await res.blob();
      imgEl.src = URL.createObjectURL(blob);
    } catch (e) {
      imgEl.style.background = '#F5E9D0';
      console.warn('Photo fetch failed:', e);
    }
  }

  // ============ DETAIL MODAL ============
  function openDetail(s) {
    const modal = $('#modal-backdrop');
    const body = $('#modal-body');
    if (!modal || !body) return;

    const photoHtml = s.photo_key
      ? '<img class="detail-photo" id="detail-photo" alt="फोटो" loading="lazy">'
      : '<p style="text-align:center;color:#888;">कोई फोटो नहीं</p>';

    body.innerHTML =
      photoHtml +
      '<dl class="detail-grid">' +
        '<dt>ID</dt><dd class="mono">#' + s.id + '</dd>' +
        '<dt>नाम</dt><dd>' + escapeHtml(s.name) + '</dd>' +
        '<dt>पिता का नाम</dt><dd>' + escapeHtml(s.father_name) + '</dd>' +
        '<dt>पता</dt><dd>' + escapeHtml(s.address) + '</dd>' +
        '<dt>जिला</dt><dd>' + escapeHtml(s.district) + '</dd>' +
        '<dt>राज्य</dt><dd>' + escapeHtml(s.state) + '</dd>' +
        '<dt>मोबाइल</dt><dd class="mono">' + escapeHtml(s.mobile) + '</dd>' +
        '<dt>आधार</dt><dd class="mono">' + maskAadhaar(s.aadhaar) + '</dd>' +
        (s.additional ? '<dt>अतिरिक्त</dt><dd>' + escapeHtml(s.additional) + '</dd>' : '') +
        '<dt>दिनांक</dt><dd>' + fmtDate(s.submitted_at) + '</dd>' +
      '</dl>';

    modal.style.display = 'flex';

    if (s.photo_key) {
      const ph = $('#detail-photo');
      if (ph) fetchPhotoInto(ph, s.photo_key);
    }
  }

  function closeModal() {
    const modal = $('#modal-backdrop');
    if (modal) modal.style.display = 'none';
  }

  // ============ EXPORT CSV ============
  function exportCsv() {
    if (!submissions.length) {
      alert('कोई डेटा नहीं है।');
      return;
    }

    const headers = ['ID', 'Name', 'Father Name', 'Address', 'District', 'State', 'Mobile', 'Aadhaar', 'Photo Key', 'Additional', 'Submitted At'];
    const rows = submissions.map(s => [
      s.id, s.name, s.father_name, s.address, s.district, s.state,
      s.mobile, s.aadhaar, s.photo_key || '', s.additional || '', s.submitted_at,
    ]);

    const esc = (v) => {
      if (v == null) return '';
      const str = String(v);
      return /[",\n\r]/.test(str) ? '"' + str.replace(/"/g, '""') + '"' : str;
    };

    const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const today = new Date().toISOString().slice(0, 10);
    a.download = 'karni-sena-submissions-' + today + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============ FILTERS & BUTTONS ============
  function setupControls() {
    const searchInput = $('#search-input');
    const dateFrom = $('#date-from');
    const dateTo = $('#date-to');
    const clearBtn = $('#clear-filters');
    const refreshBtn = $('#refresh-btn');
    const exportBtn = $('#export-btn');
    const modalClose = $('#modal-close');
    const modalBackdrop = $('#modal-backdrop');

    let debounce;
    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => {
          filters.q = searchInput.value.trim();
          loadSubmissions();
        }, 400);
      });
    }

    if (dateFrom) {
      dateFrom.addEventListener('change', () => {
        filters.from = dateFrom.value ? dateFrom.value + 'T00:00:00.000Z' : '';
        loadSubmissions();
      });
    }

    if (dateTo) {
      dateTo.addEventListener('change', () => {
        filters.to = dateTo.value ? dateTo.value + 'T23:59:59.999Z' : '';
        loadSubmissions();
      });
    }

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        filters = { q: '', from: '', to: '' };
        if (searchInput) searchInput.value = '';
        if (dateFrom) dateFrom.value = '';
        if (dateTo) dateTo.value = '';
        loadSubmissions();
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        loadStats();
        loadSubmissions();
      });
    }

    if (exportBtn) exportBtn.addEventListener('click', exportCsv);

    if (modalClose) modalClose.addEventListener('click', closeModal);

    if (modalBackdrop) {
      modalBackdrop.addEventListener('click', (e) => {
        if (e.target === modalBackdrop) closeModal();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ============ INIT ============
  document.addEventListener('DOMContentLoaded', () => {
    loadAuth();
    setupLogin();
    setupControls();

    if (auth && auth.username && auth.password) {
      // Verify stored credentials still work
      fetch(API_BASE + '/admin/stats', {
        headers: {
          'X-Admin-Username': auth.username,
          'X-Admin-Password': auth.password,
        },
      }).then(res => {
        if (res.ok) showDashboard();
        else { clearAuth(); showLogin(); }
      }).catch(() => showLogin());
    } else {
      showLogin();
    }
  });

})();
