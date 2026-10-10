/* ============================================================
   KARNI SENA VARANASI — Admin Panel Logic v4.0
   ============================================================
   - Session-token auth (Bearer)
   - 2FA setup + verify flow
   - Full CRUD for all CMS tabs
   - Custom modals, toasts, animations
   ============================================================ */

(function () {
  'use strict';

  // ============================================================
  // CONFIG
  // ============================================================
  const API_BASE = 'https://karni-sena-backend.smritiiasacademy.workers.dev/admin';
  const STORAGE_KEY = 'ksv_admin_token';
  const USERNAME_KEY = 'ksv_admin_username';

  // ============================================================
  // STATE
  // ============================================================
  let session = null;
  let currentUsername = '';
  let currentTab = 'dashboard';
  let setupSecretData = null;
  let membersCache = [];
  let collectionsCache = {
    gallery: [], slider: [], events: [], news: [], ads: [], team: [],
  };
  let contentCache = null;
  let searchDebounce = null;

  // ============================================================
  // DOM HELPERS
  // ============================================================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => root.querySelectorAll(sel);

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch (e) { return iso; }
  }

  function formatDateShort(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch (e) { return iso; }
  }

  function debounce(fn, wait) {
    return function (...args) {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  // ============================================================
  // TOASTS
  // ============================================================
  function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = el('div', 'toast toast-' + type);
    const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-show'));

    setTimeout(() => {
      toast.classList.remove('toast-show');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  // ============================================================
  // CONFIRM DIALOG
  // ============================================================
  function confirmDialog({ title, message, okText = 'Confirm', danger = true }) {
    return new Promise((resolve) => {
      const backdrop = document.getElementById('confirm-backdrop');
      const body = document.getElementById('confirm-body');
      const okBtn = document.getElementById('confirm-ok');
      const cancelBtn = document.getElementById('confirm-cancel');

      if (!backdrop || !body) return resolve(false);

      body.innerHTML = `<p class="confirm-message">${escapeHtml(message)}</p>`;
      okBtn.textContent = okText;
      okBtn.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary');

      backdrop.style.display = 'flex';
      backdrop.setAttribute('aria-hidden', 'false');

      function cleanup() {
        backdrop.style.display = 'none';
        backdrop.setAttribute('aria-hidden', 'true');
        okBtn.removeEventListener('click', onOk);
        cancelBtn.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onBackdrop);
      }
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onBackdrop(e) { if (e.target === backdrop) onCancel(); }

      okBtn.addEventListener('click', onOk);
      cancelBtn.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onBackdrop);
    });
  }

  // ============================================================
  // GENERIC MODAL
  // ============================================================
  function openModal(title, contentNodeOrHTML) {
    const backdrop = document.getElementById('modal-backdrop');
    const body = document.getElementById('modal-body');
    const titleEl = document.getElementById('modal-title');
    if (!backdrop || !body) return;

    if (titleEl) titleEl.textContent = title || '';
    body.replaceChildren();

    if (typeof contentNodeOrHTML === 'string') {
      body.innerHTML = contentNodeOrHTML;
    } else if (contentNodeOrHTML instanceof Node) {
      body.appendChild(contentNodeOrHTML);
    }

    backdrop.style.display = 'flex';
    backdrop.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.style.display = 'none';
      backdrop.setAttribute('aria-hidden', 'true');
    }
  }

  // ============================================================
  // SESSION MANAGEMENT
  // ============================================================
  function loadSession() {
    try {
      const token = sessionStorage.getItem(STORAGE_KEY);
      const username = sessionStorage.getItem(USERNAME_KEY);
      if (token) {
        session = { token };
        currentUsername = username || '';
      }
    } catch (e) { session = null; }
  }

  function saveSession(token, username) {
    session = { token };
    currentUsername = username || currentUsername;
    try {
      sessionStorage.setItem(STORAGE_KEY, token);
      if (username) sessionStorage.setItem(USERNAME_KEY, username);
    } catch (e) { console.warn('Session save failed:', e); }
  }

  function clearSession() {
    session = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(USERNAME_KEY);
    } catch (e) {}
  }

  // ============================================================
  // API REQUEST WRAPPER
  // ============================================================
  async function apiRequest(endpoint, method = 'GET', data = null, isFormData = false) {
    const headers = {};

    if (session && session.token) {
      headers['Authorization'] = 'Bearer ' + session.token;
    }

    if (!isFormData) {
      headers['Content-Type'] = 'application/json';
    }

    const options = { method, headers };

    if (data) {
      options.body = isFormData ? data : JSON.stringify(data);
    }

    try {
      const response = await fetch(API_BASE + endpoint, options);

      if (response.status === 401) {
        clearSession();
        showScreen('login-screen');
        return { success: false, error: 'Session expired. Please log in again.' };
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        return await response.json();
      }
      return { success: response.ok };
    } catch (err) {
      console.error('API Error:', endpoint, err);
      return { success: false, error: 'Network error. Please try again.' };
    }
  }

  // ============================================================
  // SCREEN ROUTER
  // ============================================================
  function showScreen(screenId) {
    const screens = ['login-screen', 'twofa-screen', 'setup-screen', 'dashboard'];
    screens.forEach(id => {
      const node = document.getElementById(id);
      if (!node) return;
      if (id === screenId) {
        // Use flex for centered screens, block for dashboard
        node.style.display = (id === 'dashboard') ? 'block' : 'flex';
      } else {
        node.style.display = 'none';
      }
    });
  }

  function showError(elementId, msg) {
    const node = document.getElementById(elementId);
    if (node) node.textContent = msg;
  }

  function clearErrors() {
    ['login-error', 'twofa-error', 'setup-error'].forEach(id => {
      const node = document.getElementById(id);
      if (node) node.textContent = '';
    });
  }

  // ============================================================
  // LOGIN FLOW
  // ============================================================
  function initLoginFlow() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        const loginBtn = document.getElementById('login-btn');

        currentUsername = usernameInput.value.trim();
        const password = passwordInput.value;

        if (!currentUsername || !password) {
          showError('login-error', 'कृपया username और password दर्ज करें।');
          return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = 'Checking...';

        try {
          const res = await apiRequest('/login', 'POST', {
            username: currentUsername,
            password: password,
          });

          if (res.success) {
            passwordInput.value = '';
            if (res.needs_2fa) {
              showScreen('twofa-screen');
              setTimeout(() => document.getElementById('totp-code')?.focus(), 100);
            } else {
              // 2FA not set up yet — start wizard
              await initSetupWizard(currentUsername, password);
            }
          } else {
            showError('login-error', res.error || 'Invalid credentials');
          }
        } catch (err) {
          showError('login-error', 'Could not connect to server.');
        } finally {
          loginBtn.disabled = false;
          loginBtn.textContent = 'Continue';
        }
      });
    }

    // 2FA verify form
    const twofaForm = document.getElementById('twofa-form');
    if (twofaForm) {
      twofaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearErrors();

        const codeInput = document.getElementById('totp-code');
        const verifyBtn = document.getElementById('twofa-btn');
        const code = codeInput.value.trim().toUpperCase().replace(/\s+/g, '');

        if (!code || code.length < 6) {
          showError('twofa-error', 'कृपया 6-अंकों का कोड या backup code दर्ज करें।');
          return;
        }

        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';

        try {
          const res = await apiRequest('/2fa/verify', 'POST', {
            username: currentUsername,
            code: code,
          });

          if (res.success && res.token) {
            saveSession(res.token, currentUsername);
            codeInput.value = '';
            if (res.used_backup_code) {
              showToast('Logged in with backup code. It has been consumed.', 'info', 5000);
            }
            openDashboard();
          } else {
            showError('twofa-error', res.error || 'Invalid code');
          }
        } catch (err) {
          showError('twofa-error', 'Verification failed.');
        } finally {
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify & Login';
        }
      });
    }

    // Back buttons
    document.getElementById('twofa-back')?.addEventListener('click', () => {
      showScreen('login-screen');
      clearErrors();
    });
    document.getElementById('setup-back-btn')?.addEventListener('click', () => {
      setupSecretData = null;
      showScreen('login-screen');
      clearErrors();
    });

    // Logout
    document.getElementById('logout-btn')?.addEventListener('click', () => performLogout(false));
    document.getElementById('logout-all-btn')?.addEventListener('click', () => performLogout(true));
  }

  async function performLogout(allDevices = false) {
    const ok = await confirmDialog({
      title: allDevices ? 'Log out everywhere?' : 'Log out?',
      message: allDevices
        ? 'This will invalidate all active sessions across all devices.'
        : 'You will be logged out from this browser.',
      okText: allDevices ? 'Log Out All' : 'Log Out',
      danger: false,
    });
    if (!ok) return;

    try { await apiRequest('/logout', 'POST'); } catch (e) {}
    clearSession();
    showScreen('login-screen');
    showToast('Logged out', 'info');
  }

  // ============================================================
  // 2FA SETUP WIZARD
  // ============================================================
  async function initSetupWizard(username, password) {
    const qrContainer = document.getElementById('qr-container');
    if (qrContainer) qrContainer.innerHTML = '<div class="spinner">Loading QR...</div>';

    try {
      const res = await apiRequest('/2fa/setup-init', 'POST', { username, password });
      if (res.success) {
        setupSecretData = res;
        showScreen('setup-screen');
        renderQRCode(res.otpauth_url);
        const secretEl = document.getElementById('manual-secret');
        if (secretEl) secretEl.textContent = res.secret;
        setupWizardSteps();
      } else {
        showError('login-error', res.error || 'Failed to start 2FA setup.');
      }
    } catch (err) {
      showError('login-error', 'Server error.');
    }
  }

  function renderQRCode(otpauthUrl) {
    const container = document.getElementById('qr-container');
    if (!container) return;
    container.innerHTML = '';

    const qrImg = document.createElement('img');
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(otpauthUrl)}`;
    qrImg.alt = '2FA QR Code';
    qrImg.width = 220;
    qrImg.height = 220;
    qrImg.onerror = () => {
      container.innerHTML = '<p style="color:#B91C1C">Failed to load QR. Use manual entry below.</p>';
    };
    container.appendChild(qrImg);

    const copyBtn = document.getElementById('copy-secret-btn');
    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          await navigator.clipboard.writeText(setupSecretData.secret);
          showToast('Secret copied to clipboard', 'success');
        } catch (e) {
          showToast('Copy failed — please copy manually', 'error');
        }
      };
    }
  }

  function setupWizardSteps() {
    const step1 = document.getElementById('setup-step-1');
    const step2 = document.getElementById('setup-step-2');
    const step3 = document.getElementById('setup-step-3');

    if (step1) step1.style.display = 'block';
    if (step2) step2.style.display = 'none';
    if (step3) step3.style.display = 'none';

    const continueBtn = document.getElementById('setup-continue-btn');
    if (continueBtn) {
      continueBtn.onclick = () => {
        if (step1) step1.style.display = 'none';
        if (step2) step2.style.display = 'block';
        setTimeout(() => document.getElementById('setup-totp-input')?.focus(), 100);
      };
    }

    const verifyBtn = document.getElementById('setup-verify-btn');
    if (verifyBtn) {
      verifyBtn.onclick = async () => {
        const codeInput = document.getElementById('setup-totp-input');
        const code = codeInput.value.trim();

        if (!/^\d{6}$/.test(code)) {
          showError('setup-error', 'Please enter a valid 6-digit code.');
          return;
        }

        verifyBtn.disabled = true;
        verifyBtn.textContent = 'Verifying...';

        try {
          const res = await apiRequest('/2fa/enable', 'POST', {
            secret: setupSecretData.secret,
            code: code,
            backup_hashes: setupSecretData.backup_hashes,
          });

          if (res.success) {
            if (step2) step2.style.display = 'none';
            if (step3) step3.style.display = 'block';
            renderBackupCodes(setupSecretData.backup_codes);
          } else {
            showError('setup-error', res.error || 'Verification failed.');
          }
        } catch (err) {
          showError('setup-error', 'Network error.');
        } finally {
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify & Enable 2FA';
        }
      };
    }
  }

  function renderBackupCodes(codes) {
    const container = document.getElementById('backup-codes-list');
    if (container) {
      container.innerHTML = '';
      codes.forEach((code, i) => {
        const item = el('div', 'backup-code-item');
        item.innerHTML = `<span class="backup-code-index">${i + 1}.</span> <code class="backup-code-value">${escapeHtml(code)}</code>`;
        container.appendChild(item);
      });
    }

    const downloadBtn = document.getElementById('download-codes-btn');
    if (downloadBtn) {
      downloadBtn.onclick = () => {
        const text = [
          'KARNI SENA VARANASI — 2FA BACKUP CODES',
          '=========================================',
          'Generated: ' + new Date().toLocaleString('en-IN'),
          'Username: ' + currentUsername,
          '',
          'Each code can be used ONCE to log in if you lose your phone.',
          '',
          ...codes.map((c, i) => (i + 1) + '. ' + c),
          '',
          'Manual secret: ' + setupSecretData.secret,
        ].join('\n');

        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'karni-sena-2fa-backup-codes.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast('Backup codes downloaded', 'success');
      };
    }

    const doneBtn = document.getElementById('setup-done-btn');
    if (doneBtn) {
      doneBtn.onclick = () => {
        setupSecretData = null;
        showScreen('login-screen');
        showToast('2FA enabled! Log in with your new code.', 'success', 5000);
        setTimeout(() => document.getElementById('totp-code')?.focus(), 200);
      };
    }
  }

  // ============================================================
  // DASHBOARD ENTRY
  // ============================================================
  function openDashboard() {
    showScreen('dashboard');
    initTabs();
    switchTab('dashboard');
    loadDashboardStats();
    loadActivityFeed();
    check2FAStatus();
  }

  async function verifyAndOpenDashboard() {
    // Verify session is still valid by hitting a light endpoint
    const res = await apiRequest('/stats');
    if (res.success) {
      openDashboard();
    } else {
      clearSession();
      showScreen('login-screen');
    }
  }

  // ============================================================
  // TABS
  // ============================================================
  let tabsInitialized = false;
  function initTabs() {
    if (tabsInitialized) return;
    tabsInitialized = true;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        switchTab(tabName);
      });
    });
  }

  function switchTab(tabName) {
    currentTab = tabName;

    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
    });

    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === 'tab-' + tabName);
    });

    // Lazy-load data
    switch (tabName) {
      case 'members': loadMembersList(); break;
      case 'gallery': loadGalleryList(); break;
      case 'slider':  loadSliderList(); break;
      case 'events':  loadEventsList(); break;
      case 'news':    loadNewsList(); break;
      case 'ads':     loadAdsList(); break;
      case 'team':    loadTeamList(); break;
      case 'content': loadSiteContent(); break;
      case 'settings': check2FAStatus(); break;
    }
  }

  // ============================================================
  // DASHBOARD: STATS + ACTIVITY
  // ============================================================
  async function loadDashboardStats() {
    const res = await apiRequest('/stats', 'GET');
    if (res.success && res.stats) {
      document.querySelectorAll('[data-stat]').forEach(node => {
        const key = node.getAttribute('data-stat');
        if (res.stats[key] !== undefined) {
          animateCount(node, res.stats[key]);
        }
      });
    }
  }

  function animateCount(node, target) {
    const start = parseInt(node.textContent) || 0;
    const duration = 600;
    const startTime = performance.now();
    function tick(now) {
      const progress = Math.min((now - startTime) / duration, 1);
      const current = Math.round(start + (target - start) * progress);
      node.textContent = String(current);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  async function loadActivityFeed() {
    const feed = document.getElementById('activity-feed');
    if (!feed) return;

    const res = await apiRequest('/activity?limit=15', 'GET');
    if (res.success && res.actions) {
      if (res.actions.length === 0) {
        feed.innerHTML = '<p class="text-muted">कोई हालिया गतिविधि नहीं।</p>';
        return;
      }
      feed.innerHTML = res.actions.map(act => `
        <div class="activity-item">
          <span class="activity-icon">${getActivityIcon(act.action)}</span>
          <div class="activity-content">
            <div class="activity-text">
              <strong>${escapeHtml(act.action)}</strong>
              ${act.entity_type ? ' · ' + escapeHtml(act.entity_type) : ''}
              ${act.entity_id ? ' #' + escapeHtml(act.entity_id) : ''}
            </div>
            <div class="activity-time">${formatDate(act.timestamp)}</div>
          </div>
        </div>
      `).join('');
    }
  }

  function getActivityIcon(action) {
    const icons = {
      upload: '📤', delete: '🗑️', add: '➕', update: '✏️',
      status_change: '🔄', edit: '📝', notes_update: '📓',
      generate_card: '🎫', decrypt_aadhaar: '🔓',
    };
    return icons[action] || '•';
  }

  // ============================================================
  // MEMBERS LIST
  // ============================================================
  async function loadMembersList() {
    const statusFilter = document.getElementById('member-status-filter')?.value || '';
    const searchQuery = document.getElementById('member-search')?.value.trim() || '';
    const statusEl = document.getElementById('members-status');
    const tableEl = document.getElementById('members-table');
    const tbody = document.getElementById('members-tbody');

    if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'लोड हो रहा है...'; }
    if (tableEl) tableEl.style.display = 'none';

    let url = '/list?limit=200';
    if (statusFilter) url += '&status=' + encodeURIComponent(statusFilter);
    if (searchQuery) url += '&q=' + encodeURIComponent(searchQuery);

    const res = await apiRequest(url, 'GET');

    if (res.success && res.submissions) {
      membersCache = res.submissions;

      if (statusEl) statusEl.style.display = 'none';
      if (tableEl) tableEl.style.display = 'table';

      if (res.submissions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">कोई सदस्य नहीं मिला।</td></tr>';
        return;
      }

      tbody.replaceChildren();
      res.submissions.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="cell-id">#${escapeHtml(m.id)}</td>
          <td class="cell-mono">${escapeHtml(m.member_id || '—')}</td>
          <td>
            <strong>${escapeHtml(m.name || '—')}</strong>
            <br><small>${escapeHtml(m.father_name || '')}</small>
          </td>
          <td class="cell-mono">${escapeHtml(m.mobile || '—')}</td>
          <td class="cell-mono">XXXX-XXXX-${escapeHtml(m.aadhaar_last4 || '—')}</td>
          <td class="cell-photo"></td>
          <td><span class="status-badge status-${escapeHtml(m.status || 'pending')}">${escapeHtml(m.status || 'pending')}</span></td>
          <td>${formatDateShort(m.submitted_at)}</td>
          <td>
            <div class="row-actions">
              <button class="view-btn" title="View" type="button">👁️</button>
              <button class="delete-btn" title="Delete" type="button">🗑️</button>
            </div>
          </td>
        `;

        // Photo
        if (m.photo_key) {
          const img = document.createElement('img');
          img.className = 'photo-thumb';
          img.alt = m.name || '';
          img.loading = 'lazy';
          tr.querySelector('.cell-photo').appendChild(img);
          fetchPhotoInto(img, m.photo_key);
        } else {
          tr.querySelector('.cell-photo').textContent = '—';
        }

        // Actions
        tr.querySelector('.view-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          openMemberModal(m);
        });
        tr.querySelector('.delete-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          deleteMember(m.id, m.name);
        });

        tr.addEventListener('click', () => openMemberModal(m));
        tbody.appendChild(tr);
      });
    } else {
      if (statusEl) statusEl.textContent = 'डेटा लोड करने में विफल।';
    }
  }

  // ============================================================
  // MEMBER MODAL
  // ============================================================
  function openMemberModal(m) {
    const wrapper = document.createElement('div');

    if (m.photo_key) {
      const img = document.createElement('img');
      img.className = 'detail-photo';
      img.alt = m.name || 'Photo';
      wrapper.appendChild(img);
      // Fetch after appended
      setTimeout(() => fetchPhotoInto(img, m.photo_key), 0);
    }

    const dl = el('dl', 'detail-grid');
    const fields = [
      ['Member ID', m.member_id || '—'],
      ['नाम', m.name || '—'],
      ['पिता का नाम', m.father_name || '—'],
      ['पता', m.address || '—'],
      ['जिला', m.district || '—'],
      ['राज्य', m.state || '—'],
      ['मोबाइल', m.mobile || '—'],
      ['आधार', 'XXXX-XXXX-' + (m.aadhaar_last4 || '—')],
      ['अतिरिक्त', m.additional || '—'],
      ['Notes', m.notes || '—'],
      ['Status', m.status || 'pending'],
      ['जमा', formatDate(m.submitted_at)],
    ];
    fields.forEach(([label, value]) => {
      dl.appendChild(el('dt', '', label));
      dl.appendChild(el('dd', '', value));
    });
    wrapper.appendChild(dl);

    // Actions
    const actions = el('div', 'modal-actions');

    if (m.status !== 'active') {
      const approveBtn = el('button', 'btn btn-primary btn-small', '✅ Approve');
      approveBtn.addEventListener('click', () => updateMemberStatus(m.id, 'active'));
      actions.appendChild(approveBtn);
    }
    if (m.status !== 'rejected') {
      const rejectBtn = el('button', 'btn btn-outline btn-small', '❌ Reject');
      rejectBtn.addEventListener('click', () => updateMemberStatus(m.id, 'rejected'));
      actions.appendChild(rejectBtn);
    }

    const decryptBtn = el('button', 'btn btn-outline btn-small', '🔓 View Aadhaar');
    decryptBtn.addEventListener('click', () => decryptAadhaar(m.id));
    actions.appendChild(decryptBtn);

    const deleteBtn = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
    deleteBtn.addEventListener('click', () => deleteMember(m.id, m.name));
    actions.appendChild(deleteBtn);

    wrapper.appendChild(actions);

    openModal('Member Details', wrapper);
  }

  async function updateMemberStatus(id, status) {
    let reason = '';
    if (status === 'rejected') {
      reason = prompt('Reason for rejection (optional):') || '';
    }

    const res = await apiRequest('/member/' + id + '/status', 'POST', { status, reason });
    if (res.success) {
      showToast('Status updated to ' + status, 'success');
      closeModal();
      loadMembersList();
      loadDashboardStats();
      loadActivityFeed();
    } else {
      showToast('Failed: ' + (res.error || 'Unknown error'), 'error');
    }
  }

  async function decryptAadhaar(id) {
    const ok = await confirmDialog({
      title: 'View full Aadhaar?',
      message: 'This action will be logged in the audit trail.',
      okText: 'View',
      danger: false,
    });
    if (!ok) return;

    const res = await apiRequest('/member/' + id + '/decrypt-aadhaar', 'POST');
    if (res.success) {
      openModal('Full Aadhaar Number', `<p class="aadhaar-reveal">${escapeHtml(res.aadhaar)}</p><p class="text-muted">This action has been logged.</p>`);
    } else {
      showToast('Failed: ' + (res.error || 'Unknown error'), 'error');
    }
  }

  async function deleteMember(id, name) {
    const ok = await confirmDialog({
      title: 'Delete member?',
      message: `Delete "${name || 'this member'}" (#${id})? This cannot be undone.`,
      okText: 'Delete',
      danger: true,
    });
    if (!ok) return;

    const res = await apiRequest('/delete/' + id, 'DELETE');
    if (res.success) {
      showToast('Member deleted', 'success');
      closeModal();
      loadMembersList();
      loadDashboardStats();
      loadActivityFeed();
    } else {
      showToast('Delete failed: ' + (res.error || 'Unknown error'), 'error');
    }
  }

  // ============================================================
  // PHOTO FETCH (with auth)
  // ============================================================
  async function fetchPhotoInto(imgEl, key) {
    if (!key || !imgEl) return;
    try {
      const encodedKey = key.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(API_BASE + '/photo/' + encodedKey, {
        headers: { 'Authorization': 'Bearer ' + (session?.token || '') },
      });
      if (!res.ok) {
        imgEl.style.background = '#F5E9D0';
        return;
      }
      const blob = await res.blob();
      imgEl.src = URL.createObjectURL(blob);
    } catch (e) {
      imgEl.style.background = '#F5E9D0';
    }
  }

  // ============================================================
  // GALLERY
  // ============================================================
  async function loadGalleryList() {
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;

    const res = await apiRequest('/gallery', 'GET');
    if (res.success && res.photos) {
      collectionsCache.gallery = res.photos;
      grid.innerHTML = '';

      if (res.photos.length === 0) {
        grid.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📸</div><p>अभी कोई फ़ोटो नहीं है। "Add Photo" पर क्लिक करें।</p></div>';
        return;
      }

      res.photos.forEach(p => {
        const card = el('div', 'collection-card');
        const imgWrap = el('div', 'collection-image');
        const img = document.createElement('img');
        img.alt = p.caption || '';
        img.loading = 'lazy';
        imgWrap.appendChild(img);
        card.appendChild(imgWrap);
        if (p.caption) card.appendChild(el('p', 'collection-caption', p.caption));

        const delBtn = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
        delBtn.addEventListener('click', () => deleteGalleryItem(p.id));
        card.appendChild(delBtn);

        grid.appendChild(card);
        fetchPhotoInto(img, p.photo_key);
      });
    }
  }

  async function deleteGalleryItem(id) {
    const ok = await confirmDialog({ title: 'Delete photo?', message: 'This will remove the photo permanently.', okText: 'Delete' });
    if (!ok) return;
    const res = await apiRequest('/gallery/' + id + '/delete', 'DELETE');
    if (res.success) {
      showToast('Photo deleted', 'success');
      loadGalleryList();
      loadActivityFeed();
    } else {
      showToast('Delete failed', 'error');
    }
  }

  // ============================================================
  // SLIDER
  // ============================================================
  async function loadSliderList() {
    const grid = document.getElementById('slider-grid');
    if (!grid) return;

    const res = await apiRequest('/slider', 'GET');
    if (res.success && res.slides) {
      collectionsCache.slider = res.slides;
      grid.innerHTML = '';

      if (res.slides.length === 0) {
        grid.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">🎬</div><p>कोई स्लाइड नहीं है। "Add Slide" पर क्लिक करें।</p></div>';
        return;
      }

      res.slides.forEach(s => {
        const card = el('div', 'collection-card');
        const imgWrap = el('div', 'collection-image');
        const img = document.createElement('img');
        img.alt = s.title || '';
        imgWrap.appendChild(img);
        card.appendChild(imgWrap);

        const info = el('div', 'collection-info');
        if (s.title) info.appendChild(el('strong', '', s.title));
        if (s.subtitle) info.appendChild(el('p', 'collection-caption', s.subtitle));
        card.appendChild(info);

        const delBtn = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
        delBtn.addEventListener('click', () => deleteSliderItem(s.id));
        card.appendChild(delBtn);

        grid.appendChild(card);
        fetchPhotoInto(img, s.photo_key);
      });
    }
  }

  async function deleteSliderItem(id) {
    const ok = await confirmDialog({ title: 'Delete slide?', message: 'This will remove the slide permanently.', okText: 'Delete' });
    if (!ok) return;
    const res = await apiRequest('/slider/' + id + '/delete', 'DELETE');
    if (res.success) {
      showToast('Slide deleted', 'success');
      loadSliderList();
    } else {
      showToast('Delete failed', 'error');
    }
  }

  // ============================================================
  // EVENTS
  // ============================================================
  async function loadEventsList() {
    const list = document.getElementById('events-list');
    if (!list) return;

    const res = await apiRequest('/events', 'GET');
    if (res.success && res.events) {
      collectionsCache.events = res.events;
      list.innerHTML = '';

      if (res.events.length === 0) {
        list.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📅</div><p>कोई कार्यक्रम नहीं है। "Add Event" पर क्लिक करें।</p></div>';
        return;
      }

      res.events.forEach(ev => {
        const row = el('div', 'collection-row');
        const info = el('div', 'collection-row-info');
        info.appendChild(el('strong', '', ev.title || 'Untitled'));
        info.appendChild(el('div', 'collection-meta', `${formatDateShort(ev.event_date)} · ${escapeHtml(ev.venue || '')}`));
        if (ev.description) info.appendChild(el('p', 'collection-desc', ev.description));
        row.appendChild(info);

        const actions = el('div', 'collection-row-actions');
        const delBtn = el('button', 'btn btn-danger btn-small', '🗑️');
        delBtn.addEventListener('click', () => deleteEventItem(ev.id));
        actions.appendChild(delBtn);
        row.appendChild(actions);

        list.appendChild(row);
      });
    }
  }

  async function deleteEventItem(id) {
    const ok = await confirmDialog({ title: 'Delete event?', message: 'This will remove the event permanently.', okText: 'Delete' });
    if (!ok) return;
    const res = await apiRequest('/events/' + id + '/delete', 'DELETE');
    if (res.success) { showToast('Event deleted', 'success'); loadEventsList(); }
    else showToast('Delete failed', 'error');
  }

  // ============================================================
  // NEWS
  // ============================================================
  async function loadNewsList() {
    const list = document.getElementById('news-list');
    if (!list) return;

    const res = await apiRequest('/news', 'GET');
    if (res.success && res.news) {
      collectionsCache.news = res.news;
      list.innerHTML = '';

      if (res.news.length === 0) {
        list.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📰</div><p>कोई समाचार नहीं है। "Add News" पर क्लिक करें।</p></div>';
        return;
      }

      res.news.forEach(n => {
        const row = el('div', 'collection-row');
        const info = el('div', 'collection-row-info');
        info.appendChild(el('strong', '', n.headline || 'Untitled'));
        info.appendChild(el('div', 'collection-meta', formatDateShort(n.news_date)));
        if (n.content) info.appendChild(el('p', 'collection-desc', n.content));
        row.appendChild(info);

        const actions = el('div', 'collection-row-actions');
        const delBtn = el('button', 'btn btn-danger btn-small', '🗑️');
        delBtn.addEventListener('click', () => deleteNewsItem(n.id));
        actions.appendChild(delBtn);
        row.appendChild(actions);

        list.appendChild(row);
      });
    }
  }

  async function deleteNewsItem(id) {
    const ok = await confirmDialog({ title: 'Delete news item?', message: 'This will remove it permanently.', okText: 'Delete' });
    if (!ok) return;
    const res = await apiRequest('/news/' + id + '/delete', 'DELETE');
    if (res.success) { showToast('News deleted', 'success'); loadNewsList(); }
    else showToast('Delete failed', 'error');
  }

  // ============================================================
  // ADS
  // ============================================================
  async function loadAdsList() {
    const list = document.getElementById('ads-list');
    if (!list) return;

    const res = await apiRequest('/ads', 'GET');
    if (res.success && res.ads) {
      collectionsCache.ads = res.ads;
      list.innerHTML = '';

      if (res.ads.length === 0) {
        list.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">📢</div><p>कोई विज्ञापन नहीं है। "Add Ad" पर क्लिक करें।</p></div>';
        return;
      }

      res.ads.forEach(a => {
        const row = el('div', 'collection-row');
        const info = el('div', 'collection-row-info');
        info.appendChild(el('strong', '', a.title || 'Untitled'));
        info.appendChild(el('div', 'collection-meta', `Position: ${escapeHtml(a.position || 'top')}`));
        if (a.content) info.appendChild(el('p', 'collection-desc', a.content));
        row.appendChild(info);

        const actions = el('div', 'collection-row-actions');
        const delBtn = el('button', 'btn btn-danger btn-small', '🗑️');
        delBtn.addEventListener('click', () => deleteAdItem(a.id));
        actions.appendChild(delBtn);
        row.appendChild(actions);

        list.appendChild(row);
      });
    }
  }

  async function deleteAdItem(id) {
    const ok = await confirmDialog({ title: 'Delete advertisement?', message: 'This will remove it permanently.', okText: 'Delete' });
    if (!ok) return;
    const res = await apiRequest('/ads/' + id + '/delete', 'DELETE');
    if (res.success) { showToast('Ad deleted', 'success'); loadAdsList(); }
    else showToast('Delete failed', 'error');
  }

  // ============================================================
  // TEAM
  // ============================================================
  async function loadTeamList() {
    const grid = document.getElementById('team-grid');
    if (!grid) return;

    const res = await apiRequest('/team', 'GET');
    if (res.success && res.members) {
      collectionsCache.team = res.members;
      grid.innerHTML = '';

      if (res.members.length === 0) {
        grid.innerHTML = '<div class="collection-empty"><div class="collection-empty-icon">👑</div><p>कोई टीम सदस्य नहीं है। "Add Member" पर क्लिक करें।</p></div>';
        return;
      }

      res.members.forEach(t => {
        const card = el('div', 'collection-card team-card-admin');
        const imgWrap = el('div', 'collection-image');
        if (t.photo_key) {
          const img = document.createElement('img');
          img.alt = t.name || '';
          imgWrap.appendChild(img);
          setTimeout(() => fetchPhotoInto(img, t.photo_key), 0);
        } else {
          imgWrap.innerHTML = '<div class="photo-placeholder">👤</div>';
        }
        card.appendChild(imgWrap);

        const info = el('div', 'collection-info');
        info.appendChild(el('strong', '', t.name || 'Unnamed'));
        if (t.role) info.appendChild(el('p', 'collection-caption', t.role));
        if (t.bio) info.appendChild(el('p', 'collection-desc', t.bio));
        card.appendChild(info);

        const delBtn = el('button', 'btn btn-danger btn-small', '🗑️ Delete');
        delBtn.addEventListener('click', () => deleteTeamMember(t.id));
        card.appendChild(delBtn);

        grid.appendChild(card);
      });
    }
  }

  async function deleteTeamMember(id) {
    const ok = await confirmDialog({ title: 'Delete team member?', message: 'This will remove them from the site.', okText: 'Delete' });
    if (!ok) return;
    const res = await apiRequest('/team/' + id + '/delete', 'DELETE');
    if (res.success) { showToast('Team member deleted', 'success'); loadTeamList(); }
    else showToast('Delete failed', 'error');
  }

  // ============================================================
  // CONTENT (Site text)
  // ============================================================
  async function loadSiteContent() {
    const editor = document.getElementById('content-editor');
    if (!editor) return;

    const res = await apiRequest('/content', 'GET');
    if (res.success) {
      contentCache = res.content || {};

      editor.innerHTML = `
        <div class="content-field">
          <label>Organization Name</label>
          <input type="text" id="c-org-name" value="${escapeHtml(contentCache.org?.name || '')}">
        </div>
        <div class="content-field">
          <label>Tagline</label>
          <input type="text" id="c-org-tagline" value="${escapeHtml(contentCache.org?.topbar || '')}">
        </div>
        <div class="content-field">
          <label>About Section Text</label>
          <textarea id="c-about" rows="4">${escapeHtml(contentCache.about?.description || '')}</textarea>
        </div>
        <div class="content-actions">
          <button class="btn btn-primary" id="content-save-btn" type="button">💾 Save Changes</button>
        </div>
      `;

      document.getElementById('content-save-btn').addEventListener('click', saveSiteContent);
    } else {
      editor.innerHTML = '<p class="text-muted">Failed to load content.</p>';
    }
  }

  async function saveSiteContent() {
    const updated = JSON.parse(JSON.stringify(contentCache || {}));
    updated.org = updated.org || {};
    updated.about = updated.about || {};

    updated.org.name = document.getElementById('c-org-name').value.trim();
    updated.org.topbar = document.getElementById('c-org-tagline').value.trim();
    updated.about.description = document.getElementById('c-about').value.trim();

    const res = await apiRequest('/content/update', 'POST', { content: updated });
    if (res.success) {
      contentCache = updated;
      showToast('Content saved', 'success');
      loadActivityFeed();
    } else {
      showToast('Save failed', 'error');
    }
  }

  // ============================================================
  // SETTINGS: 2FA STATUS
  // ============================================================
  async function check2FAStatus() {
    const statusText = document.getElementById('2fa-status-text');
    if (!statusText) return;

    const res = await apiRequest('/2fa/status', 'GET');
    if (res.success) {
      statusText.textContent = res.enabled ? '2FA is enabled ✅' : '2FA is not enabled ⚠️';
    }
  }

  // ============================================================
  // WIRE UP TOOLBAR BUTTONS
  // ============================================================
  function initToolbar() {
    document.getElementById('members-refresh')?.addEventListener('click', loadMembersList);
    document.getElementById('member-search')?.addEventListener('input', debounce(loadMembersList, 300));
    document.getElementById('member-status-filter')?.addEventListener('change', loadMembersList);
    document.getElementById('members-export')?.addEventListener('click', exportMembersCsv);

    document.getElementById('gallery-add-btn')?.addEventListener('click', () => showToast('Add photo — coming next step', 'info'));
    document.getElementById('slider-add-btn')?.addEventListener('click', () => showToast('Add slide — coming next step', 'info'));
    document.getElementById('events-add-btn')?.addEventListener('click', () => showToast('Add event — coming next step', 'info'));
    document.getElementById('news-add-btn')?.addEventListener('click', () => showToast('Add news — coming next step', 'info'));
    document.getElementById('ads-add-btn')?.addEventListener('click', () => showToast('Add ad — coming next step', 'info'));
    document.getElementById('team-add-btn')?.addEventListener('click', () => showToast('Add team member — coming next step', 'info'));

    document.getElementById('modal-close')?.addEventListener('click', closeModal);
    document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  // ============================================================
  // CSV EXPORT
  // ============================================================
  function exportMembersCsv() {
    if (!membersCache.length) {
      showToast('No data to export', 'info');
      return;
    }

    const headers = ['ID', 'Member ID', 'Name', 'Father Name', 'Address', 'District', 'State', 'Mobile', 'Aadhaar Last 4', 'Status', 'Submitted At'];
    const rows = membersCache.map(m => [
      m.id, m.member_id || '', m.name || '', m.father_name || '', m.address || '',
      m.district || '', m.state || '', m.mobile || '',
      m.aadhaar_last4 || '', m.status || '', m.submitted_at || '',
    ]);

    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };

    const csv = '\uFEFF' + [headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'karni_sena_members_' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    showToast('CSV exported', 'success');
  }

  // ============================================================
  // INITIALIZATION
  // ============================================================
  document.addEventListener('DOMContentLoaded', () => {
    loadSession();
    initLoginFlow();
    initToolbar();

    if (session && session.token) {
      verifyAndOpenDashboard();
    } else {
      showScreen('login-screen');
    }
  });

  // ============================================================
  // EXPORT GLOBAL HELPERS (for inline onclick if needed)
  // ============================================================
  window.deleteMember = deleteMember;

})();
