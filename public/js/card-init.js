/* ============================================================
   KARNI SENA VARANASI — Card Page Interactions
   ============================================================ */

(function () {
  'use strict';

  // ============ ZOOM TOGGLE ============
  function setupZoom() {
    const btn = document.getElementById('zoom-btn');
    const front = document.getElementById('card-front-wrap');
    const back = document.getElementById('card-back-wrap');

    if (!btn || !front || !back) return;

    let zoomed = false;

    btn.addEventListener('click', function () {
      zoomed = !zoomed;
      front.classList.toggle('zoomed', zoomed);
      back.classList.toggle('zoomed', zoomed);
      btn.innerHTML = zoomed ? '🔍 Zoom Out' : '🔍 Zoom In';

      if (zoomed) {
        setTimeout(function () {
          front.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    });

    // ESC key resets zoom
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && zoomed) {
        zoomed = false;
        front.classList.remove('zoomed');
        back.classList.remove('zoomed');
        btn.innerHTML = '🔍 Zoom In';
      }
    });
  }

  // ============ PRINT BUTTON (robust) ============
  function setupPrint() {
    const btn = document.getElementById('print-btn');
    if (!btn) return;

    btn.addEventListener('click', function (e) {
      e.preventDefault();

      try {
        window.requestAnimationFrame(function () {
          setTimeout(function () {
            try {
              window.print();
            } catch (err) {
              showFallbackMessage();
            }
          }, 50);
        });
      } catch (err) {
        showFallbackMessage();
      }
    });

    function showFallbackMessage() {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMac = userAgent.indexOf('mac') !== -1;
      const isMobile = /android|iphone|ipad|ipod|mobile/i.test(userAgent);

      let shortcut = 'Ctrl + P';
      if (isMac) shortcut = 'Cmd + P';
      if (isMobile) shortcut = 'Share → Print';

      alert(
        'PDF में सेव करने के लिए:\n\n' +
        'Shortcut: ' + shortcut + '\n\n' +
        'To save as PDF:\n\n' +
        'Shortcut: ' + shortcut
      );
    }
  }

  // ============ INIT ============
  document.addEventListener('DOMContentLoaded', function () {
    setupZoom();
    setupPrint();
  });

})();
