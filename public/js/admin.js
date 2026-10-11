/* ============================================================
   KARNI SENA VARANASI — Admin Panel v7.1
   Full CMS + Card Link + Member Management
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
  let auth = null;
  let setupKey = '';
  let pendingSetup = null;
  let challengeToken = null;
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

  function todayISO() { return new Date().toISOString().slice(0, 10); }

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

  // ============ MODAL ============
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

  // ============ API ============
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

  // ============ LOGIN ============
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
            if (r.data.code === 'setup_key_required') {
              const wrap = document.getElementById('setup-key-wrap');
              if (wrap) wrap.style.display = 'block';
              const sk = document.getElementById('setup-key');
              if (sk) sk.focus();
            }
            return;
          }

          if (r.data.needs_2fa) {
            challengeToken = r.data.challenge;
            showScreen('twofa-screen');
            setTimeout(() => document.getElementById('totp-code')?.focus(), 100);
            return;
          }

          if (r.data.setup_required) {
            saveAuth({ token: r.data.token, user: username, scope: 'setup', elevatedUntil: 0 });
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

    try { await api(allDevices ? '/logout-all' : '/logout', { method: 'POST' }); } catch (e) {}
    clearAuth();
    challengeToken = null;
    pendingSetup = null;
    showScreen('login-screen');
    toast('Logged out', 'info');
  }

  // ============ 2FA WIZARD ============
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
        <p class="text-muted" style="margin-bottom:1rem">This action requires a fresh 2FA code for security.</p>
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

    document.getElementById('members-refresh')?.addEventListener('click', loadMembers);
    document.getElementById('member-search')?.addEventListener('input', () => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(loadMembers, 300);
    });
    document.getElementById('member-status-filter')?.addEventListener('change', loadMembers);
    document.getElementById('members-export')?.addEventListener('click', exportCsv);

    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', e => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && currentModal) closeModal();
    });

    document.getElementById('slider-add-btn')?.addEventListener('click', () => openSliderForm());
    document.getElementById('gallery-add-btn')?.addEventListener('click', () => openGalleryForm());
    document.getElementById('events-add-btn')?.addEventListener('click', () => openEventForm());
    document.getElementById('news-add-btn')?.addEventListener('click', () => openNewsForm());
    document.getElementById('ads-add-btn')?.addEventListener('click', () => openAdsForm());
    document.getElementById('team-add-btn')?.addEventListener('click', () => openTeamForm());
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
      generate_card: '🎫', card_link: '🔗', decrypt_aadhaar: '🔓',
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
        <td><strong>${esc(m.name || '—')}</strong><br><small>${esc(m.father_name || '')}</small></td>
        <td class="cell-mono">${esc(m.mobile || '—')}</td>
        <td class="cell-mono">${maskAadhaar(m.aadhaar_last4)}</td>
        <td class="cell-photo"></td>
        <td><span class="status-badge status-${esc(m.status || 'pending')}">${esc(m.status || 'pending')}</span></td>
        <td>${fmtShort(m.submitted_at)}</td>
        <td>
          <div class="row-actions">
            <button class="btn btn-small btn-outline view-btn" type="button">View</button>
            <button class="btn btn-small btn-outline card-btn" type="button" title="Card link">🔗</button>
            <button class="btn btn-small btn-danger delete-btn" type="button">🗑️</button>
          </div>
        </td>
      `;

      if (m.photo_key) {
        const img = document.createElement('img');
        img.className = 'photo-thumb';
        img.loading = 'lazy';
        tr.querySelector('.cell-photo').appendChild(img);
        fetchPhoto(img, m.photo_key);
      } else {
        tr.querySelector('.cell-photo').textContent = '—';
      }

      tr.querySelector('.view-btn').addEventListener('click', e => { e.stopPropagation(); openMember(m); });
      tr.querySelector('.card-btn').addEventListener('click', e => { e.stopPropagation(); openCardLink(m.id); });
      tr.querySelector('.delete-btn').addEventListener('click', e => { e.stopPropagation(); deleteMember(m.id, m.name); });
      tr.addEventListener('click', () => openMember(m));

      tbody.appendChild(tr);
    });
  }

  // ============ CARD LINK ============
  async function openCardLink(memberId) {
    const r = await api('/member/' + memberId + '/card-link', { method: 'POST' });

    if (!r.ok || !r.data.success) {
      toast(r.data.error || 'Failed to get card link', 'error');
      return;
    }

    const cardUrl = r.data.card_url;
    const memberIdStr = r.data.member_id;
    const status = r.data.status;

    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="card-link-info">
        <div class="card-link-row"><small>Member ID</small><strong>${esc(memberIdStr)}</strong></div>
        <div class="card-link-row"><small>Status</small><span class="status-badge status-${esc(status)}">${esc(status)}</span></div>
      </div>
      <div class="card-link-url-box">
        <label>Private Card Link</label>
        <div class="copy-field">
          <input type="text" id="card-link-url" value="${esc(cardUrl)}" readonly>
          <button type="button" class="copy-btn" id="card-link-copy">📋 Copy</button>
        </div>
      </div>
      <p class="text-muted" style="margin-top:1rem;font-size:0.85rem;line-height:1.6">
        🔒 This link is unique to the member. Share only with them. It cannot be guessed.
      </p>
      <div class="modal-actions">
        <a href="${esc(cardUrl)}" target="_blank" rel="noopener" class="btn btn-primary btn-small">🔗 Open Card</a>
        <button type="button" class="btn btn-outline btn-small" id="card-link-wa">📱 WhatsApp</button>
      </div>
    `;

    openModal('Card Link', wrap);

    document.getElementById('card-link-copy').addEventListener('click', async function () {
      try {
        const input = document.getElementById('card-link-url');
        input.select();
        input.setSelectionRange(0, 99999);
        await navigator.clipboard.writeText(cardUrl);
        this.textContent = '✅ Copied';
        toast('Card link copied', 'success');
        setTimeout(() => { this.textContent = '📋 Copy'; }, 2000);
      } catch (e) { toast('Copy failed', 'error'); }
    });

    document.getElementById('card-link-wa')?.addEventListener('click', () => {
      const msg = encodeURIComponent('Your Karni Sena Varanasi membership card:\n' + cardUrl);
      window.open('https://wa.me/?text=' + msg, '_blank');
    });
  }

  function openMember(m) {
    const wrap = document.createElement('div');

    if (m.photo_key) {
      const img = document.createElement('img');
      img.className = 'detail-photo';
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

    const cardBtn = el('button', 'btn btn-primary btn-small', '🔗 Card Link');
    cardBtn.addEventListener('click', () => { closeModal(); openCardLink(m.id); });
    actions.appendChild(cardBtn);

    if (m.status !== 'active') {
      const b = el('button', 'btn btn-outline btn-small', '✅ Approve');
      b.addEventListener('click', () => setStatus(m.id, 'active'));
      actions.appendChild(b);
    }
    if (m.status !== 'rejected') {
      const b = el('button', 'btn btn-outline btn-small', '❌ Reject');
      b.addEventListener('click', () => setStatus(m.id, 'rejected'));
      actions.appendChild(b);
    }

    const editBtn = el('button', 'btn btn-outline btn-small', '✏️ Edit');
    editBtn.addEventListener('click', () => { closeModal(); openMemberEdit(m); });
    actions.appendChild(editBtn);

    const notesBtn = el('button', 'btn btn-outline btn-small', '📓 Notes');
    notesBtn.addEventListener('click', () => { closeModal(); openMemberNotes(m); });
    actions.appendChild(notesBtn);

    const db = el('button', 'btn btn-outline btn-small', '🔓 Aadhaar');
    db.addEventListener('click', () => decryptAadhaar(m.id));
    actions.appendChild(db);

    const del = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
    del.addEventListener('click', () => deleteMember(m.id, m.name));
    actions.appendChild(del);

    wrap.appendChild(actions);
    openModal('Member Details', wrap);
  }

  // ============ MEMBER EDIT / NOTES ============
  function openMemberEdit(m) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-row">
        <div class="form-field"><label>Name *</label><input type="text" id="edit-name" value="${esc(m.name || '')}" maxlength="100"></div>
        <div class="form-field"><label>Father's Name *</label><input type="text" id="edit-father" value="${esc(m.father_name || '')}" maxlength="100"></div>
      </div>
      <div class="form-field"><label>Address *</label><textarea id="edit-address" rows="2" maxlength="300">${esc(m.address || '')}</textarea></div>
      <div class="form-row">
        <div class="form-field"><label>District *</label><input type="text" id="edit-district" value="${esc(m.district || '')}" maxlength="100"></div>
        <div class="form-field"><label>State *</label><input type="text" id="edit-state" value="${esc(m.state || '')}" maxlength="100"></div>
      </div>
      <div class="form-row">
        <div class="form-field"><label>Mobile *</label><input type="tel" id="edit-mobile" value="${esc(m.mobile || '')}" maxlength="10"></div>
        <div class="form-field"><label>Aadhaar (leave blank to keep)</label><input type="tel" id="edit-aadhaar" placeholder="12 digits" maxlength="12"></div>
      </div>
      <div class="form-field"><label>Additional Info</label><textarea id="edit-additional" rows="2" maxlength="500">${esc(m.additional || '')}</textarea></div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary btn-small" id="edit-save">💾 Save</button>
        <button type="button" class="btn btn-outline btn-small" id="edit-cancel">Cancel</button>
      </div>
    `;
    openModal('Edit Member', wrap);

    document.getElementById('edit-cancel').addEventListener('click', () => { closeModal(); openMember(m); });
    document.getElementById('edit-save').addEventListener('click', async () => {
      const payload = {
        name: document.getElementById('edit-name').value.trim(),
        father_name: document.getElementById('edit-father').value.trim(),
        address: document.getElementById('edit-address').value.trim(),
        district: document.getElementById('edit-district').value.trim(),
        state: document.getElementById('edit-state').value.trim(),
        mobile: document.getElementById('edit-mobile').value.trim(),
        additional: document.getElementById('edit-additional').value.trim(),
      };
      const aadhaar = document.getElementById('edit-aadhaar').value.trim();
      if (aadhaar) payload.aadhaar = aadhaar;

      const r = await api('/member/' + m.id + '/edit', { method: 'PATCH', body: JSON.stringify(payload) });
      if (r.ok && r.data.success) {
        toast('Member updated', 'success');
        closeModal(); loadMembers(); loadActivity();
      } else { toast(r.data.error || 'Update failed', 'error'); }
    });
  }

  function openMemberNotes(m) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="form-field">
        <label>Internal Notes</label>
        <textarea id="notes-text" rows="6" maxlength="2000">${esc(m.notes || '')}</textarea>
        <small class="hint">Only visible to admins.</small>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-primary btn-small" id="notes-save">💾 Save</button>
        <button type="button" class="btn btn-outline btn-small" id="notes-cancel">Cancel</button>
      </div>
    `;
    openModal('Member Notes', wrap);

    document.getElementById('notes-cancel').addEventListener('click', () => { closeModal(); openMember(m); });
    document.getElementById('notes-save').addEventListener('click', async () => {
      const notes = document.getElementById('notes-text').value.trim();
      const r = await api('/member/' + m.id + '/notes', { method: 'PATCH', body: JSON.stringify({ notes }) });
      if (r.ok && r.data.success) {
        toast('Notes saved', 'success');
        closeModal(); loadMembers(); loadActivity();
      } else { toast(r.data.error || 'Save failed', 'error'); }
    });
  }

  async function setStatus(id, status) {
    let reason = '';
    if (status === 'rejected') reason = prompt('Reason for rejection (optional):') || '';

    const r = await api('/member/' + id + '/status', {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });

    if (r.ok && r.data.success) {
      toast('Status: ' + status, 'success');
      closeModal(); loadMembers(); loadStats(); loadActivity();
    } else { toast(r.data.error || 'Failed', 'error'); }
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
    } else { toast(r.data.error || 'Failed', 'error'); }
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
      closeModal(); loadMembers(); loadStats(); loadActivity();
    } else { toast(r.data.error || 'Failed', 'error'); }
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

  // ============ IMAGE UPLOAD ============
  function pickAndUpload(folder, onSuccess) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5 MB', 'error'); return; }

      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', folder);

      toast('Uploading...', 'info', 1500);
      const r = await api('/upload', { method: 'POST', body: fd });
      if (r.ok && r.data.success) {
        toast('Image uploaded', 'success');
        onSuccess(r.data.key);
      } else { toast(r.data.error || 'Upload failed', 'error'); }
    });
    input.click();
  }

  function imageUploadField(folder, existingKey, fieldId) {
    const wrap = document.createElement('div');
    wrap.className = 'form-field';
    wrap.innerHTML = `
      <label>Image</label>
      <div class="image-upload-zone" id="${fieldId}-zone">
        <div class="image-upload-preview" id="${fieldId}-preview"></div>
        <div class="image-upload-hint">
          <span class="upload-icon">📷</span>
          <span>Click to upload</span>
          <small>JPG/PNG/WebP · max 5 MB</small>
        </div>
      </div>
      <input type="hidden" id="${fieldId}" value="${esc(existingKey || '')}">
      <button type="button" class="btn-text image-remove-btn" id="${fieldId}-remove" style="display:none;color:#B91C1C;">Remove image</button>
    `;

    setTimeout(() => {
      const zone = document.getElementById(fieldId + '-zone');
      const preview = document.getElementById(fieldId + '-preview');
      const hidden = document.getElementById(fieldId);
      const removeBtn = document.getElementById(fieldId + '-remove');

      function showPreview(key) {
        if (!key) { preview.innerHTML = ''; removeBtn.style.display = 'none'; return; }
        const img = document.createElement('img');
        preview.innerHTML = '';
        preview.appendChild(img);
        fetchPhoto(img, key);
        removeBtn.style.display = 'inline-block';
      }

      showPreview(hidden.value);

      zone.addEventListener('click', e => {
        if (e.target === removeBtn) return;
        pickAndUpload(folder, key => { hidden.value = key; showPreview(key); });
      });

      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        hidden.value = '';
        showPreview('');
      });
    }, 0);

    return wrap;
  }

  // ============ GENERIC FORM MODAL ============
  function formModal({ title, fields, onSubmit, submitText }) {
    const wrap = document.createElement('div');
    fields.forEach(f => {
      if (f.type === 'image') {
        wrap.appendChild(imageUploadField(f.folder, f.value, f.id));
      } else if (f.type === 'textarea') {
        const fw = document.createElement('div');
        fw.className = 'form-field';
        fw.innerHTML = `
          <label>${esc(f.label)}${f.required ? ' *' : ''}</label>
          <textarea id="${f.id}" rows="${f.rows || 3}" maxlength="${f.max || 5000}" placeholder="${esc(f.placeholder || '')}">${esc(f.value || '')}</textarea>
        `;
        wrap.appendChild(fw);
      } else if (f.type === 'checkbox') {
        const fw = document.createElement('div');
        fw.className = 'form-field form-field-check';
        fw.innerHTML = `
          <label class="checkbox-label">
            <input type="checkbox" id="${f.id}" ${f.value ? 'checked' : ''}>
            <span>${esc(f.label)}</span>
          </label>
        `;
        wrap.appendChild(fw);
      } else {
        const fw = document.createElement('div');
        fw.className = 'form-field';
        fw.innerHTML = `
          <label>${esc(f.label)}${f.required ? ' *' : ''}</label>
          <input type="${f.type || 'text'}" id="${f.id}" value="${esc(f.value || '')}"
                 maxlength="${f.max || 200}" placeholder="${esc(f.placeholder || '')}">
        `;
        wrap.appendChild(fw);
      }
    });

    const actions = document.createElement('div');
    actions.className = 'modal-actions';
    actions.innerHTML = `
      <button type="button" class="btn btn-primary btn-small" id="form-submit">${esc(submitText || '💾 Save')}</button>
      <button type="button" class="btn btn-outline btn-small" id="form-cancel">Cancel</button>
    `;
    wrap.appendChild(actions);

    openModal(title, wrap);

    document.getElementById('form-cancel').addEventListener('click', closeModal);

    document.getElementById('form-submit').addEventListener('click', async () => {
      const data = {};
      let valid = true;

      fields.forEach(f => {
        const el = document.getElementById(f.id);
        if (!el) return;
        if (f.type === 'checkbox') {
          data[f.name || f.id] = el.checked ? 1 : 0;
        } else {
          const v = el.value.trim();
          if (f.required && !v) { valid = false; el.style.borderColor = '#EF4444'; return; }
          el.style.borderColor = '';
          data[f.name || f.id] = v;
        }
      });

      if (!valid) { toast('Please fill required fields', 'error'); return; }

      const btn = document.getElementById('form-submit');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      await onSubmit(data, btn);
    });
  }

  // ============ CMS: SLIDER ============
  async function loadSlider() {
    const box = document.getElementById('slider-grid');
    if (!box) return;
    const r = await api('/slider');
    if (!r.ok || !r.data.success) {
      box.innerHTML = '<div class="collection-empty"><p>Failed to load.</p></div>';
      return;
    }
    const items = r.data.slides || [];
    if (!items.length) {
      box.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">🖼️</div><p>No slides yet.</p></div>';
      return;
    }
    box.innerHTML = '';
    items.forEach(s => box.appendChild(sliderCard(s)));
  }

  function sliderCard(s) {
    const card = el('div', 'collection-card');
    const wrap = el('div', 'collection-image');
    if (s.photo_key) {
      const img = document.createElement('img');
      img.alt = s.title || '';
      wrap.appendChild(img);
      setTimeout(() => fetchPhoto(img, s.photo_key), 0);
    } else {
      wrap.innerHTML = '<div class="photo-placeholder">🖼️</div>';
    }
    card.appendChild(wrap);

    const info = el('div', 'collection-info');
    if (s.title) info.appendChild(el('strong', '', s.title));
    if (s.subtitle) info.appendChild(el('p', 'collection-caption', s.subtitle));
    if (s.description) info.appendChild(el('p', 'collection-desc', s.description.slice(0, 120)));
    card.appendChild(info);

    const actions = el('div', 'collection-actions');
    const edit = el('button', 'btn btn-outline btn-small', '✏️ Edit');
    edit.addEventListener('click', () => openSliderForm(s));
    const del = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
    del.addEventListener('click', () => deleteEntity('slider', s.id, loadSlider));
    actions.appendChild(edit);
    actions.appendChild(del);
    card.appendChild(actions);

    return card;
  }

  function openSliderForm(slide) {
    const isEdit = !!slide;
    formModal({
      title: isEdit ? 'Edit Slide' : 'Add Slide',
      submitText: isEdit ? '💾 Update' : '➕ Add Slide',
      fields: [
        { id: 'sf-photo', type: 'image', folder: 'slider', value: slide?.photo_key || '' },
        { id: 'sf-title', label: 'Title', value: slide?.title || '', max: 200 },
        { id: 'sf-subtitle', label: 'Subtitle', value: slide?.subtitle || '', max: 300 },
        { id: 'sf-desc', type: 'textarea', label: 'Description', value: slide?.description || '', max: 1000, rows: 3 },
        { id: 'sf-order', label: 'Display Order', type: 'number', value: slide?.display_order ?? 999 },
        { id: 'sf-active', type: 'checkbox', label: 'Active (visible on site)', value: slide?.is_active ?? 1 },
      ],
      onSubmit: async (data, btn) => {
        const payload = {
          title: data['sf-title'],
          subtitle: data['sf-subtitle'],
          description: data['sf-desc'],
          display_order: parseInt(data['sf-order']) || 999,
          is_active: data['sf-active'],
        };
        if (data['sf-photo']) payload.photo_key = data['sf-photo'];

        let r;
        if (isEdit) {
          r = await api('/slider/' + slide.id + '/update', { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          r = await api('/slider/add', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (r.ok && r.data.success) {
          toast(isEdit ? 'Slide updated' : 'Slide added', 'success');
          closeModal(); loadSlider(); loadActivity();
        } else {
          toast(r.data.error || 'Failed', 'error');
          btn.disabled = false;
          btn.textContent = isEdit ? '💾 Update' : '➕ Add Slide';
        }
      },
    });
  }

  // ============ CMS: GALLERY ============
  async function loadGallery() {
    const box = document.getElementById('gallery-grid');
    if (!box) return;
    const r = await api('/gallery');
    if (!r.ok || !r.data.success) {
      box.innerHTML = '<div class="collection-empty"><p>Failed to load.</p></div>';
      return;
    }
    const items = r.data.photos || [];
    if (!items.length) {
      box.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📷</div><p>No photos yet.</p></div>';
      return;
    }
    box.innerHTML = '';
    items.forEach(p => box.appendChild(galleryCard(p)));
  }

  function galleryCard(p) {
    const card = el('div', 'collection-card');
    const wrap = el('div', 'collection-image');
    if (p.photo_key) {
      const img = document.createElement('img');
      img.alt = p.caption || '';
      wrap.appendChild(img);
      setTimeout(() => fetchPhoto(img, p.photo_key), 0);
    }
    card.appendChild(wrap);

    if (p.caption) {
      const info = el('div', 'collection-info');
      info.appendChild(el('p', 'collection-caption', p.caption));
      card.appendChild(info);
    }

    const actions = el('div', 'collection-actions');
    const edit = el('button', 'btn btn-outline btn-small', '✏️ Edit');
    edit.addEventListener('click', () => openGalleryForm(p));
    const del = el('button', 'btn btn-danger btn-small', '🗑️');
    del.addEventListener('click', () => deleteEntity('gallery', p.id, loadGallery));
    actions.appendChild(edit);
    actions.appendChild(del);
    card.appendChild(actions);

    return card;
  }

  function openGalleryForm(photo) {
    const isEdit = !!photo;
    formModal({
      title: isEdit ? 'Edit Photo' : 'Add Photo',
      submitText: isEdit ? '💾 Update' : '➕ Add Photo',
      fields: [
        { id: 'gf-photo', type: 'image', folder: 'gallery', value: photo?.photo_key || '' },
        { id: 'gf-caption', label: 'Caption', value: photo?.caption || '', max: 300 },
        { id: 'gf-order', label: 'Display Order', type: 'number', value: photo?.display_order ?? 999 },
        { id: 'gf-active', type: 'checkbox', label: 'Active', value: photo?.is_active ?? 1 },
      ],
      onSubmit: async (data, btn) => {
        const payload = {
          caption: data['gf-caption'],
          display_order: parseInt(data['gf-order']) || 999,
          is_active: data['gf-active'],
        };
        if (data['gf-photo']) payload.photo_key = data['gf-photo'];

        let r;
        if (isEdit) {
          r = await api('/gallery/' + photo.id + '/update', { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          if (!payload.photo_key) { toast('Please upload a photo', 'error'); btn.disabled = false; btn.textContent = '➕ Add Photo'; return; }
          r = await api('/gallery/add', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (r.ok && r.data.success) {
          toast(isEdit ? 'Photo updated' : 'Photo added', 'success');
          closeModal(); loadGallery(); loadActivity();
        } else {
          toast(r.data.error || 'Failed', 'error');
          btn.disabled = false;
          btn.textContent = isEdit ? '💾 Update' : '➕ Add Photo';
        }
      },
    });
  }

  // ============ CMS: EVENTS ============
  async function loadEvents() {
    const box = document.getElementById('events-list');
    if (!box) return;
    const r = await api('/events');
    if (!r.ok || !r.data.success) { box.innerHTML = '<div class="collection-empty"><p>Failed to load.</p></div>'; return; }
    const items = r.data.events || [];
    if (!items.length) { box.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📅</div><p>No events yet.</p></div>'; return; }
    box.innerHTML = '';
    items.forEach(e => box.appendChild(eventRow(e)));
  }

  function eventRow(e) {
    const row = el('div', 'collection-row');
    const info = el('div', 'collection-row-info');
    info.appendChild(el('strong', '', e.title || 'Untitled'));
    const meta = [];
    if (e.event_date) meta.push(fmtShort(e.event_date));
    if (e.venue) meta.push(e.venue);
    if (meta.length) info.appendChild(el('div', 'collection-meta', meta.join(' · ')));
    if (e.description) info.appendChild(el('p', 'collection-desc', e.description.slice(0, 200)));
    row.appendChild(info);

    const actions = el('div', 'collection-row-actions');
    const edit = el('button', 'btn btn-outline btn-small', '✏️');
    edit.addEventListener('click', () => openEventForm(e));
    const del = el('button', 'btn btn-danger btn-small', '🗑️');
    del.addEventListener('click', () => deleteEntity('events', e.id, loadEvents));
    actions.appendChild(edit);
    actions.appendChild(del);
    row.appendChild(actions);
    return row;
  }

  function openEventForm(event) {
    const isEdit = !!event;
    formModal({
      title: isEdit ? 'Edit Event' : 'Add Event',
      submitText: isEdit ? '💾 Update' : '➕ Add Event',
      fields: [
        { id: 'ef-title', label: 'Title', value: event?.title || '', required: true, max: 200 },
        { id: 'ef-date', label: 'Event Date', type: 'date', value: event?.event_date || todayISO() },
        { id: 'ef-venue', label: 'Venue', value: event?.venue || '', max: 200 },
        { id: 'ef-desc', type: 'textarea', label: 'Description', value: event?.description || '', max: 5000, rows: 4 },
        { id: 'ef-photo', type: 'image', folder: 'events', value: event?.photo_key || '' },
        { id: 'ef-active', type: 'checkbox', label: 'Active', value: event?.is_active ?? 1 },
      ],
      onSubmit: async (data, btn) => {
        const payload = {
          title: data['ef-title'],
          event_date: data['ef-date'],
          venue: data['ef-venue'],
          description: data['ef-desc'],
          is_active: data['ef-active'],
        };
        if (data['ef-photo']) payload.photo_key = data['ef-photo'];

        let r;
        if (isEdit) {
          r = await api('/events/' + event.id + '/update', { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          r = await api('/events/add', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (r.ok && r.data.success) {
          toast(isEdit ? 'Event updated' : 'Event added', 'success');
          closeModal(); loadEvents(); loadActivity();
        } else { toast(r.data.error || 'Failed', 'error'); btn.disabled = false; btn.textContent = isEdit ? '💾 Update' : '➕ Add Event'; }
      },
    });
  }

  // ============ CMS: NEWS ============
  async function loadNews() {
    const box = document.getElementById('news-list');
    if (!box) return;
    const r = await api('/news');
    if (!r.ok || !r.data.success) { box.innerHTML = '<div class="collection-empty"><p>Failed to load.</p></div>'; return; }
    const items = r.data.news || [];
    if (!items.length) { box.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📰</div><p>No news yet.</p></div>'; return; }
    box.innerHTML = '';
    items.forEach(n => box.appendChild(newsRow(n)));
  }

  function newsRow(n) {
    const row = el('div', 'collection-row');
    const info = el('div', 'collection-row-info');
    info.appendChild(el('strong', '', n.headline || 'Untitled'));
    if (n.news_date) info.appendChild(el('div', 'collection-meta', fmtShort(n.news_date)));
    if (n.content) info.appendChild(el('p', 'collection-desc', n.content.slice(0, 200)));
    row.appendChild(info);

    const actions = el('div', 'collection-row-actions');
    const edit = el('button', 'btn btn-outline btn-small', '✏️');
    edit.addEventListener('click', () => openNewsForm(n));
    const del = el('button', 'btn btn-danger btn-small', '🗑️');
    del.addEventListener('click', () => deleteEntity('news', n.id, loadNews));
    actions.appendChild(edit);
    actions.appendChild(del);
    row.appendChild(actions);
    return row;
  }

  function openNewsForm(news) {
    const isEdit = !!news;
    formModal({
      title: isEdit ? 'Edit News' : 'Add News',
      submitText: isEdit ? '💾 Update' : '➕ Add News',
      fields: [
        { id: 'nf-headline', label: 'Headline', value: news?.headline || '', required: true, max: 300 },
        { id: 'nf-date', label: 'Date', type: 'date', value: news?.news_date || todayISO() },
        { id: 'nf-content', type: 'textarea', label: 'Content', value: news?.content || '', max: 20000, rows: 6 },
        { id: 'nf-photo', type: 'image', folder: 'news', value: news?.photo_key || '' },
        { id: 'nf-active', type: 'checkbox', label: 'Active', value: news?.is_active ?? 1 },
      ],
      onSubmit: async (data, btn) => {
        const payload = {
          headline: data['nf-headline'],
          news_date: data['nf-date'],
          content: data['nf-content'],
          is_active: data['nf-active'],
        };
        if (data['nf-photo']) payload.photo_key = data['nf-photo'];

        let r;
        if (isEdit) {
          r = await api('/news/' + news.id + '/update', { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          r = await api('/news/add', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (r.ok && r.data.success) {
          toast(isEdit ? 'News updated' : 'News added', 'success');
          closeModal(); loadNews(); loadActivity();
        } else { toast(r.data.error || 'Failed', 'error'); btn.disabled = false; btn.textContent = isEdit ? '💾 Update' : '➕ Add News'; }
      },
    });
  }

  // ============ CMS: ADS ============
  async function loadAds() {
    const box = document.getElementById('ads-list');
    if (!box) return;
    const r = await api('/ads');
    if (!r.ok || !r.data.success) { box.innerHTML = '<div class="collection-empty"><p>Failed to load.</p></div>'; return; }
    const items = r.data.ads || [];
    if (!items.length) { box.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📢</div><p>No ads yet.</p></div>'; return; }
    box.innerHTML = '';
    items.forEach(a => box.appendChild(adRow(a)));
  }

  function adRow(a) {
    const row = el('div', 'collection-row');
    const info = el('div', 'collection-row-info');
    info.appendChild(el('strong', '', a.title || 'Untitled'));
    const meta = [];
    if (a.position) meta.push('Position: ' + a.position);
    if (a.link_url) meta.push(a.link_url);
    if (meta.length) info.appendChild(el('div', 'collection-meta', meta.join(' · ')));
    if (a.content) info.appendChild(el('p', 'collection-desc', a.content.slice(0, 200)));
    row.appendChild(info);

    const actions = el('div', 'collection-row-actions');
    const edit = el('button', 'btn btn-outline btn-small', '✏️');
    edit.addEventListener('click', () => openAdsForm(a));
    const del = el('button', 'btn btn-danger btn-small', '🗑️');
    del.addEventListener('click', () => deleteEntity('ads', a.id, loadAds));
    actions.appendChild(edit);
    actions.appendChild(del);
    row.appendChild(actions);
    return row;
  }

  function openAdsForm(ad) {
    const isEdit = !!ad;
    formModal({
      title: isEdit ? 'Edit Ad' : 'Add Ad',
      submitText: isEdit ? '💾 Update' : '➕ Add Ad',
      fields: [
        { id: 'af-title', label: 'Title', value: ad?.title || '', max: 200 },
        { id: 'af-content', type: 'textarea', label: 'Content', value: ad?.content || '', max: 2000, rows: 3 },
        { id: 'af-image', type: 'image', folder: 'ads', value: ad?.image_key || '' },
        { id: 'af-link', label: 'Link URL (https://...)', value: ad?.link_url || '', max: 500 },
        { id: 'af-position', label: 'Position', value: ad?.position || 'top', max: 30, placeholder: 'top / bottom / sidebar' },
        { id: 'af-start', label: 'Start Date', type: 'date', value: ad?.start_date || '' },
        { id: 'af-end', label: 'End Date', type: 'date', value: ad?.end_date || '' },
        { id: 'af-active', type: 'checkbox', label: 'Active', value: ad?.is_active ?? 1 },
      ],
      onSubmit: async (data, btn) => {
        const payload = {
          title: data['af-title'],
          content: data['af-content'],
          link_url: data['af-link'],
          position: data['af-position'] || 'top',
          start_date: data['af-start'],
          end_date: data['af-end'],
          is_active: data['af-active'],
        };
        if (data['af-image']) payload.image_key = data['af-image'];

        let r;
        if (isEdit) {
          r = await api('/ads/' + ad.id + '/update', { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          r = await api('/ads/add', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (r.ok && r.data.success) {
          toast(isEdit ? 'Ad updated' : 'Ad added', 'success');
          closeModal(); loadAds(); loadActivity();
        } else { toast(r.data.error || 'Failed', 'error'); btn.disabled = false; btn.textContent = isEdit ? '💾 Update' : '➕ Add Ad'; }
      },
    });
  }

  // ============ CMS: TEAM ============
  async function loadTeam() {
    const box = document.getElementById('team-grid');
    if (!box) return;
    const r = await api('/team');
    if (!r.ok || !r.data.success) { box.innerHTML = '<div class="collection-empty"><p>Failed.</p></div>'; return; }
    const items = r.data.members || [];
    if (!items.length) { box.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">👑</div><p>No team members.</p></div>'; return; }
    box.innerHTML = '';
    items.forEach(t => box.appendChild(teamCard(t)));
  }

  function teamCard(t) {
    const card = el('div', 'collection-card team-card-admin');
    const wrap = el('div', 'collection-image');
    if (t.photo_key) {
      const img = document.createElement('img');
      img.alt = t.name || '';
      wrap.appendChild(img);
      setTimeout(() => fetchPhoto(img, t.photo_key), 0);
    } else {
      wrap.innerHTML = '<div class="photo-placeholder">👤</div>';
    }
    card.appendChild(wrap);

    const info = el('div', 'collection-info');
    info.appendChild(el('strong', '', t.name || 'Unnamed'));
    if (t.role) info.appendChild(el('p', 'collection-caption', t.role));
    if (t.bio) info.appendChild(el('p', 'collection-desc', t.bio.slice(0, 100)));
    card.appendChild(info);

    const actions = el('div', 'collection-actions');
    const edit = el('button', 'btn btn-outline btn-small', '✏️ Edit');
    edit.addEventListener('click', () => openTeamForm(t));
    const del = el('button', 'btn btn-danger btn-small', '🗑️');
    del.addEventListener('click', () => deleteEntity('team', t.id, loadTeam));
    actions.appendChild(edit);
    actions.appendChild(del);
    card.appendChild(actions);

    return card;
  }

  function openTeamForm(member) {
    const isEdit = !!member;
    formModal({
      title: isEdit ? 'Edit Team Member' : 'Add Team Member',
      submitText: isEdit ? '💾 Update' : '➕ Add Member',
      fields: [
        { id: 'tf-name', label: 'Full Name', value: member?.name || '', required: true, max: 100 },
        { id: 'tf-role', label: 'Role / Position', value: member?.role || '', max: 100 },
        { id: 'tf-photo', type: 'image', folder: 'team', value: member?.photo_key || '' },
        { id: 'tf-bio', type: 'textarea', label: 'Short Bio', value: member?.bio || '', max: 1000, rows: 3 },
        { id: 'tf-phone', label: 'Phone (optional)', value: member?.phone || '', max: 20, placeholder: '9876543210' },
        { id: 'tf-order', label: 'Display Order', type: 'number', value: member?.display_order ?? 999 },
        { id: 'tf-active', type: 'checkbox', label: 'Active', value: member?.is_active ?? 1 },
      ],
      onSubmit: async (data, btn) => {
        const payload = {
          name: data['tf-name'],
          role: data['tf-role'],
          bio: data['tf-bio'],
          phone: data['tf-phone'],
          display_order: parseInt(data['tf-order']) || 999,
          is_active: data['tf-active'],
        };
        if (data['tf-photo']) payload.photo_key = data['tf-photo'];

        let r;
        if (isEdit) {
          r = await api('/team/' + member.id + '/update', { method: 'PATCH', body: JSON.stringify(payload) });
        } else {
          r = await api('/team/add', { method: 'POST', body: JSON.stringify(payload) });
        }

        if (r.ok && r.data.success) {
          toast(isEdit ? 'Member updated' : 'Member added', 'success');
          closeModal(); loadTeam(); loadActivity();
        } else { toast(r.data.error || 'Failed', 'error'); btn.disabled = false; btn.textContent = isEdit ? '💾 Update' : '➕ Add Member'; }
      },
    });
  }

  // ============ DELETE ENTITY ============
  async function deleteEntity(type, id, reloadFn) {
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
      if (reloadFn) reloadFn();
      loadActivity();
    } else { toast(r.data.error || 'Delete failed', 'error'); }
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
    const org = c.org || {};
    const about = c.about || {};
    const contact = c.contact || {};

    editor.innerHTML = `
      <div class="content-section">
        <h3 class="content-section-title">Organization</h3>
        <div class="content-field"><label>Organization Name</label><input type="text" id="c-org-name" value="${esc(org.name || '')}"></div>
        <div class="content-field"><label>Top Bar Text</label><input type="text" id="c-org-topbar" value="${esc(org.topbar || '')}"></div>
        <div class="content-field"><label>Subtitle</label><input type="text" id="c-org-subtitle" value="${esc(org.subtitle || '')}"></div>
      </div>
      <div class="content-section">
        <h3 class="content-section-title">About Section</h3>
        <div class="content-field"><label>About Title</label><input type="text" id="c-about-title" value="${esc(about.title || '')}"></div>
        <div class="content-field"><label>About Description</label><textarea id="c-about-desc" rows="4">${esc(about.description || '')}</textarea></div>
      </div>
      <div class="content-section">
        <h3 class="content-section-title">Contact</h3>
        <div class="content-field"><label>Contact Title</label><input type="text" id="c-contact-title" value="${esc(contact.title || '')}"></div>
        <div class="content-field"><label>Address</label><input type="text" id="c-contact-address" value="${esc(contact.address || '')}"></div>
        <div class="content-field"><label>Email</label><input type="email" id="c-contact-email" value="${esc(contact.email || '')}"></div>
      </div>
      <div class="content-actions">
        <button class="btn btn-primary" id="content-save-btn" type="button">💾 Save All Changes</button>
      </div>
    `;

    document.getElementById('content-save-btn').addEventListener('click', async () => {
      const r0 = await api('/content');
      if (!r0.ok || !r0.data.success) { toast('Cannot save', 'error'); return; }
      const c2 = JSON.parse(JSON.stringify(r0.data.content || {}));
      c2.org = c2.org || {};
      c2.about = c2.about || {};
      c2.contact = c2.contact || {};

      c2.org.name = document.getElementById('c-org-name').value.trim();
      c2.org.topbar = document.getElementById('c-org-topbar').value.trim();
      c2.org.subtitle = document.getElementById('c-org-subtitle').value.trim();
      c2.about.title = document.getElementById('c-about-title').value.trim();
      c2.about.description = document.getElementById('c-about-desc').value.trim();
      c2.contact.title = document.getElementById('c-contact-title').value.trim();
      c2.contact.address = document.getElementById('c-contact-address').value.trim();
      c2.contact.email = document.getElementById('c-contact-email').value.trim();

      const r = await api('/content/update', { method: 'POST', body: JSON.stringify({ content: c2 }) });
      if (r.ok && r.data.success) {
        toast('Content saved', 'success');
        loadActivity();
      } else { toast(r.data.error || 'Save failed', 'error'); }
    });
  }

  // ============ 2FA STATUS ============
  async function check2FA() {
    const elm = document.getElementById('2fa-status-text');
    if (!elm) return;
    const r = await api('/2fa/status');
    if (r.ok && r.data.success) {
      elm.textContent = r.data.enabled ? '2FA is enabled ✅' : '2FA is disabled ⚠️';
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
    const escF = v => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(escF).join(',')).join('\r\n');
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
      await startSetupWizard();
      return;
    }

    showScreen('login-screen');
  });

})();
