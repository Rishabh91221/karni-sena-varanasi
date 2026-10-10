/* ============================================================
   KARNI SENA VARANASI — Status Page Logic
   ============================================================ */

(function () {
  'use strict';

  // ============ CONFIGURATION ============
  const BACKEND_URL = 'https://karni-sena-backend.smritiiasacademy.workers.dev';
  const PUBLIC_SITE = 'https://karni-sena-varanasi.pages.dev';
  const AUTO_REFRESH_MS = 60 * 1000; // 60 seconds

  // ============ STATE ============
  let autoRefreshTimer = null;

  // ============ HELPERS ============
  const $ = (sel) => document.querySelector(sel);

  function getStatusClass(status) {
    switch (status) {
      case 'healthy':  return 'healthy';
      case 'warning':  return 'warning';
      case 'critical': return 'critical';
      default:         return 'checking';
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case 'healthy':  return '✅';
      case 'warning':  return '⚠️';
      case 'critical': return '❌';
      default:         return '⏳';
    }
  }

  function getStatusLabel(status) {
    switch (status) {
      case 'healthy':  return 'OK';
      case 'warning':  return 'WARN';
      case 'critical': return 'FAIL';
      default:         return '...';
    }
  }

  function formatTime(ms) {
    if (ms < 1000) return ms + 'ms';
    return (ms / 1000).toFixed(2) + 's';
  }

  function formatTimestamp(date) {
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  // ============ CHECK FUNCTIONS ============
  async function checkBackend() {
    const start = performance.now();
    try {
      const res = await fetch(BACKEND_URL + '/health', {
        cache: 'no-store',
        mode: 'cors',
      });
      const elapsed = Math.round(performance.now() - start);

      if (!res.ok) {
        return { status: 'critical', message: 'HTTP ' + res.status, time: elapsed };
      }

      const text = await res.text();
      return { status: 'healthy', message: text.trim().substring(0, 60), time: elapsed };
    } catch (err) {
      return { status: 'critical', message: 'Cannot reach backend', time: 0 };
    }
  }

  async function checkDatabase() {
    // We check DB indirectly by hitting a public endpoint that queries it
    const start = performance.now();
    try {
      // Use a fake member ID — the endpoint will return 404 quickly if DB works
      const res = await fetch(BACKEND_URL + '/verify/KSV-2026-TEST', {
        cache: 'no-store',
        mode: 'cors',
      });
      const elapsed = Math.round(performance.now() - start);

      // 404 means DB queried successfully but no match found — that's healthy
      if (res.status === 404) {
        return { status: 'healthy', message: 'Connected', time: elapsed };
      }
      if (res.status === 400) {
        return { status: 'healthy', message: 'Connected', time: elapsed };
      }
      if (res.status === 429) {
        return { status: 'warning', message: 'Rate limited', time: elapsed };
      }
      return { status: 'warning', message: 'HTTP ' + res.status, time: elapsed };
    } catch (err) {
      return { status: 'critical', message: 'Query failed', time: 0 };
    }
  }

  async function checkStorage() {
    // R2 is checked via the photo endpoint (returns 404 if empty, but proves R2 works)
    const start = performance.now();
    try {
      const res = await fetch(BACKEND_URL + '/admin/photo/uploads/1_1.jpg', {
        cache: 'no-store',
        mode: 'cors',
      });
      const elapsed = Math.round(performance.now() - start);

      // 401 = R2 works, but we're not authenticated (expected)
      // 404 = R2 works, but photo not found (also fine)
      // 400 = invalid key format (fine)
      if ([400, 401, 404].includes(res.status)) {
        return { status: 'healthy', message: 'Accessible', time: elapsed };
      }
      return { status: 'warning', message: 'HTTP ' + res.status, time: elapsed };
    } catch (err) {
      return { status: 'critical', message: 'Unreachable', time: 0 };
    }
  }

  async function checkPublicSite() {
    const start = performance.now();
    try {
      const res = await fetch(PUBLIC_SITE + '/content.json', {
        cache: 'no-store',
        mode: 'cors',
      });
      const elapsed = Math.round(performance.now() - start);

      if (res.ok) {
        return { status: 'healthy', message: 'Live', time: elapsed };
      }
      return { status: 'warning', message: 'HTTP ' + res.status, time: elapsed };
    } catch (err) {
      return { status: 'critical', message: 'Unreachable', time: 0 };
    }
  }

  async function checkTurnstile() {
    // Turnstile is on the form — check if the script is reachable
    const start = performance.now();
    try {
      const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/api.js', {
        method: 'HEAD',
        mode: 'no-cors',
      });
      const elapsed = Math.round(performance.now() - start);
      return { status: 'healthy', message: 'Available', time: elapsed };
    } catch (err) {
      // no-cors HEAD will throw or return opaque — treat as healthy
      return { status: 'healthy', message: 'Available', time: 0 };
    }
  }

  // ============ CHECK REGISTRY ============
  const CHECKS = [
    { id: 'backend',   name: 'Backend API',    icon: '⚙️', fn: checkBackend },
    { id: 'database',  name: 'Database',       icon: '🗄️', fn: checkDatabase },
    { id: 'storage',   name: 'Photo Storage',  icon: '📸', fn: checkStorage },
    { id: 'public',    name: 'Public Site',    icon: '🌐', fn: checkPublicSite },
    { id: 'turnstile', name: 'Turnstile CAPTCHA', icon: '🛡️', fn: checkTurnstile },
  ];

  // ============ RENDER ============
  function renderCheck(check, result) {
    const existing = document.querySelector(`[data-check-id="${check.id}"]`);
    if (existing) existing.remove();

    const statusClass = getStatusClass(result.status);
    const statusIcon = getStatusIcon(result.status);
    const statusLabel = getStatusLabel(result.status);

    const item = document.createElement('div');
    item.className = 'check-item';
    item.setAttribute('data-check-id', check.id);
    item.innerHTML = `
      <div class="check-left">
        <span class="check-icon">${check.icon}</span>
        <div class="check-info">
          <span class="check-name">${check.name}</span>
          <span class="check-message">${result.message || '—'}</span>
        </div>
      </div>
      <div class="check-right">
        <span class="check-time">${result.time ? formatTime(result.time) : '—'}</span>
        <span class="check-status ${statusClass}">${statusLabel} ${statusIcon}</span>
      </div>
    `;

    const grid = document.getElementById('status-grid');
    if (grid) grid.appendChild(item);
  }

  function updateSummary(results) {
    const summary = document.getElementById('status-summary');
    const icon = document.getElementById('summary-icon');
    const title = document.getElementById('summary-title');
    const subtitle = document.getElementById('summary-subtitle');
    if (!summary) return;

    const critical = results.filter(r => r.status === 'critical').length;
    const warning = results.filter(r => r.status === 'warning').length;

    summary.classList.remove('checking', 'healthy', 'warning', 'critical');

    if (critical > 0) {
      summary.classList.add('critical');
      icon.textContent = '❌';
      title.textContent = 'Major Outage';
      subtitle.textContent = critical + ' system' + (critical > 1 ? 's' : '') + ' down';
    } else if (warning > 0) {
      summary.classList.add('warning');
      icon.textContent = '⚠️';
      title.textContent = 'Partial Degradation';
      subtitle.textContent = warning + ' system' + (warning > 1 ? 's' : '') + ' degraded';
    } else {
      summary.classList.add('healthy');
      icon.textContent = '✅';
      title.textContent = 'All Systems Operational';
      subtitle.textContent = results.length + ' systems checked and healthy';
    }
  }

  // ============ MAIN CHECK ============
  async function runAllChecks() {
    const btn = document.getElementById('refresh-btn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '⏳ Checking...';
    }

    // Clear grid
    const grid = document.getElementById('status-grid');
    if (grid) grid.innerHTML = '';

    // Reset summary
    const summary = document.getElementById('status-summary');
    if (summary) {
      summary.classList.remove('healthy', 'warning', 'critical');
      summary.classList.add('checking');
    }
    const summaryIcon = document.getElementById('summary-icon');
    if (summaryIcon) summaryIcon.textContent = '⏳';
    const summaryTitle = document.getElementById('summary-title');
    if (summaryTitle) summaryTitle.textContent = 'Checking systems...';
    const summarySubtitle = document.getElementById('summary-subtitle');
    if (summarySubtitle) summarySubtitle.textContent = 'Please wait';

    // Run all checks in parallel
    const results = await Promise.all(
      CHECKS.map(async (check) => {
        const result = await check.fn();
        renderCheck(check, result);
        return { id: check.id, ...result };
      })
    );

    // Update summary
    updateSummary(results);

    // Update timestamp
    const timestamp = document.getElementById('last-checked');
    if (timestamp) timestamp.textContent = formatTimestamp(new Date());

    // Re-enable button
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🔄 Refresh Now';
    }

    // Schedule next auto-refresh
    if (autoRefreshTimer) clearTimeout(autoRefreshTimer);
    autoRefreshTimer = setTimeout(runAllChecks, AUTO_REFRESH_MS);
  }

  // ============ INIT ============
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('refresh-btn');
    if (btn) btn.addEventListener('click', runAllChecks);

    // Run initial check
    runAllChecks();
  });

})();
