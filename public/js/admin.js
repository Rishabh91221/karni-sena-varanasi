/* ============================================================
   KARNI SENA VARANASI — Admin Dashboard
   Authentication: X-Admin-Username + X-Admin-Password
   ============================================================ */

(function () {
  'use strict';

  // ============ CONFIGURATION ============
  const API_BASE = 'https://karni-sena-backend.smritiiasacademy.workers.dev/admin';
  const STORAGE_KEY = 'ks_admin_auth';

  // ============ STATE ============
  let auth = null;
  let submissions = [];
  let filters = { q: '', from: '', to: '' };
  let searchDebounce = null;

  // ============ DOM HELPERS ============
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  function el(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = String(textContent);
    return node;
  }

  // ============ FORMATTERS ============
  function formatDate(isoStr) {
    if (!isoStr) return '—';
    try {
      const d = new Date(isoStr);
      return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (e) {
      return isoStr;
    }
  }

  function maskAadhaar(str) {
    if (!str || str.length !== 12) return str || '—';
    return 'XXXX-XXXX-' + str.slice(-4);
  }

  // ============ AUTH STORAGE ============
  function loadAuth() {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.username && parsed.password) {
        auth = parsed;
      }
    } catch (e) {
      auth = null;
    }
  }

  function saveAuth(a) {
    auth = a;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    } catch (e) {
      console.warn('Unable to save auth:', e);
    }
  }

  function clearAuth() {
    auth = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
  }

  // ============ API WRAPPER ============
  async function apiFetch(path, opts) {
    opts = opts || {};

    if (!auth || !auth.username || !auth.password) {
      throw new Error('Not authenticated');
    }

    const headers = Object.assign(
      {
        'X-Admin-Username': auth.username,
        'X-Admin-Password': auth.password,
        'Accept': 'application/json',
      },
      opts.headers || {}
    );

    const res = await fetch(API_BASE + path, Object.assign({}, opts, { headers }));

    if (res.status === 401) {
      clearAuth();
      showLogin();
      throw new Error('Session expired');
    }

    return res;
  }

  // ============ VIEW SWITCHERS ============
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

  // ============ LOGIN ============
  function setupLogin() {
    const form = $('#login-form');
    const errEl = $('#login-error');
    const btn = $('#login-btn');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (errEl) errEl.textContent = '';

      const usernameInput = $('#username');
      const passwordInput = $('#password');

      const username = usernameInput ? usernameInput.value.trim() : '';
      const password = passwordInput ? passwordInput.value : '';

      if (!username || !password) {
        if (errEl) errEl.textContent = 'कृपया username और password दर्ज करें।';
        return;
      }

      const originalText = btn ? btn.textContent : 'Log In';
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'प्रमाणित किया जा रहा है...';
      }

      try {
        const res = await fetch(API_BASE + '/stats', {
          headers: {
            'X-Admin-Username': username,
            'X-Admin-Password': password,
          },
        });

        if (!res.ok) throw new Error('Invalid credentials');

        saveAuth({ username: username, password: password });
        showDashboard();
      } catch (err) {
        if (errEl) errEl.textContent = 'अमान्य username या password। कृपया पुनः प्रयास करें।';
      } finally {
        if (btn) {
          btn.disabled = false;
          btn.textContent = originalText;
        }
      }
    });

    const logoutBtn = $('#logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        clearAuth();
        showLogin();
        const u = $('#username');
        const p = $('#password');
        if (u) u.value = '';
        if (p) p.value = '';
      });
    }
  }

  // ============ STATS ============
  async function loadStats() {
    try {
      const res = await apiFetch('/stats');
      const data = await res.json();

      if (data.success && data.stats) {
        const set = (id, v) => {
          const node = $(id);
          if (node) node.textContent = v != null ? String(v) : '0';
        };

        set('#stat-total', data.stats.total);
        set('#stat-today', data.stats.today);
        set('#stat-week',  data.stats.week);
        set('#stat-month', data.stats.month);
      }
    } catch (err) {
      console.error('loadStats error:', err);
    }
  }

  // ============ SUBMISSIONS LIST ============
  async function loadSubmissions() {
    const statusEl = $('#table-status');
    const tableEl = $('#submissions-table');

    if (statusEl) {
      statusEl.textContent = 'लोड हो रहा है...';
      statusEl.style.display = 'block';
    }
    if (tableEl) tableEl.style.display = 'none';

    try {
      const params = new URLSearchParams();
      if (filters.q)    params.set('q', filters.q);
      if (filters.from) params.set('from', filters.from);
      if (filters.to)   params.set('to', filters.to);

      const qs = params.toString();
      const res = await apiFetch('/list' + (qs ? '?' + qs : ''));
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Fetch failed');
      }

      submissions = Array.isArray(data.submissions) ? data.submissions : [];
      renderTable();
    } catch (err) {
      console.error('loadSubmissions error:', err);
      if (statusEl) {
        statusEl.textContent = 'डेटा लोड नहीं हो सका: ' + (err.message || 'Error');
      }
    }
  }

  function renderTable() {
    const statusEl = $('#table-status');
    const tableEl = $('#submissions-table');
    const tbody = $('#table-body');
    if (!tbody) return;

    if (submissions.length === 0) {
      if (statusEl) {
        statusEl.textContent = 'कोई आवेदन नहीं मिला।';
        statusEl.style.display = 'block';
      }
      if (tableEl) tableEl.style.display = 'none';
      return;
    }

    tbody.replaceChildren();

    submissions.forEach((item) => {
      const tr = document.createElement('tr');

      // ID
      tr.appendChild(el('td', 'cell-id', '#' + item.id));

      // Name
      tr.appendChild(el('td', '', item.name || '—'));

      // Father's name
      tr.appendChild(el('td', '', item.father_name || '—'));

      // Mobile
      tr.appendChild(el('td', 'cell-mobile', item.mobile || '—'));

      // Aadhaar (masked)
      tr.appendChild(el('td', 'cell-aadhaar', maskAadhaar(item.aadhaar)));

      // District
      tr.appendChild(el('td', '', item.district || '—'));

      // Photo
      const tdPhoto = document.createElement('td');
      if (item.photo_key) {
        const img = document.createElement('img');
        img.className = 'photo-thumb';
        img.alt = item.name || 'Photo';
        img.loading = 'lazy';
        img.dataset.key = item.photo_key;
        tdPhoto.appendChild(img);
        fetchPhotoInto(img, item.photo_key);
      } else {
        tdPhoto.textContent = '—';
      }
      tr.appendChild(tdPhoto);

      // Date
      tr.appendChild(el('td', '', formatDate(item.submitted_at)));

      // Actions
      const tdActions = document.createElement('td');
      const wrap = el('div', 'row-actions');

      const btnView = el('button', 'view-btn', '👁️');
      btnView.type = 'button';
      btnView.title = 'विवरण देखें';
      btnView.addEventListener('click', (e) => {
        e.stopPropagation();
        openDetailModal(item);
      });

      const btnDelete = el('button', 'delete-btn', '🗑️');
      btnDelete.type = 'button';
      btnDelete.title = 'हटाएँ';
      btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmAndDelete(item.id, item.name);
      });

      wrap.appendChild(btnView);
      wrap.appendChild(btnDelete);
      tdActions.appendChild(wrap);
      tr.appendChild(tdActions);

      tr.addEventListener('click', () => openDetailModal(item));
      tbody.appendChild(tr);
    });

    if (statusEl) statusEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'table';
  }

  // ============ PHOTO FETCHER (FIXED) ============
  // NOTE: We intentionally do NOT revoke the blob URL here.
  // Revoking on `img.onload` was breaking image rendering for
  // all but the first thumbnail. The browser cleans up blob URLs
  // automatically when the page unloads.
  async function fetchPhotoInto(imgEl, key) {
    if (!key || !imgEl) return;

    try {
      // Encode each path segment individually (preserves `/`)
      const encodedKey = key.split('/').map(encodeURIComponent).join('/');
      const res = await apiFetch('/photo/' + encodedKey);

      if (!res.ok) {
        imgEl.style.background = '#F5E9D0';
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      imgEl.src = objectUrl;

      // Do NOT revoke — see comment above.

    } catch (err) {
      imgEl.style.background = '#F5E9D0';
      console.warn('fetchPhotoInto error:', err);
    }
  }

  // ============ DELETE ============
  async function confirmAndDelete(id, name) {
    const msg =
      'क्या आप निश्चित रूप से आवेदन #' + id +
      (name ? ' (' + name + ')' : '') +
      ' को हटाना चाहते हैं?\nयह क्रिया अपरिवर्तनीय है।';

    if (!confirm(msg)) return;

    try {
      const res = await apiFetch('/delete/' + id, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        loadSubmissions();
        loadStats();
      } else {
        alert('हटाने में विफलता: ' + (data.error || 'Server error'));
      }
    } catch (err) {
      alert('त्रुटि: हटाना पूरा नहीं हो सका।');
    }
  }

  // ============ DETAIL MODAL ============
  function openDetailModal(item) {
    const modal = $('#modal-backdrop');
    const body = $('#modal-body');
    if (!modal || !body) return;

    body.replaceChildren();

    // Photo
    if (item.photo_key) {
      const img = document.createElement('img');
      img.className = 'detail-photo';
      img.alt = item.name || 'Photo';
      img.loading = 'lazy';
      body.appendChild(img);
      fetchPhotoInto(img, item.photo_key);
    } else {
      const p = el('p', '', 'कोई फोटो उपलब्ध नहीं है');
      p.style.textAlign = 'center';
      p.style.color = '#888';
      body.appendChild(p);
    }

    // Details list
    const details = [
      { label: 'संदर्भ ID',           value: '#' + item.id },
      { label: 'उम्मीदवार का नाम',    value: item.name },
      { label: 'पिता का नाम',         value: item.father_name },
      { label: 'पता',                 value: item.address },
      { label: 'जिला',                value: item.district },
      { label: 'राज्य',               value: item.state },
      { label: 'मोबाइल',              value: item.mobile },
      { label: 'आधार नंबर',           value: maskAadhaar(item.aadhaar) },
      { label: 'अतिरिक्त विवरण',      value: item.additional || 'कोई अतिरिक्त जानकारी नहीं' },
      { label: 'जमा करने की तिथि',    value: formatDate(item.submitted_at) },
    ];

    const dl = el('dl', 'detail-grid');
    details.forEach(({ label, value }) => {
      dl.appendChild(el('dt', '', label));
      dl.appendChild(el('dd', '', value));
    });

    body.appendChild(dl);

    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const modal = $('#modal-backdrop');
    if (modal) {
      modal.style.display = 'none';
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  // ============ CSV EXPORT ============
  function exportCsv() {
    if (!submissions || submissions.length === 0) {
      alert('निर्यात के लिए कोई डेटा उपलब्ध नहीं है।');
      return;
    }

    const headers = [
      'ID', 'Name', 'Father Name', 'Address', 'District', 'State',
      'Mobile', 'Aadhaar', 'Photo Key', 'Additional', 'Submitted At',
    ];

    function sanitizeField(v) {
      if (v == null) return '';
      const s = String(v);
      if (/[",\n\r]/.test(s)) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }

    const rows = submissions.map(s => [
      s.id,
      s.name,
      s.father_name,
      s.address,
      s.district,
      s.state,
      s.mobile,
      s.aadhaar,
      s.photo_key || '',
      s.additional || '',
      s.submitted_at || '',
    ]);

    const lines = [
      headers.map(sanitizeField).join(','),
      ...rows.map(r => r.map(sanitizeField).join(',')),
    ];

    const csv = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'karni_sena_submissions_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ============ CONTROLS ============
  function setupControls() {
    const searchInput = $('#search-input');
    const dateFrom = $('#date-from');
    const dateTo = $('#date-to');
    const clearBtn = $('#clear-filters');
    const refreshBtn = $('#refresh-btn');
    const exportBtn = $('#export-btn');
    const modalClose = $('#modal-close');
    const modalBackdrop = $('#modal-backdrop');

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
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
  document.addEventListener('DOMContentLoaded', async () => {
    loadAuth();
    setupLogin();
    setupControls();

    if (auth && auth.username && auth.password) {
      try {
        const res = await fetch(API_BASE + '/stats', {
          headers: {
            'X-Admin-Username': auth.username,
            'X-Admin-Password': auth.password,
          },
        });

        if (res.ok) {
          showDashboard();
        } else {
          clearAuth();
          showLogin();
        }
      } catch (err) {
        showLogin();
      }
    } else {
      showLogin();
    }
  });

})();
