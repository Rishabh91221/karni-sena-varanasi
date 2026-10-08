/* ============================================================
   KARNI SENA VARANASI — Main Script
   Renders all sections, manages slider, mobile drawer, form.
   ============================================================ */

(function () {
  'use strict';

  // ============ HELPERS ============
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => root.querySelectorAll(sel);

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.textContent = value;
  }

  function setAttr(id, attr, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.setAttribute(attr, value);
  }

  function el(tag, className, html) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ============ LOAD CONTENT ============
  async function loadContent() {
    try {
      const res = await fetch('/content.json?v=' + Date.now());
      if (!res.ok) throw new Error('content.json not found');
      return await res.json();
    } catch (err) {
      console.error('[main.js] Content load error:', err);
      return null;
    }
  }

  // ============================================================
  // RENDER: HEADER + DRAWER
  // ============================================================
  function renderHeader(data) {
    setText('topbar-text', data.org.topbar);
    setText('brand-name', data.org.name);
    setText('brand-subtitle', data.org.subtitle);
    setAttr('brand-logo', 'src', data.org.logo);
    setAttr('header-cta', 'href', data.header.ctaLink);
    setText('header-cta', data.header.ctaText);

    // Desktop nav
    const navList = document.getElementById('nav-list');
    if (navList && data.header.navItems) {
      navList.innerHTML = '';
      data.header.navItems.forEach(item => {
        const li = el('li');
        const a = el('a', '', escapeHtml(item.label));
        a.href = item.link;
        a.dataset.section = item.id;
        li.appendChild(a);
        navList.appendChild(li);
      });
    }

    // Mobile drawer nav
    const drawerList = document.getElementById('drawer-list');
    if (drawerList && data.header.navItems) {
      drawerList.innerHTML = '';
      data.header.navItems.forEach(item => {
        const li = el('li');
        const a = el('a', '', escapeHtml(item.label));
        a.href = item.link;
        a.dataset.section = item.id;
        li.appendChild(a);
        drawerList.appendChild(li);
      });
    }

    setText('drawer-org-name', data.org.name);
    setText('drawer-cta', data.header.ctaText);
    setAttr('drawer-cta', 'href', data.header.ctaLink);

    document.title = data.org.name + ' — वाराणसी';
  }

  // ============================================================
  // RENDER: HERO SLIDER
  // ============================================================
  function renderHero(data) {
    const slider = document.getElementById('hero-slider');
    const dotsEl = document.getElementById('hero-dots');
    if (!slider || !dotsEl) return;

    const slides = data.hero.slides || [];
    if (slides.length === 0) return;

    slider.innerHTML = '';
    dotsEl.innerHTML = '';

    slides.forEach((slide, i) => {
      // Background slide
      const div = el('div', 'hero-slide' + (i === 0 ? ' active' : ''));
      div.style.backgroundImage = `url('${slide.image}')`;
      slider.appendChild(div);

      // Dot
      const dot = el('button', 'hero-dot' + (i === 0 ? ' active' : ''));
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dot.addEventListener('click', () => goToSlide(i));
      dotsEl.appendChild(dot);
    });

    // Update text for first slide
    updateHeroText(slides[0]);

    // Buttons
    setText('hero-primary', data.hero.primaryButton);
    setAttr('hero-primary', 'href', data.hero.primaryLink);
    setText('hero-secondary', data.hero.secondaryButton);
    setAttr('hero-secondary', 'href', data.hero.secondaryLink);

    // Auto-rotate
    let current = 0;
    let timer = null;

    function goToSlide(n) {
      current = n;
      const slideEls = $$('.hero-slide');
      const dots = $$('.hero-dot');
      slideEls.forEach((s, i) => s.classList.toggle('active', i === n));
      dots.forEach((d, i) => d.classList.toggle('active', i === n));
      updateHeroText(slides[n]);
    }

    function next() {
      goToSlide((current + 1) % slides.length);
    }

    function start() { stop(); timer = setInterval(next, 6000); }
    function stop() { if (timer) clearInterval(timer); timer = null; }

    start();

    // Pause on hover (desktop)
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
  }

  function updateHeroText(slide) {
    const t = document.getElementById('hero-title');
    const s = document.getElementById('hero-subtitle');
    const d = document.getElementById('hero-desc');
    if (t) { t.textContent = slide.title; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = ''; }
    if (s) { s.textContent = slide.subtitle; }
    if (d) { d.textContent = slide.description; }
  }

  // ============================================================
  // RENDER: ABOUT
  // ============================================================
  function renderAbout(data) {
    setText('about-title', data.about.title);
    setText('about-subtitle', data.about.subtitle);
    setText('about-desc', data.about.description);

    const paraWrap = document.getElementById('about-paragraphs');
    if (paraWrap && data.about.paragraphs) {
      paraWrap.innerHTML = '';
      data.about.paragraphs.forEach(p => {
        paraWrap.appendChild(el('p', '', escapeHtml(p)));
      });
    }

    const statsWrap = document.getElementById('about-stats');
    if (statsWrap && data.about.stats) {
      statsWrap.innerHTML = '';
      data.about.stats.forEach(s => {
        const stat = el('div', 'about-stat');
        stat.innerHTML =
          `<div class="about-stat-value">${escapeHtml(s.value)}</div>` +
          `<div class="about-stat-label">${escapeHtml(s.label)}</div>`;
        statsWrap.appendChild(stat);
      });
    }
  }

  // ============================================================
  // RENDER: AGENDA
  // ============================================================
  function renderAgenda(data) {
    setText('agenda-title', data.agenda.title);
    setText('agenda-subtitle', data.agenda.subtitle);
    setText('agenda-desc', data.agenda.description);

    const grid = document.getElementById('agenda-grid');
    if (!grid) return;
    grid.innerHTML = '';
    (data.agenda.items || []).forEach(item => {
      const card = el('div', 'agenda-card');
      card.innerHTML =
        `<div class="agenda-icon">${escapeHtml(item.icon || '•')}</div>` +
        `<h3>${escapeHtml(item.title)}</h3>` +
        `<p>${escapeHtml(item.text)}</p>`;
      grid.appendChild(card);
    });
  }

  // ============================================================
  // RENDER: HEAD OF REGION
  // ============================================================
  function renderHeadOfRegion(data) {
    const h = data.headOfRegion;
    if (!h) return;
    setText('head-title', h.title);
    setText('head-subtitle', h.subtitle);

    const card = document.getElementById('head-card');
    if (!card) return;

    card.innerHTML =
      '<div class="head-photo-wrap">' +
        `<img class="head-photo" src="${escapeHtml(h.photo)}" alt="${escapeHtml(h.name)}" ` +
          'onerror="this.style.display=\'none\'; this.parentElement.innerHTML=\'<div style=\\\'color:rgba(255,255,255,0.4);font-size:4rem;display:flex;align-items:center;justify-content:center;height:100%;\\\'>👤</div>\';">' +
      '</div>' +
      '<div class="head-info">' +
        `<div class="head-name">${escapeHtml(h.name)}</div>` +
        `<div class="head-role">${escapeHtml(h.role)}</div>` +
        `<p class="head-message">"${escapeHtml(h.message)}"</p>` +
        (h.phone ? `<a class="head-phone" href="tel:${escapeHtml(h.phone)}">📞 ${escapeHtml(h.phone)}</a>` : '') +
      '</div>';
  }

  // ============================================================
  // RENDER: TEAM
  // ============================================================
  function renderTeam(data) {
    setText('team-title', data.team.title);
    setText('team-subtitle', data.team.subtitle);
    setText('team-desc', data.team.description);

    const grid = document.getElementById('team-grid');
    if (!grid) return;
    grid.innerHTML = '';

    (data.team.members || []).forEach(m => {
      const card = el('div', 'team-card');
      card.innerHTML =
        `<img class="team-photo" src="${escapeHtml(m.photo)}" alt="${escapeHtml(m.name)}" ` +
          'onerror="this.style.background=\'#F5E9D0\'; this.src=\'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text x=%2250%22 y=%2255%22 font-size=%2240%22 text-anchor=%22middle%22 fill=%22%23C6600F%22>👤</text></svg>\';">' +
        '<div class="team-info">' +
          `<h3>${escapeHtml(m.name)}</h3>` +
          `<div class="team-role">${escapeHtml(m.role)}</div>` +
          `<p class="team-bio">${escapeHtml(m.bio)}</p>` +
          (m.phone ? `<a class="team-phone" href="tel:${escapeHtml(m.phone)}">📞 ${escapeHtml(m.phone)}</a>` : '') +
        '</div>';
      grid.appendChild(card);
    });
  }

  // ============================================================
  // RENDER: ACTIVITY
  // ============================================================
  function renderActivity(data) {
    setText('activity-title', data.activity.title);
    setText('activity-subtitle', data.activity.subtitle);
    setText('activity-desc', data.activity.description);

    const list = document.getElementById('activity-list');
    if (!list) return;
    list.innerHTML = '';
    (data.activity.items || []).forEach(item => {
      const div = el('div', 'timeline-item');
      div.innerHTML =
        `<span class="timeline-date">${escapeHtml(item.date)}</span>` +
        `<h3 class="timeline-title">${escapeHtml(item.title)}</h3>` +
        `<p class="timeline-text">${escapeHtml(item.text)}</p>`;
      list.appendChild(div);
    });
  }

  // ============================================================
  // RENDER: NEWS
  // ============================================================
  function renderNews(data) {
    setText('news-title', data.news.title);
    setText('news-subtitle', data.news.subtitle);
    setText('news-desc', data.news.description);

    const list = document.getElementById('news-list');
    if (!list) return;
    list.innerHTML = '';
    (data.news.items || []).forEach(item => {
      const card = el('div', 'news-card');
      card.innerHTML =
        `<div class="news-date">${escapeHtml(item.date)}</div>` +
        `<h3 class="news-title">${escapeHtml(item.title)}</h3>` +
        `<p class="news-text">${escapeHtml(item.text)}</p>`;
      list.appendChild(card);
    });
  }

  // ============================================================
  // RENDER: GALLERY
  // ============================================================
  function renderGallery(data) {
    setText('gallery-title', data.gallery.title);
    setText('gallery-subtitle', data.gallery.subtitle);
    setText('gallery-desc', data.gallery.description);

    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const images = data.gallery.images || [];
    if (images.length === 0) {
      grid.innerHTML =
        '<div class="gallery-empty">' +
          '<div class="gallery-empty-icon">📷</div>' +
          '<p>अभी कोई फ़ोटो उपलब्ध नहीं है।</p>' +
        '</div>';
      return;
    }

    images.forEach(img => {
      const item = el('div', 'gallery-item');
      item.innerHTML =
        `<img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.caption || '')}" loading="lazy" ` +
          'onerror="this.style.display=\'none\'; this.parentElement.style.display=\'none\';">' +
        (img.caption ? `<div class="gallery-caption">${escapeHtml(img.caption)}</div>` : '');
      grid.appendChild(item);
    });
  }

  // ============================================================
  // RENDER: OFFICE
  // ============================================================
  function renderOffice(data) {
    setText('office-title', data.office.title);
    setText('office-subtitle', data.office.subtitle);

    const card = document.getElementById('office-card');
    if (!card) return;

    let phonesHtml = '';
    (data.office.phones || []).forEach(p => {
      phonesHtml += `<a class="office-phone-link" href="tel:${escapeHtml(p)}">📞 ${escapeHtml(p)}</a>`;
    });

    card.innerHTML =
      '<div class="office-icon-wrap">🏛️</div>' +
      '<div class="office-info">' +
        `<h3>${escapeHtml(data.office.name)}</h3>` +
        `<p>${escapeHtml(data.office.addressLine1)}</p>` +
        `<p>${escapeHtml(data.office.addressLine2)}</p>` +
        `<div class="office-hours">🕒 ${escapeHtml(data.office.hours)}</div>` +
        `<div class="office-phones">${phonesHtml}</div>` +
        `<p class="office-note">${escapeHtml(data.office.note)}</p>` +
      '</div>';
  }

  // ============================================================
  // RENDER: JOIN FORM header
  // ============================================================
  function renderJoinForm(data) {
    const f = data.joinForm;
    setText('join-title', f.title);
    setText('join-subtitle', f.subtitle);
    setText('join-desc', f.description);
    setText('form-card-title', f.cardTitle);
    setText('form-card-subtitle', f.cardSubtitle);
    setText('form-card-desc', f.cardDescription);
    setText('form-help-title', f.helpTitle);
    setText('consent-text', f.consentText);
    setText('submit-btn', f.submitText);
    setText('reset-btn', f.resetText);

    const list = document.getElementById('form-card-list');
    if (list) {
      list.innerHTML = '';
      (f.cardList || []).forEach(item => {
        const li = el('li', '', escapeHtml(item));
        list.appendChild(li);
      });
    }

    const phonesWrap = document.getElementById('form-help-phones');
    if (phonesWrap) {
      phonesWrap.innerHTML = '';
      (f.helpPhones || []).forEach(p => {
        const a = el('a', '', escapeHtml(p));
        a.href = 'tel:' + p;
        phonesWrap.appendChild(a);
        phonesWrap.appendChild(el('br'));
      });
    }
  }

  // ============================================================
  // RENDER: CONTACT
  // ============================================================
  function renderContact(data) {
    setText('contact-title', data.contact.title);
    setText('contact-subtitle', data.contact.subtitle);
    setText('contact-desc', data.contact.description);

    const grid = document.getElementById('contact-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Phone cards
    (data.contact.phones || []).forEach(phone => {
      const card = el('div', 'contact-card');
      card.innerHTML =
        '<div class="contact-icon">📞</div>' +
        '<h4>फ़ोन</h4>' +
        `<a href="tel:${escapeHtml(phone)}">${escapeHtml(phone)}</a>`;
      grid.appendChild(card);
    });

    // Address
    if (data.contact.address) {
      const card = el('div', 'contact-card');
      card.innerHTML =
        '<div class="contact-icon">📍</div>' +
        '<h4>पता</h4>' +
        `<p>${escapeHtml(data.contact.address)}</p>`;
      grid.appendChild(card);
    }

    // Email if present
    if (data.contact.email) {
      const card = el('div', 'contact-card');
      card.innerHTML =
        '<div class="contact-icon">✉️</div>' +
        '<h4>ईमेल</h4>' +
        `<a href="mailto:${escapeHtml(data.contact.email)}">${escapeHtml(data.contact.email)}</a>`;
      grid.appendChild(card);
    }
  }

  // ============================================================
  // RENDER: FOOTER
  // ============================================================
  function renderFooter(data) {
    setText('footer-name', data.org.name + ' — वाराणसी');
    setText('footer-tagline', data.footer.tagline);
    setText('footer-copy', data.footer.copyright);

    const linksList = document.getElementById('footer-quick-links');
    if (linksList && data.footer.quickLinks) {
      linksList.innerHTML = '';
      data.footer.quickLinks.forEach(l => {
        const li = el('li');
        const a = el('a', '', escapeHtml(l.label));
        a.href = l.link;
        li.appendChild(a);
        linksList.appendChild(li);
      });
    }

    const contactDiv = document.getElementById('footer-contact');
    if (contactDiv) {
      contactDiv.innerHTML = '';
      (data.contact.phones || []).forEach(p => {
        const a = el('a', '', '📞 ' + escapeHtml(p));
        a.href = 'tel:' + p;
        contactDiv.appendChild(a);
      });
      if (data.contact.address) {
        const p = el('p', '', '📍 ' + escapeHtml(data.contact.address));
        p.style.fontFamily = 'var(--font-hi)';
        p.style.fontSize = '0.88rem';
        p.style.opacity = '0.85';
        p.style.marginTop = '0.5rem';
        contactDiv.appendChild(p);
      }
    }
  }

  // ============================================================
  // MOBILE DRAWER
  // ============================================================
  function setupDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const openBtn = document.getElementById('hamburger');
    const closeBtn = document.getElementById('drawer-close');

    if (!drawer || !overlay) return;

    function openDrawer() {
      drawer.classList.add('open');
      overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
      drawer.classList.remove('open');
      overlay.classList.remove('active');
      document.body.style.overflow = '';
    }

    if (openBtn) openBtn.addEventListener('click', openDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    // Close when a link is clicked
    $$('#drawer-list a').forEach(a => a.addEventListener('click', closeDrawer));
    const drawerCta = document.getElementById('drawer-cta');
    if (drawerCta) drawerCta.addEventListener('click', closeDrawer);

    // ESC closes
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

  // ============================================================
  // ACTIVE NAV HIGHLIGHT
  // ============================================================
  function setupScrollSpy() {
    const sections = $$('main section[id]');
    const navLinks = $$('.main-nav a, .drawer-nav a');
    if (!sections.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach(a => {
            a.classList.toggle('active', a.dataset.section === id);
          });
        }
      });
    }, { rootMargin: '-40% 0px -50% 0px', threshold: 0 });

    sections.forEach(s => observer.observe(s));
  }

  // ============================================================
  // FORM VALIDATION
  // ============================================================
  const form = document.getElementById('joining-form');
  const statusEl = document.getElementById('form-status');

  function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const wrap = field.closest('.field');
    if (wrap) wrap.classList.add('has-error');
    const errEl = document.querySelector(`.error[data-for="${fieldId}"]`);
    if (errEl) errEl.textContent = message;
  }

  function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const wrap = field.closest('.field');
    if (wrap) wrap.classList.remove('has-error');
    const errEl = document.querySelector(`.error[data-for="${fieldId}"]`);
    if (errEl) errEl.textContent = '';
  }

  function clearAllErrors() {
    $$('.field').forEach(f => f.classList.remove('has-error'));
    $$('.error').forEach(e => e.textContent = '');
  }

  function validateForm() {
    clearAllErrors();
    let ok = true;

    const required = [
      { id: 'candidate_name', msg: 'कृपया उम्मीदवार का नाम भरें।' },
      { id: 'father_name',    msg: 'कृपया पिता का नाम भरें।' },
      { id: 'address',        msg: 'कृपया पता भरें।' },
      { id: 'district',       msg: 'कृपया जिला भरें।' },
      { id: 'state',          msg: 'कृपया राज्य भरें।' },
    ];

    required.forEach(({ id, msg }) => {
      const e = document.getElementById(id);
      if (!e || !e.value.trim()) { showError(id, msg); ok = false; }
    });

    const mobile = document.getElementById('mobile');
    if (mobile) {
      const v = mobile.value.trim();
      if (!v) { showError('mobile', 'कृपया मोबाइल नंबर भरें।'); ok = false; }
      else if (!/^[6-9]\d{9}$/.test(v)) { showError('mobile', 'कृपया 10 अंकों का वैध मोबाइल नंबर भरें।'); ok = false; }
    }

    const aadhaar = document.getElementById('aadhaar');
    if (aadhaar) {
      const v = aadhaar.value.trim();
      if (!v) { showError('aadhaar', 'कृपया आधार नंबर भरें।'); ok = false; }
      else if (!/^\d{12}$/.test(v)) { showError('aadhaar', 'कृपया 12 अंकों का वैध आधार नंबर भरें।'); ok = false; }
    }

    const photo = document.getElementById('photo');
    if (photo) {
      if (!photo.files || !photo.files.length) {
        showError('photo', 'कृपया उम्मीदवार की फोटो अपलोड करें।'); ok = false;
      } else {
        const file = photo.files[0];
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) { showError('photo', 'केवल JPG, PNG या WebP फाइल स्वीकार्य है।'); ok = false; }
        else if (file.size > 5 * 1024 * 1024) { showError('photo', 'फोटो का आकार 5MB से कम होना चाहिए।'); ok = false; }
      }
    }

    const consent = document.getElementById('consent');
    if (consent && !consent.checked) { showError('consent', 'कृपया सहमति जाँचें।'); ok = false; }

    return ok;
  }

  // ============================================================
  // PHOTO PREVIEW
  // ============================================================
  function setupPhotoPreview() {
    const input = document.getElementById('photo');
    const preview = document.getElementById('photo-preview');
    const drop = document.getElementById('photo-drop');
    if (!input || !preview || !drop) return;

    input.addEventListener('change', () => {
      clearError('photo');
      const file = input.files && input.files[0];
      preview.innerHTML = '';
      if (!file) { preview.style.display = 'none'; return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" alt="preview">`;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    ['dragenter', 'dragover'].forEach(evt => {
      drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(evt => {
      drop.addEventListener(evt, e => { e.preventDefault(); drop.classList.remove('dragover'); });
    });
    drop.addEventListener('drop', e => {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

  // ============================================================
  // FORM SUBMIT
  // ============================================================
  function setupFormSubmit(content) {
    if (!form) return;
    const endpoint = (content && content.formEndpoint) ? content.formEndpoint : '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!validateForm()) {
        showStatus('कृपया सभी आवश्यक फ़ील्ड सही-सही भरें।', 'error-msg');
        const firstErr = document.querySelector('.field.has-error');
        if (firstErr) firstErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }

      if (!endpoint || endpoint.indexOf('REPLACE_WITH') === 0) {
        showStatus('बैकएंड कॉन्फ़िगर नहीं है। कृपया व्यवस्थापक से संपर्क करें।', 'error-msg');
        return;
      }

      const submitBtn = document.getElementById('submit-btn');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = 'भेजा जा रहा है...';
      showStatus('आपका आवेदन भेजा जा रहा है...', '');

      try {
        const photoInput = document.getElementById('photo');
        let photoFile = photoInput && photoInput.files ? photoInput.files[0] : null;

        if (photoFile && window.KSImageCompressor) {
          try {
            photoFile = await window.KSImageCompressor.compressImage(photoFile, {
              maxWidth: 1600, maxHeight: 1600, quality: 0.82,
            });
          } catch (ce) { console.warn('Compression failed:', ce); }
        }

        const fd = new FormData();
        fd.append('candidate_name', document.getElementById('candidate_name').value.trim());
        fd.append('father_name',    document.getElementById('father_name').value.trim());
        fd.append('address',        document.getElementById('address').value.trim());
        fd.append('district',       document.getElementById('district').value.trim());
        fd.append('state',          document.getElementById('state').value.trim());
        fd.append('mobile',         document.getElementById('mobile').value.trim());
        fd.append('aadhaar',        document.getElementById('aadhaar').value.trim());
        fd.append('additional',     (document.getElementById('additional').value || '').trim());
        if (photoFile) fd.append('photo', photoFile, photoFile.name || 'photo.jpg');

        const response = await fetch(endpoint, { method: 'POST', body: fd });
        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) throw new Error(result.error || 'Server error');

        showStatus('आपका आवेदन सफलतापूर्वक जमा हो गया है।', 'success');
        form.reset();
        const preview = document.getElementById('photo-preview');
        if (preview) preview.innerHTML = '';

        setTimeout(() => {
          window.location.href = '/thank-you.html?id=' + (result.submissionId || '');
        }, 1200);

      } catch (err) {
        console.error('[submit]', err);
        showStatus('क्षमा करें, आवेदन जमा नहीं हो सका। कृपया दोबारा प्रयास करें। (' + (err.message || 'error') + ')', 'error-msg');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    $$('#joining-form input, #joining-form textarea').forEach(el => {
      el.addEventListener('input', () => clearError(el.id));
      el.addEventListener('change', () => clearError(el.id));
    });

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        clearAllErrors();
        showStatus('', '');
        const preview = document.getElementById('photo-preview');
        if (preview) preview.innerHTML = '';
      });
    }
  }

  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'form-status' + (message ? ' show ' + (type || '') : '');
  }

  // ============================================================
  // INIT
  // ============================================================
  document.addEventListener('DOMContentLoaded', async () => {
    const content = await loadContent();
    if (!content) {
      console.warn('[main.js] No content loaded');
      return;
    }

    renderHeader(content);
    renderHero(content);
    renderAbout(content);
    renderAgenda(content);
    renderHeadOfRegion(content);
    renderTeam(content);
    renderActivity(content);
    renderNews(content);
    renderGallery(content);
    renderOffice(content);
    renderJoinForm(content);
    renderContact(content);
    renderFooter(content);

    setupDrawer();
    setupScrollSpy();
    setupPhotoPreview();
    setupFormSubmit(content);
  });

})();
