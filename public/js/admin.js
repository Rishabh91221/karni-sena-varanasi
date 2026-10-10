/* ============================================================
   KARNI SENA VARANASI — Admin Panel v7.0
   Matches Worker v7.0 auth flow
   ------------------------------------------------------------
   Flow:
   1. Login (username + password [+ setup_key])
      - needs_2fa: false → setup_required → show wizard
      - needs_2fa: true  → 2FA challenge → verify → dashboard
   2. Setup wizard:
      - POST /admin/2fa/setup with Bearer(setup-token)
      - Show QR + backup codes
      - POST /admin/2fa/enable with code → full session
   3. Full session:
      - POST /admin/stepup before decrypt/delete
      - All other actions use Bearer(full-token)
   ============================================================ */

(function () {
  'use strict';

  // ============ CONFIG ============
  const API = 'https://karni-sena-backend.smritiiasacademy.workers.dev';
  const ADMIN = API + '/admin';
  const STORE_TOKEN = 'ksv_admin_token';
  const STORE_USER = 'ksv_admin_user';
  const STORE_SETUP_KEY = 'ksv_setup_key';

  // ============ STATE ============
  let auth = null;              // { token, user, scope, elevatedUntil }
  let setupKey = '';
  let pendingSetup = null;      // { secret, otpauth_url, backup_codes }
  let challengeToken = null;
  let decryptCache = {};
  let currentTab = 'dashboard';
  let membersCache = [];
  let searchDebounce = null;
  let tabsInit = false;
  let currentModal = null;

  // ============ HELPERS ============
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => r.querySelectorAll(s);

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function esc(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return iso; }
  }

  function fmtShort(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch (e) { return iso; }
  }

  function maskAadhaar(last4) {
    return last4 ? 'XXXX-XXXX-' + last4 : 'XXXX-XXXX-XXXX';
  }

  // ============ TOASTS ============
  function toast(msg, type, ms) {
    type = type || 'info';
    ms = ms || 3000;
    const c = $('#toast-container');
    if (!c) return;
    const t = el('div', 'toast toast-' + type);
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    t.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-message">${esc(msg)}</span>`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-show'));
    setTimeout(() => {
      t.classList.remove('toast-show');
      setTimeout(() => t.remove(), 300);
    }, ms);
  }

  // ============ CONFIRM DIALOG ============
  function confirmDialog({ title, message, okText, danger }) {
    return new Promise(resolve => {
      const bd = $('#confirm-backdrop');
      const bd2 = $('#confirm-body');
      const ok = $('#confirm-ok');
      const cc = $('#confirm-cancel');
      if (!bd || !bd2) return resolve(false);

      bd2.innerHTML = `<p class="confirm-message">${esc(message)}</p>`;
      ok.textContent = okText || 'Confirm';
      ok.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

      bd.style.display = 'flex';
      bd.setAttribute('aria-hidden', 'false');

      function cleanup() {
        bd.style.display = 'none';
        bd.setAttribute('aria-hidden', 'true');
        ok.removeEventListener('click', onOk);
        cc.removeEventListener('click', onCancel);
        bd.removeEventListener('click', onBd);
      }
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onBd(e) { if (e.target === bd) onCancel(); }

      ok.addEventListener('click', onOk);
      cc.addEventListener('click', onCancel);
      bd.addEventListener('click', onBd);
    });
  }

  // ============ GENERIC MODAL ============
  function openModal(title, node) {
    const bd = $('#modal-backdrop');
    const body = $('#modal-body');
    const titleEl = $('#modal-title');
    if (!bd || !body) return;

    if (titleEl) titleEl.textContent = title || '';
    body.replaceChildren();

    if (typeof node === 'string') body.innerHTML = node;
    else if (node instanceof Node) body.appendChild(node);

    bd.style.display = 'flex';
    bd.setAttribute('aria-hidden', 'false');
    currentModal = true;
  }

  function closeModal() {
    const bd = $('#modal-backdrop');
    if (bd) {
      bd.style.display = 'none';
      bd.setAttribute('aria-hidden', 'true');
    }
    currentModal = null;
  }

  // ============ SESSION ============
  function loadAuth() {
    try {
      const raw = sessionStorage.getItem(STORE_TOKEN);
      if (!raw) return;
      const p = JSON.parse(raw);
      if (p && p.token && p.user) auth = p;
    } catch (e) { auth = null; }
    try { setupKey = sessionStorage.getItem(STORE_SETUP_KEY) || ''; }
    catch (e) { setupKey = ''; }
  }

  function saveAuth(p) {
    auth = p;
    try {
      sessionStorage.setItem(STORE_TOKEN, JSON.stringify(p));
      sessionStorage.setItem(STORE_USER, p.user || '');
      if (setupKey) sessionStorage.setItem(STORE_SETUP_KEY, setupKey);
    } catch (e) { console.warn('Session save failed'); }
  }

  function clearAuth() {
    auth = null;
    try {
      sessionStorage.removeItem(STORE_TOKEN);
      sessionStorage.removeItem(STORE_USER);
    } catch (e) {}
  }

  // ============ API REQUEST ============
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (auth && auth.token) headers['Authorization'] = 'Bearer ' + auth.token;
    if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch(ADMIN + path, Object.assign({}, opts, { headers }));
    } catch (err) {
      return { ok: false, status: 0, data: { error: 'Network error' } };
    }

    let data = {};
    try {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('application/json')) data = await res.json();
      else data = { success: res.ok };
    } catch (e) { data = {}; }

    // Handle auth errors
    if (res.status === 401) {
      const code = data.code;
      if (code === 'session_expired') {
        clearAuth();
        showScreen('login-screen');
        toast('Session expired. Please log in again.', 'error');
      }
    }

    return { ok: res.ok, status: res.status, data };
  }

  // ============ SCREENS ============
  function showScreen(id) {
    ['login-screen', 'twofa-screen', 'setup-screen', 'dashboard'].forEach(sid => {
      const n = document.getElementById(sid);
      if (!n) return;
      const show = (sid === id);
      n.style.display = show ? (sid === 'dashboard' ? 'block' : 'flex') : 'none';
    });
  }

  function showError(id, msg) {
    const n = document.getElementById(id);
    if (n) n.textContent = msg;
  }

  function clearErrors() {
    ['login-error', 'twofa-error', 'setup-error'].forEach(id => {
      const n = document.getElementById(id);
      if (n) n.textContent = '';
    });
  }

  // ============ LOGIN FLOW ============
  function initLogin() {
    const form = document.getElementById('login-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        const username = $('#username').value.trim();
        const password = $('#password').value;
        const setupKeyInput = $('#setup-key');
        const enteredSetupKey = setupKeyInput ? setupKeyInput.value.trim() : '';

        if (!username || !password) {
          showError('login-error', 'Please enter username and password.');
          return;
        }

        if (enteredSetupKey) setupKey = enteredSetupKey;

        const btn = $('#login-btn');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Checking...';

        try {
          const body = { username, password };
          if (setupKey) body.setup_key = setupKey;

          const r = await api('/login', {
            method: 'POST',
            body: JSON.stringify(body),
          });

          if (!r.ok || !r.data.success) {
            showError('login-error', r.data.error || 'Login failed');

            // If setup key required, show the input
            if (r.data.code === 'setup_key_required') {
              const wrap = document.getElementById('setup-key-wrap');
              if (wrap) wrap.style.display = 'block';
              const sk = document.getElementById('setup-key');
              if (sk) sk.focus();
            }
            return;
          }

          // Success — check next step
          if (r.data.needs_2fa) {
            // 2FA challenge
            challengeToken = r.data.challenge;
            showScreen('twofa-screen');
            setTimeout(() => document.getElementById('totp-code')?.focus(), 100);
            return;
          }

          if (r.data.setup_required) {
            // Setup scope — need to run wizard
            saveAuth({
              token: r.data.token,
              user: username,
              scope: 'setup',
              elevatedUntil: 0,
            });
            await startSetupWizard();
            return;
          }

          showError('login-error', 'Unexpected response from server.');
        } finally {
          btn.disabled = false;
          btn.textContent = orig;
        }
      });
    }

    // 2FA verify form
    const twofaForm = document.getElementById('twofa-form');
    if (twofaForm) {
      twofaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        const code = $('#totp-code').value.trim().toUpperCase().replace(/\s+/g, '');
        if (!code || code.length < 6) {
          showError('twofa-error', 'Enter the 6-digit code or 10-char backup code.');
          return;
        }

        const btn = $('#twofa-btn');
        const orig = btn.textContent;
        btn.disabled = true;
        btn.textContent = 'Verifying...';

        try {
          const r = await api('/2fa/verify', {
            method: 'POST',
            body: JSON.stringify({ challenge: challengeToken, code }),
          });

          if (!r.ok || !r.data.success) {
            showError('twofa-error', r.data.error || 'Verification failed');
            return;
          }

          saveAuth({
            token: r.data.token,
            user: sessionStorage.getItem(STORE_USER) || '',
            scope: 'full',
            elevatedUntil: Math.floor(Date.now() / 1000) + 300,
          });

          // fetch session info for correct user
          const info = await api('/session');
          if (info.ok && info.data.success) {
            auth.user = info.data.user;
            auth.scope = info.data.scope;
            auth.elevatedUntil = info.data.elevated_until || 0;
            saveAuth(auth);
          }

          $('#totp-code').value = '';
          toast('Welcome back!', 'success');
          openDashboard();
        } finally {
          btn.disabled = false;
          btn.textContent = orig;
        }
      });
    }

    // Back buttons
    document.getElementById('twofa-back')?.addEventListener('click', () => {
      challengeToken = null;
      showScreen('login-screen');
      clearErrors();
    });

    document.getElementById('setup-back-btn')?.addEventListener('click', () => {
      pendingSetup = null;
      clearAuth();
      showScreen('login-screen');
      clearErrors();
    });

    // Logout buttons
    document.getElementById('logout-btn')?.addEventListener('click', () => logout(false));
    document.getElementById('logout-all-btn')?.addEventListener('click', () => logout(true));
  }

  async function logout(allDevices) {
    const ok = await confirmDialog({
      title: allDevices ? 'Log out everywhere?' : 'Log out?',
      message: allDevices ? 'This will end all active admin sessions.' : 'You will be logged out from this browser.',
      okText: allDevices ? 'Log Out All' : 'Log Out',
      danger: false,
    });
    if (!ok) return;

    try {
      await api(allDevices ? '/logout-all' : '/logout', { method: 'POST' });
    } catch (e) {}
    clearAuth();
    challengeToken = null;
    pendingSetup = null;
    showScreen('login-screen');
    toast('Logged out', 'info');
  }

  // ============ 2FA SETUP WIZARD ============
  async function startSetupWizard() {
    const qrBox = document.getElementById('qr-container');
    if (qrBox) qrBox.innerHTML = '<div class="spinner">Generating secret...</div>';

    const r = await api('/2fa/setup', { method: 'POST' });

    if (!r.ok || !r.data.success) {
      toast(r.data.error || 'Failed to start 2FA setup.', 'error');
      clearAuth();
      showScreen('login-screen');
      return;
    }

    pendingSetup = {
      secret: r.data.secret,
      otpauth_url: r.data.otpauth_url,
      backup_codes: r.data.backup_codes,
    };

    showScreen('setup-screen');
    renderQR(pendingSetup.otpauth_url);
    const sec = document.getElementById('manual-secret');
    if (sec) sec.textContent = pendingSetup.secret;

    // Wizard steps
    const step1 = document.getElementById('setup-step-1');
    const step2 = document.getElementById('setup-step-2');
    const step3 = document.getElementById('setup-step-3');
    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';

    document.getElementById('setup-continue-btn')?.addEventListener('click', function onCont() {
      if (step1) step1.style.display = 'none';
      if (step2) step2.style.display = 'block';
      setTimeout(() => document.getElementById('setup-totp-input')?.focus(), 100);
    }, { once: true });

    document.getElementById('setup-verify-btn')?.addEventListener('click', async () => {
      const code = document.getElementById('setup-totp-input').value.trim();
      if (!/^\d{6}$/.test(code)) {
        showError('setup-error', 'Enter a valid 6-digit code.');
        return;
      }

      const btn = document.getElementById('setup-verify-btn');
      const orig = btn.textContent;
      btn.disabled = true;
      btn.textContent = 'Verifying...';

      try {
        const res = await api('/2fa/enable', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });

        if (!res.ok || !res.data.success) {
          showError('setup-error', res.data.error || 'Invalid code.');
          return;
        }

        saveAuth({
          token: res.data.token,
          user: sessionStorage.getItem(STORE_USER) || '',
          scope: 'full',
          elevatedUntil: Math.floor(Date.now() / 1000) + 300,
        });

        // Fetch correct user info
        const info = await api('/session');
        if (info.ok && info.data.success) {
          auth.user = info.data.user;
          auth.scope = info.data.scope;
          auth.elevatedUntil = info.data.elevated_until || 0;
          saveAuth(auth);
        }

        if (step2) step2.style.display = 'none';
        if (step3) step3.style.display = 'block';
        renderBackupCodes(pendingSetup.backup_codes);
      } finally {
        btn.disabled = false;
        btn.textContent = orig;
      }
    });
  }

  function renderQR(otpauthUrl) {
    const box = document.getElementById('qr-container');
    if (!box) return;
    box.innerHTML = '';

    const img = document.createElement('img');
    img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=' + encodeURIComponent(otpauthUrl);
    img.alt = '2FA QR Code';
    img.width = 220;
    img.height = 220;
    img.onerror = () => { box.innerHTML = '<p style="color:#B91C1C">Failed to load QR. Use manual entry below.</p>'; };
    box.appendChild(img);

    document.getElementById('copy-secret-btn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pendingSetup.secret);
        toast('Secret copied', 'success');
      } catch (e) {
        toast('Copy failed', 'error');
      }
    }, { once: true });
  }

  function renderBackupCodes(codes) {
    const box = document.getElementById('backup-codes-list');
    if (box) {
      box.innerHTML = '';
      codes.forEach((c, i) => {
        const item = el('div', 'backup-code-item');
        item.innerHTML = `<span class="backup-code-index">${i + 1}.</span> <code class="backup-code-value">${esc(c)}</code>`;
        box.appendChild(item);
      });
    }

    document.getElementById('download-codes-btn')?.addEventListener('click', () => {
      const text = [
        'KARNI SENA VARANASI — 2FA BACKUP CODES',
        '=========================================',
        'Generated: ' + new Date().toLocaleString('en-IN'),
        '',
        'Each code can be used ONCE to log in if you lose your phone.',
        'Keep these in a safe place. They will NOT be shown again.',
        '',
        ...codes.map((c, i) => (i + 1) + '. ' + c),
        '',
        'Manual secret (for re-entry):',
        pendingSetup.secret,
      ].join('\n');

      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'karni-sena-2fa-backup-codes.txt';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Backup codes downloaded', 'success');
    }, { once: true });

    document.getElementById('setup-done-btn')?.addEventListener('click', () => {
      pendingSetup = null;
      toast('2FA enabled! Welcome to your dashboard.', 'success');
      openDashboard();
    }, { once: true });
  }

  // ============ STEP-UP ============
  async function ensureElevated() {
    if (auth && auth.elevatedUntil > Math.floor(Date.now() / 1000)) return true;

    return new Promise(resolve => {
      const wrap = document.createElement('div');
      wrap.innerHTML = `
        <p class="text-muted" style="margin-bottom:1rem">
          This action requires a fresh 2FA code for security.
        </p>
        <div class="field">
          <label for="stepup-code">2FA Code</label>
          <input type="text" id="stepup-code" placeholder="000000" maxlength="6" inputmode="numeric" class="totp-input">
        </div>
        <div class="login-error" id="stepup-error"></div>
        <div style="display:flex;gap:0.5rem;margin-top:1rem">
          <button class="btn btn-primary" id="stepup-submit" type="button">Verify</button>
          <button class="btn btn-outline" id="stepup-cancel" type="button">Cancel</button>
        </div>
      `;
      openModal('Confirm with 2FA', wrap);
      setTimeout(() => document.getElementById('stepup-code')?.focus(), 100);

      document.getElementById('stepup-cancel').addEventListener('click', () => {
        closeModal();
        resolve(false);
      });

      document.getElementById('stepup-submit').addEventListener('click', async () => {
        const code = document.getElementById('stepup-code').value.trim();
        if (!/^\d{6}$/.test(code)) {
          document.getElementById('stepup-error').textContent = 'Enter a valid 6-digit code.';
          return;
        }
        const btn = document.getElementById('stepup-submit');
        btn.disabled = true;
        btn.textContent = 'Verifying...';

        const r = await api('/stepup', { method: 'POST', body: JSON.stringify({ code }) });
        if (r.ok && r.data.success) {
          auth.elevatedUntil = r.data.elevated_until || Math.floor(Date.now() / 1000) + 300;
          saveAuth(auth);
          closeModal();
          toast('Verified for 5 minutes', 'success');
          resolve(true);
        } else {
          document.getElementById('stepup-error').textContent = r.data.error || 'Invalid code.';
          btn.disabled = false;
          btn.textContent = 'Verify';
        }
      });
    });
  }

  // ============ DASHBOARD ============
  function openDashboard() {
    showScreen('dashboard');
    initTabs();
    switchTab('dashboard');
    loadStats();
    loadActivity();
    check2FA();
  }

  function initTabs() {
    if (tabsInit) return;
    tabsInit = true;

    $$('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // Members toolbar
    document.getElementById('members-refresh')?.addEventListener('click', loadMembers);
    document.getElementById('member-search')?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadMembers, 300);
    });
    document.getElementById('member-status-filter')?.addEventListener('change', loadMembers);
    document.getElementById('members-export')?.addEventListener('click', exportCsv);

    // Modal close
    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && currentModal) closeModal();
    });

    // Placeholder buttons for add
    ['gallery-add-btn', 'slider-add-btn', 'events-add-btn',
     'news-add-btn', 'ads-add-btn', 'team-add-btn'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => {
        toast('Add feature coming in the next update', 'info');
      });
    });
  }

  function switchTab(name) {
    currentTab = name;
    $$('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));

    if (name === 'members') loadMembers();
    if (name === 'gallery') loadGallery();
    if (name === 'slider') loadSlider();
    if (name === 'events') loadEvents();
    if (name === 'news') loadNews();
    if (name === 'ads') loadAds();
    if (name === 'team') loadTeam();
    if (name === 'content') loadContent();
    if (name === 'settings') check2FA();
  }

  // ============ STATS ============
  function animateCount(node, target) {
    const start = parseInt(node.textContent) || 0;
    if (start === target) { node.textContent = String(target); return; }
    const dur = 500, st = performance.now();
    function tick(now) {
      const p = Math.min((now - st) / dur, 1);
      node.textContent = String(Math.round(start + (target - start) * p));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  async function loadStats() {
    const r = await api('/stats');
    if (!r.ok || !r.data.success) return;
    const s = r.data.stats || {};
    document.querySelectorAll('[data-stat]').forEach(node => {
      const k = node.dataset.stat;
      if (s[k] !== undefined) animateCount(node, s[k]);
    });
  }

  async function loadActivity() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;
    const r = await api('/activity?limit=15');
    if (!r.ok || !r.data.success) return;

    const icons = {
      upload: '📤', delete: '🗑️', add: '➕', update: '✏️',
      status_change: '🔄', edit: '📝', notes_update: '📓',
      generate_card: '🎫', decrypt_aadhaar: '🔓',
      login: '🔑', logout: '🚪', logout_all: '🚪',
      '2fa_enable': '🔐', '2fa_disable': '🔓', '2fa_backup_regen': '🔑',
    };

    const actions = r.data.actions || [];
    if (actions.length === 0) {
      feed.innerHTML = '<p class="text-muted">No recent activity.</p>';
      return;
    }

    feed.innerHTML = actions.map(a => `
      <div class="activity-item">
        <span class="activity-icon">${icons[a.action] || '•'}</span>
        <div class="activity-content">
          <div class="activity-text">
            <strong>${esc(a.action)}</strong>
            ${a.entity_type ? ' · ' + esc(a.entity_type) : ''}
            ${a.entity_id ? ' #' + esc(a.entity_id) : ''}
          </div>
          <div class="activity-time">${fmtDate(a.timestamp)}</div>
        </div>
      </div>
    `).join('');
  }

  // ============ MEMBERS ============
  async function loadMembers() {
    const statusEl = document.getElementById('members-status');
    const tableEl = document.getElementById('members-table');
    const tbody = document.getElementById('members-tbody');

    if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Loading...'; }
    if (tableEl) tableEl.style.display = 'none';

    const status = document.getElementById('member-status-filter')?.value || '';
    const q = document.getElementById('member-search')?.value.trim() || '';
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (q) params.set('q', q);

    const r = await api('/list?' + params.toString());
    if (!r.ok || !r.data.success) {
      if (statusEl) statusEl.textContent = r.data.error || 'Failed to load.';
      return;
    }

    membersCache = r.data.submissions || [];

    if (statusEl) statusEl.style.display = 'none';
    if (tableEl) tableEl.style.display = 'table';

    if (membersCache.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center">No members found.</td></tr>';
      return;
    }

    tbody.replaceChildren();
    membersCache.forEach(m => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="cell-id">#${esc(m.id)}</td>
        <td class="cell-mono">${esc(m.member_id || '—')}</td>
        <td>
          <strong>${esc(m.name || '—')}</strong><br>
          <small>${esc(m.father_name || '')}</small>
        </td>
        <td class="cell-mono">${esc(m.mobile || '—')}</td>
        <td class="cell-mono">${maskAadhaar(m.aadhaar_last4)}</td>
        <td class="cell-photo"></td>
        <td><span class="status-badge status-${esc(m.status || 'pending')}">${esc(m.status || 'pending')}</span></td>
        <td>${fmtShort(m.submitted_at)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-small btn-outline view-btn" type="button">View</button>
            <button class="btn btn-small btn-danger delete-btn" type="button">Delete</button>
          </div>
        </td>
      `;

      if (m.photo_key) {
        const img = document.createElement('img');
        img.className = 'photo-thumb';
        img.alt = '';
        img.loading = 'lazy';
        tr.querySelector('.cell-photo').appendChild(img);
        fetchPhoto(img, m.photo_key);
      } else {
        tr.querySelector('.cell-photo').textContent = '—';
      }

      tr.querySelector('.view-btn').addEventListener('click', e => { e.stopPropagation(); openMember(m); });
      tr.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); deleteMember(m.id, m.name); });
      tr.addEventListener('click', () => openMember(m));

      tbody.appendChild(tr);
    });
  }

  function openMember(m) {
    const wrap = document.createElement('div');

    if (m.photo_key) {
      const img = document.createElement('img');
      img.className = 'detail-photo';
      img.alt = m.name || '';
      wrap.appendChild(img);
      setTimeout(() => fetchPhoto(img, m.photo_key), 0);
    }

    const dl = el('dl', 'detail-grid');
    [
      ['Member ID', m.member_id || '—'],
      ['Name', m.name || '—'],
      ['Father\'s Name', m.father_name || '—'],
      ['Address', m.address || '—'],
      ['District', m.district || '—'],
      ['State', m.state || '—'],
      ['Mobile', m.mobile || '—'],
      ['Aadhaar', maskAadhaar(m.aadhaar_last4)],
      ['Additional', m.additional || '—'],
      ['Notes', m.notes || '—'],
      ['Status', m.status || 'pending'],
      ['Submitted', fmtDate(m.submitted_at)],
    ].forEach(([k, v]) => {
      dl.appendChild(el('dt', '', k));
      dl.appendChild(el('dd', '', v));
    });
    wrap.appendChild(dl);

    const actions = el('div', 'modal-actions');

    if (m.status !== 'active') {
      const b = el('button', 'btn btn-primary btn-small', '✅ Approve');
      b.addEventListener('click', () => setStatus(m.id, 'active'));
      actions.appendChild(b);
    }
    if (m.status !== 'rejected') {
      const b = el('button', 'btn btn-outline btn-small', '❌ Reject');
      b.addEventListener('click', () => setStatus(m.id, 'rejected'));
      actions.appendChild(b);
    }
    const db = el('button', 'btn btn-outline btn-small', '🔓 View Aadhaar');
    db.addEventListener('click', () => decryptAadhaar(m.id));
    actions.appendChild(db);

    const del = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
    del.addEventListener('click', () => deleteMember(m.id, m.name));
    actions.appendChild(del);

    wrap.appendChild(actions);
    openModal('Member Details', wrap);
  }

  async function setStatus(id, status) {
    let reason = '';
    if (status === 'rejected') {
      reason = prompt('Reason for rejection (optional):') || '';
    }

    const r = await api('/member/' + id + '/status', {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });

    if (r.ok && r.data.success) {
      toast('Status: ' + status, 'success');
      closeModal();
      loadMembers();
      loadStats();
      loadActivity();
    } else {
      toast(r.data.error || 'Failed', 'error');
    }
  }

  async function decryptAadhaar(id) {
    const ok = await confirmDialog({
      title: 'View Aadhaar?',
      message: 'This action will be logged and requires fresh 2FA.',
      okText: 'Continue',
      danger: false,
    });
    if (!ok) return;

    if (!(await ensureElevated())) return;

    const r = await api('/member/' + id + '/decrypt-aadhaar', { method: 'POST' });
    if (r.ok && r.data.success) {
      openModal('Full Aadhaar', `<p class="aadhaar-reveal">${esc(r.data.aadhaar)}</p><p class="text-muted">This access has been logged.</p>`);
    } else {
      toast(r.data.error || 'Failed', 'error');
    }
  }

  async function deleteMember(id, name) {
    const ok = await confirmDialog({
      title: 'Delete member?',
      message: `Delete "${name || 'member'}"? This cannot be undone.`,
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    if (!(await ensureElevated())) return;

    const r = await api('/delete/' + id, { method: 'DELETE' });
    if (r.ok && r.data.success) {
      toast('Member deleted', 'success');
      closeModal();
      loadMembers();
      loadStats();
      loadActivity();
    } else {
      toast(r.data.error || 'Failed', 'error');
    }
  }

  async function fetchPhoto(img, key) {
    try {
      const enc = key.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(ADMIN + '/photo/' + enc, {
        headers: { 'Authorization': 'Bearer ' + (auth ? auth.token : '') },
      });
      if (!res.ok) { img.style.background = '#F5E9D0'; return; }
      const blob = await res.blob();
      img.src = URL.createObjectURL(blob);
    } catch (e) { img.style.background = '#F5E9D0'; }
  }

  // ============ COLLECTIONS (generic) ============
  async function loadCollection(path, key, containerId, renderer, folder) {
    const box = document.getElementById(containerId);
    if (!box) return;

    const r = await api(path);
    if (!r.ok || !r.data.success) {
      box.innerHTML = '<div class="collection-empty"><p>Failed to load.</p></div>';
      return;
    }

    const items = r.data[key] || [];
    if (items.length === 0) {
      box.innerHTML = `<div class="collection-empty"><div class="collection-empty-icon">📭</div><p>Nothing here yet.</p></div>`;
      return;
    }

    box.innerHTML = '';
    items.forEach(it => box.appendChild(renderer(it, folder)));
  }

  function renderGalleryCard(p) {
    const card = el('div', 'collection-card');
    const wrap = el('div', 'collection-image');
    const img = document.createElement('img');
    img.alt = p.caption || '';
    img.loading = 'lazy';
    wrap.appendChild(img);
    card.appendChild(wrap);
    if (p.caption) card.appendChild(el('p', 'collection-caption', p.caption));

    const del = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
    del.addEventListener('click', () => deleteEntity('gallery', p.id));
    card.appendChild(del);

    setTimeout(() => fetchPhoto(img, p.photo_key), 0);
    return card;
  }

  function renderSliderCard(s) {
    const card = el('div', 'collection-card');
    const wrap = el('div', 'collection-image');
    const img = document.createElement('img');
    img.alt = s.title || '';
    wrap.appendChild(img);
    card.appendChild(wrap);

    const info = el('div', 'collection-info');
    if (s.title) info.appendChild(el('strong', '', s.title));
    if (s.subtitle) info.appendChild(el('p', 'collection-caption', s.subtitle));
    card.appendChild(info);

    const del = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
    del.addEventListener('click', () => deleteEntity('slider', s.id));
    card.appendChild(del);

    setTimeout(() => fetchPhoto(img, s.photo_key), 0);
    return card;
  }

  function renderRow(items) {
    return function (it) {
      const row = el('div', 'collection-row');
      const info = el('div', 'collection-row-info');

      const first = items.titleKey ? it[items.titleKey] : 'Untitled';
      info.appendChild(el('strong', '', first));

      const meta = [];
      if (items.dateKey && it[items.dateKey]) meta.push(fmtShort(it[items.dateKey]));
      if (items.venueKey && it[items.venueKey]) meta.push(it[items.venueKey]);
      if (items.positionKey && it[items.positionKey]) meta.push('Position: ' + it[items.positionKey]);
      if (meta.length) info.appendChild(el('div', 'collection-meta', meta.join(' · ')));

      const textKey = items.textKey || 'description';
      if (it[textKey]) info.appendChild(el('p', 'collection-desc', String(it[textKey]).slice(0, 200)));

      row.appendChild(info);

      const actions = el('div', 'collection-row-actions');
      const del = el('button', 'btn btn-danger btn-small', '🗑️');
      del.addEventListener('click', () => deleteEntity(items.entity, it.id));
      actions.appendChild(del);
      row.appendChild(actions);

      return row;
    };
  }

  async function deleteEntity(type, id) {
    const ok = await confirmDialog({
      title: 'Delete item?',
      message: 'This cannot be undone.',
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const r = await api('/' + type + '/' + id + '/delete', { method: 'DELETE' });
    if (r.ok && r.data.success) {
      toast('Deleted', 'success');
      if (type === 'gallery') loadGallery();
      if (type === 'slider') loadSlider();
      if (type === 'events') loadEvents();
      if (type === 'news') loadNews();
      if (type === 'ads') loadAds();
      if (type === 'team') loadTeam();
      loadActivity();
    } else {
      toast(r.data.error || 'Delete failed', 'error');
    }
  }

  function loadGallery() { loadCollection('/gallery', 'photos', 'gallery-grid', renderGalleryCard); }
  function loadSlider()  { loadCollection('/slider', 'slides', 'slider-grid', renderSliderCard); }
  function loadEvents()  {
    const renderer = renderRow({ titleKey: 'title', dateKey: 'event_date', venueKey: 'venue', textKey: 'description', entity: 'events' });
    loadCollection('/events', 'events', 'events-list', renderer);
  }
  function loadNews() {
    const renderer = renderRow({ titleKey: 'headline', dateKey: 'news_date', textKey: 'content', entity: 'news' });
    loadCollection('/news', 'news', 'news-list', renderer);
  }
  function loadAds() {
    const renderer = renderRow({ titleKey: 'title', positionKey: 'position', textKey: 'content', entity: 'ads' });
    loadCollection('/ads', 'ads', 'ads-list', renderer);
  }
  function loadTeam() {
    const box = document.getElementById('team-grid');
    if (!box) return;
    api('/team').then(r => {
      if (!r.ok || !r.data.success) { box.innerHTML = '<div class="collection-empty"><p>Failed.</p></div>'; return; }
      const members = r.data.members || [];
      if (!members.length) {
        box.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">👑</div><p>No team members.</p></div>';
        return;
      }
      box.innerHTML = '';
      members.forEach(t => {
        const card = el('div', 'collection-card team-card-admin');
        const iw = el('div', 'collection-image');
        if (t.photo_key) {
          const img = document.createElement('img');
          img.alt = t.name || '';
          iw.appendChild(img);
          setTimeout(() => fetchPhoto(img, t.photo_key), 0);
        } else {
          iw.innerHTML = '<div class="photo-placeholder">👤</div>';
        }
        card.appendChild(iw);

        const info = el('div', 'collection-info');
        info.appendChild(el('strong', '', t.name || 'Unnamed'));
        if (t.role) info.appendChild(el('p', 'collection-caption', t.role));
        if (t.bio) info.appendChild(el('p', 'collection-desc', t.bio));
        card.appendChild(info);

        const del = el('button', 'btn btn-danger btn-small', '🗑️');
        del.addEventListener('click', () => deleteEntity('team', t.id));
        card.appendChild(del);
        box.appendChild(card);
      });
    });
  }

  // ============ CONTENT ============
  async function loadContent() {
    const editor = document.getElementById('content-editor');
    if (!editor) return;

    const r = await api('/content');
    if (!r.ok || !r.data.success) {
      editor.innerHTML = '<p class="text-muted">Failed to load content.</p>';
      return;
    }

    const c = r.data.content || {};
    editor.innerHTML = `
      <div class="content-field">
        <label>Organization Name</label>
        <input type="text" id="c-org-name" value="${esc(c.org && c.org.name || '')}">
      </div>
      <div class="content-field">
        <label>Top Bar Text</label>
        <input type="text" id="c-org-topbar" value="${esc(c.org && c.org.topbar || '')}">
      </div>
      <div class="content-field">
        <label>About Description</label>
        <textarea id="c-about-desc" rows="4">${esc(c.about && c.about.description || '')}</textarea>
      </div>
      <div class="content-actions">
        <button class="btn btn-primary" id="content-save-btn" type="button">💾 Save Changes</button>
      </div>
    `;

    document.getElementById('content-save-btn').addEventListener('click', saveContent);
  }

  async function saveContent() {
    const r0 = await api('/content');
    if (!r0.ok || !r0.data.success) { toast('Cannot save', 'error'); return; }

    const c = JSON.parse(JSON.stringify(r0.data.content || {}));
    c.org = c.org || {};
    c.about = c.about || {};

    c.org.name = document.getElementById('c-org-name').value.trim();
    c.org.topbar = document.getElementById('c-org-topbar').value.trim();
    c.about.description = document.getElementById('c-about-desc').value.trim();

    const r = await api('/content/update', { method: 'POST', body: JSON.stringify({ content: c }) });
    if (r.ok && r.data.success) {
      toast('Content saved', 'success');
      loadActivity();
    } else {
      toast(r.data.error || 'Save failed', 'error');
    }
  }

  // ============ 2FA STATUS ============
  async function check2FA() {
    const el = document.getElementById('2fa-status-text');
    if (!el) return;
    const r = await api('/2fa/status');
    if (r.ok && r.data.success) {
      el.textContent = r.data.enabled ? '2FA is enabled ✅' : '2FA is disabled ⚠️';
    }
  }

  // ============ CSV EXPORT ============
  function exportCsv() {
    if (!membersCache.length) { toast('No data to export', 'info'); return; }

    const headers = ['ID', 'Member ID', 'Name', 'Father', 'Address', 'District', 'State', 'Mobile', 'Aadhaar Last 4', 'Status', 'Submitted'];
    const rows = membersCache.map(m => [
      m.id, m.member_id || '', m.name || '', m.father_name || '', m.address || '',
      m.district || '', m.state || '', m.mobile || '', m.aadhaar_last4 || '',
      m.status || '', m.submitted_at || '',
    ]);
    const esc = v => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'karni-sena-members-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('CSV downloaded', 'success');
  }

  // ============ INIT ============
  document.addEventListener('DOMContentLoaded', async () => {
    loadAuth();
    initLogin();

    if (auth && auth.token && auth.scope === 'full') {
      // Verify session still valid
      const r = await api('/session');
      if (r.ok && r.data.success && r.data.scope === 'full') {
        auth.user = r.data.user;
        auth.scope = r.data.scope;
        auth.elevatedUntil = r.data.elevated_until || 0;
        saveAuth(auth);
        openDashboard();
        return;
      }
      clearAuth();
    } else if (auth && auth.scope === 'setup') {
      // Resume setup
      await startSetupWizard();
      return;
    }

    showScreen('login-screen');
  });

})();
