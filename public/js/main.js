/* ============================================================
   KARNI SENA VARANASI — Main Script (Secured & Optimized)
   ============================================================ */

(function () {
  'use strict';

  // ============ DOM HELPERS ============
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => root.querySelectorAll(sel);

  function setText(id, value) {
    const node = document.getElementById(id);
    if (node && value != null) {
      node.textContent = String(value);
    }
  }

  function setAttr(id, attr, value) {
    const node = document.getElementById(id);
    if (node && value != null) {
      node.setAttribute(attr, String(value));
    }
  }

  function createElement(tag, className, textContent) {
    const elem = document.createElement(tag);
    if (className) elem.className = className;
    if (textContent != null) elem.textContent = String(textContent);
    return elem;
  }

  function sanitizeInput(val) {
    return typeof val === 'string' ? val.trim() : '';
  }

  // ============ LOAD CONTENT ============
  async function loadContent() {
    try {
      const res = await fetch('/content.json?v=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP error! status: ' + res.status);
      return await res.json();
    } catch (err) {
      console.error('[main.js] Content load error:', err);
      return null;
    }
  }

  // ============ RENDER FUNCTIONS ============
  function renderHeader(data) {
    if (!data.org || !data.header) return;

    setText('topbar-text', data.org.topbar);
    setText('brand-name', data.org.name);
    setText('brand-subtitle', data.org.subtitle);
    setAttr('brand-logo', 'src', data.org.logo);
    setAttr('header-cta', 'href', data.header.ctaLink);
    setText('header-cta', data.header.ctaText);

    const buildNav = (containerId) => {
      const container = document.getElementById(containerId);
      if (!container || !Array.isArray(data.header.navItems)) return;
      container.replaceChildren();

      data.header.navItems.forEach(item => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = item.label || '';
        a.href = item.link || '#';
        a.dataset.section = item.id || '';
        li.appendChild(a);
        container.appendChild(li);
      });
    };

    buildNav('nav-list');
    buildNav('drawer-list');

    setText('drawer-org-name', data.org.name);
    setText('drawer-cta', data.header.ctaText);
    setAttr('drawer-cta', 'href', data.header.ctaLink);

    document.title = (data.org.name || 'Karni Sena') + ' — वाराणसी';
  }

  function renderHero(data) {
    const slider = document.getElementById('hero-slider');
    const dotsEl = document.getElementById('hero-dots');
    if (!slider || !dotsEl || !data.hero) return;

    const slides = data.hero.slides || [];
    if (slides.length === 0) return;

    slider.replaceChildren();
    dotsEl.replaceChildren();

    slides.forEach((slide, i) => {
      const div = createElement('div', 'hero-slide' + (i === 0 ? ' active' : ''));
      div.style.backgroundImage = "url('" + encodeURI(slide.image || '') + "')";
      slider.appendChild(div);

      const dot = createElement('button', 'hero-dot' + (i === 0 ? ' active' : ''));
      dot.setAttribute('aria-label', 'Slide ' + (i + 1));
      dot.type = 'button';
      dot.addEventListener('click', () => goToSlide(i));
      dotsEl.appendChild(dot);
    });

    updateHeroText(slides[0]);

    setText('hero-primary', data.hero.primaryButton);
    setAttr('hero-primary', 'href', data.hero.primaryLink);
    setText('hero-secondary', data.hero.secondaryButton);
    setAttr('hero-secondary', 'href', data.hero.secondaryLink);

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

    function start() {
      stop();
      timer = setInterval(next, 6000);
    }

    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }

    start();
    slider.addEventListener('mouseenter', stop);
    slider.addEventListener('mouseleave', start);
  }

  function updateHeroText(slide) {
    if (!slide) return;
    const t = document.getElementById('hero-title');
    const s = document.getElementById('hero-subtitle');
    const d = document.getElementById('hero-desc');

    if (t) {
      t.textContent = slide.title || '';
      t.style.animation = 'none';
      void t.offsetWidth;
      t.style.animation = '';
    }
    if (s) s.textContent = slide.subtitle || '';
    if (d) d.textContent = slide.description || '';
  }

  function renderAbout(data) {
    if (!data.about) return;
    setText('about-title', data.about.title);
    setText('about-subtitle', data.about.subtitle);
    setText('about-desc', data.about.description);

    const paraWrap = document.getElementById('about-paragraphs');
    if (paraWrap && Array.isArray(data.about.paragraphs)) {
      paraWrap.replaceChildren();
      data.about.paragraphs.forEach(p => {
        paraWrap.appendChild(createElement('p', '', p));
      });
    }

    const statsWrap = document.getElementById('about-stats');
    if (statsWrap && Array.isArray(data.about.stats)) {
      statsWrap.replaceChildren();
      data.about.stats.forEach(s => {
        const stat = createElement('div', 'about-stat');
        const valDiv = createElement('div', 'about-stat-value', s.value);
        const lblDiv = createElement('div', 'about-stat-label', s.label);
        stat.appendChild(valDiv);
        stat.appendChild(lblDiv);
        statsWrap.appendChild(stat);
      });
    }
  }

  function renderAgenda(data) {
    if (!data.agenda) return;
    setText('agenda-title', data.agenda.title);
    setText('agenda-subtitle', data.agenda.subtitle);
    setText('agenda-desc', data.agenda.description);

    const grid = document.getElementById('agenda-grid');
    if (!grid) return;
    grid.replaceChildren();

    (data.agenda.items || []).forEach(item => {
      const card = createElement('div', 'agenda-card');
      const icon = createElement('div', 'agenda-icon', item.icon || '•');
      const h3 = createElement('h3', '', item.title);
      const p = createElement('p', '', item.text);

      card.appendChild(icon);
      card.appendChild(h3);
      card.appendChild(p);
      grid.appendChild(card);
    });
  }

  function renderHeadOfRegion(data) {
    const h = data.headOfRegion;
    if (!h) return;
    setText('head-title', h.title);
    setText('head-subtitle', h.subtitle);

    const card = document.getElementById('head-card');
    if (!card) return;
    card.replaceChildren();

    const photoWrap = createElement('div', 'head-photo-wrap');
    const img = document.createElement('img');
    img.className = 'head-photo';
    img.src = h.photo || '';
    img.alt = h.name || 'Leader Photo';
    img.onerror = function () {
      this.style.display = 'none';
      const fallback = createElement('div', '', '👤');
      fallback.style.cssText = 'color:rgba(255,255,255,0.4);font-size:4rem;display:flex;align-items:center;justify-content:center;height:100%;';
      photoWrap.appendChild(fallback);
    };
    photoWrap.appendChild(img);

    const info = createElement('div', 'head-info');
    info.appendChild(createElement('div', 'head-name', h.name));
    info.appendChild(createElement('div', 'head-role', h.role));
    info.appendChild(createElement('p', 'head-message', '"' + (h.message || '') + '"'));

    if (h.phone) {
      const phoneLink = createElement('a', 'head-phone', '📞 ' + h.phone);
      phoneLink.href = 'tel:' + encodeURIComponent(h.phone);
      info.appendChild(phoneLink);
    }

    card.appendChild(photoWrap);
    card.appendChild(info);
  }

  function renderTeam(data) {
    if (!data.team) return;
    setText('team-title', data.team.title);
    setText('team-subtitle', data.team.subtitle);
    setText('team-desc', data.team.description);

    const grid = document.getElementById('team-grid');
    if (!grid) return;
    grid.replaceChildren();

    (data.team.members || []).forEach(m => {
      const card = createElement('div', 'team-card');
      const img = document.createElement('img');
      img.className = 'team-photo';
      img.src = m.photo || '';
      img.alt = m.name || '';
      img.onerror = function () {
        this.style.background = '#F5E9D0';
        this.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="50" y="55" font-size="40" text-anchor="middle" fill="%23C6600F">👤</text></svg>';
      };

      const info = createElement('div', 'team-info');
      info.appendChild(createElement('h3', '', m.name));
      info.appendChild(createElement('div', 'team-role', m.role));
      info.appendChild(createElement('p', 'team-bio', m.bio));

      if (m.phone) {
        const phoneLink = createElement('a', 'team-phone', '📞 ' + m.phone);
        phoneLink.href = 'tel:' + encodeURIComponent(m.phone);
        info.appendChild(phoneLink);
      }

      card.appendChild(img);
      card.appendChild(info);
      grid.appendChild(card);
    });
  }

  function renderActivity(data) {
    if (!data.activity) return;
    setText('activity-title', data.activity.title);
    setText('activity-subtitle', data.activity.subtitle);
    setText('activity-desc', data.activity.description);

    const list = document.getElementById('activity-list');
    if (!list) return;
    list.replaceChildren();

    (data.activity.items || []).forEach(item => {
      const div = createElement('div', 'timeline-item');
      div.appendChild(createElement('span', 'timeline-date', item.date));
      div.appendChild(createElement('h3', 'timeline-title', item.title));
      div.appendChild(createElement('p', 'timeline-text', item.text));
      list.appendChild(div);
    });
  }

  function renderNews(data) {
    if (!data.news) return;
    setText('news-title', data.news.title);
    setText('news-subtitle', data.news.subtitle);
    setText('news-desc', data.news.description);

    const list = document.getElementById('news-list');
    if (!list) return;
    list.replaceChildren();

    (data.news.items || []).forEach(item => {
      const card = createElement('div', 'news-card');
      card.appendChild(createElement('div', 'news-date', item.date));
      card.appendChild(createElement('h3', 'news-title', item.title));
      card.appendChild(createElement('p', 'news-text', item.text));
      list.appendChild(card);
    });
  }

  function renderGallery(data) {
    if (!data.gallery) return;
    setText('gallery-title', data.gallery.title);
    setText('gallery-subtitle', data.gallery.subtitle);
    setText('gallery-desc', data.gallery.description);

    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.replaceChildren();

    const images = data.gallery.images || [];
    if (images.length === 0) {
      const empty = createElement('div', 'gallery-empty');
      empty.appendChild(createElement('div', 'gallery-empty-icon', '📷'));
      empty.appendChild(createElement('p', '', 'अभी कोई फ़ोटो उपलब्ध नहीं है।'));
      grid.appendChild(empty);
      return;
    }

    images.forEach(imgData => {
      const item = createElement('div', 'gallery-item');
      const img = document.createElement('img');
      img.src = imgData.src || '';
      img.alt = imgData.caption || '';
      img.loading = 'lazy';
      img.onerror = function () {
        item.style.display = 'none';
      };

      item.appendChild(img);
      if (imgData.caption) {
        item.appendChild(createElement('div', 'gallery-caption', imgData.caption));
      }
      grid.appendChild(item);
    });
  }

  function renderOffice(data) {
    if (!data.office) return;
    setText('office-title', data.office.title);
    setText('office-subtitle', data.office.subtitle);

    const card = document.getElementById('office-card');
    if (!card) return;
    card.replaceChildren();

    card.appendChild(createElement('div', 'office-icon-wrap', '🏛️'));

    const info = createElement('div', 'office-info');
    info.appendChild(createElement('h3', '', data.office.name));
    info.appendChild(createElement('p', '', data.office.addressLine1));
    info.appendChild(createElement('p', '', data.office.addressLine2));
    info.appendChild(createElement('div', 'office-hours', '🕒 ' + (data.office.hours || '')));

    const phonesDiv = createElement('div', 'office-phones');
    (data.office.phones || []).forEach(p => {
      const a = createElement('a', 'office-phone-link', '📞 ' + p);
      a.href = 'tel:' + encodeURIComponent(p);
      phonesDiv.appendChild(a);
    });
    info.appendChild(phonesDiv);

    info.appendChild(createElement('p', 'office-note', data.office.note));
    card.appendChild(info);
  }

  function renderJoinForm(data) {
    const f = data.joinForm;
    if (!f) return;
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
    if (list && Array.isArray(f.cardList)) {
      list.replaceChildren();
      f.cardList.forEach(item => {
        list.appendChild(createElement('li', '', item));
      });
    }

    const phonesWrap = document.getElementById('form-help-phones');
    if (phonesWrap && Array.isArray(f.helpPhones)) {
      phonesWrap.replaceChildren();
      f.helpPhones.forEach(p => {
        const a = createElement('a', '', p);
        a.href = 'tel:' + encodeURIComponent(p);
        phonesWrap.appendChild(a);
        phonesWrap.appendChild(document.createElement('br'));
      });
    }
  }

  function renderContact(data) {
    if (!data.contact) return;
    setText('contact-title', data.contact.title);
    setText('contact-subtitle', data.contact.subtitle);
    setText('contact-desc', data.contact.description);

    const grid = document.getElementById('contact-grid');
    if (!grid) return;
    grid.replaceChildren();

    (data.contact.phones || []).forEach(phone => {
      const card = createElement('div', 'contact-card');
      card.appendChild(createElement('div', 'contact-icon', '📞'));
      card.appendChild(createElement('h4', '', 'फ़ोन'));
      const a = createElement('a', '', phone);
      a.href = 'tel:' + encodeURIComponent(phone);
      card.appendChild(a);
      grid.appendChild(card);
    });

    if (data.contact.address) {
      const card = createElement('div', 'contact-card');
      card.appendChild(createElement('div', 'contact-icon', '📍'));
      card.appendChild(createElement('h4', '', 'पता'));
      card.appendChild(createElement('p', '', data.contact.address));
      grid.appendChild(card);
    }

    if (data.contact.email) {
      const card = createElement('div', 'contact-card');
      card.appendChild(createElement('div', 'contact-icon', '✉️'));
      card.appendChild(createElement('h4', '', 'ईमेल'));
      const a = createElement('a', '', data.contact.email);
      a.href = 'mailto:' + encodeURIComponent(data.contact.email);
      card.appendChild(a);
      grid.appendChild(card);
    }
  }

  function renderFooter(data) {
    if (!data.org || !data.footer) return;
    setText('footer-name', (data.org.name || '') + ' — वाराणसी');
    setText('footer-tagline', data.footer.tagline);
    setText('footer-copy', data.footer.copyright);

    const linksList = document.getElementById('footer-quick-links');
    if (linksList && Array.isArray(data.footer.quickLinks)) {
      linksList.replaceChildren();
      data.footer.quickLinks.forEach(l => {
        const li = document.createElement('li');
        const a = createElement('a', '', l.label);
        a.href = l.link || '#';
        li.appendChild(a);
        linksList.appendChild(li);
      });
    }

    const contactDiv = document.getElementById('footer-contact');
    if (contactDiv && data.contact) {
      contactDiv.replaceChildren();
      (data.contact.phones || []).forEach(p => {
        const a = createElement('a', '', '📞 ' + p);
        a.href = 'tel:' + encodeURIComponent(p);
        contactDiv.appendChild(a);
      });
      if (data.contact.address) {
        const p = createElement('p', '', '📍 ' + data.contact.address);
        p.style.fontFamily = 'var(--font-hi)';
        p.style.fontSize = '0.88rem';
        p.style.opacity = '0.85';
        p.style.marginTop = '0.5rem';
        contactDiv.appendChild(p);
      }
    }
  }

  // ============ CONTROLLERS ============
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

    $$('#drawer-list a').forEach(a => a.addEventListener('click', closeDrawer));
    const drawerCta = document.getElementById('drawer-cta');
    if (drawerCta) drawerCta.addEventListener('click', closeDrawer);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
    });
  }

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

  // ============ FORM HANDLING ============
  const form = document.getElementById('joining-form');
  const statusEl = document.getElementById('form-status');

  function showError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const wrap = field.closest('.field');
    if (wrap) wrap.classList.add('has-error');
    const errEl = document.querySelector('.error[data-for="' + fieldId + '"]');
    if (errEl) errEl.textContent = message;
  }

  function clearError(fieldId) {
    const field = document.getElementById(fieldId);
    if (!field) return;
    const wrap = field.closest('.field');
    if (wrap) wrap.classList.remove('has-error');
    const errEl = document.querySelector('.error[data-for="' + fieldId + '"]');
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
      if (!e || !sanitizeInput(e.value)) {
        showError(id, msg);
        ok = false;
      }
    });

    const mobile = document.getElementById('mobile');
    if (mobile) {
      const v = sanitizeInput(mobile.value);
      if (!v) {
        showError('mobile', 'कृपया मोबाइल नंबर भरें।');
        ok = false;
      } else if (!/^[6-9]\d{9}$/.test(v)) {
        showError('mobile', 'कृपया 10 अंकों का वैध मोबाइल नंबर भरें।');
        ok = false;
      }
    }

    const aadhaar = document.getElementById('aadhaar');
    if (aadhaar) {
      const v = sanitizeInput(aadhaar.value).replace(/\s+/g, '');
      if (!v) {
        showError('aadhaar', 'कृपया आधार नंबर भरें।');
        ok = false;
      } else if (!/^\d{12}$/.test(v)) {
        showError('aadhaar', 'कृपया 12 अंकों का वैध आधार नंबर भरें।');
        ok = false;
      }
    }

    const photo = document.getElementById('photo');
    if (photo) {
      if (!photo.files || !photo.files.length) {
        showError('photo', 'कृपया उम्मीदवार की फोटो अपलोड करें।');
        ok = false;
      } else {
        const file = photo.files[0];
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
          showError('photo', 'केवल JPG, PNG या WebP फाइल स्वीकार्य है।');
          ok = false;
        } else if (file.size > 5 * 1024 * 1024) {
          showError('photo', 'फोटो का आकार 5MB से कम होना चाहिए।');
          ok = false;
        }
      }
    }

    const consent = document.getElementById('consent');
    if (consent && !consent.checked) {
      showError('consent', 'कृपया सहमति जाँचें।');
      ok = false;
    }

    return ok;
  }

  function setupPhotoPreview() {
    const input = document.getElementById('photo');
    const preview = document.getElementById('photo-preview');
    const drop = document.getElementById('photo-drop');
    if (!input || !preview || !drop) return;

    input.addEventListener('change', () => {
      clearError('photo');
      const file = input.files && input.files[0];
      preview.replaceChildren();
      if (!file) {
        preview.style.display = 'none';
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.alt = 'preview';
        preview.appendChild(img);
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });

    ['dragenter', 'dragover'].forEach(evt => {
      drop.addEventListener(evt, e => {
        e.preventDefault();
        drop.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(evt => {
      drop.addEventListener(evt, e => {
        e.preventDefault();
        drop.classList.remove('dragover');
      });
    });

    drop.addEventListener('drop', e => {
      e.preventDefault();
      drop.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

  // ============ TURNSTILE CALLBACKS ============
  window.onTurnstileSuccess = function (token) {
    const tokenEl = document.getElementById('turnstile_token');
    if (tokenEl) tokenEl.value = token;
  };

  window.onTurnstileExpired = function () {
    const tokenEl = document.getElementById('turnstile_token');
    if (tokenEl) tokenEl.value = '';
  };

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

      const turnstileTokenEl = document.getElementById('turnstile_token');
      const turnstileToken = turnstileTokenEl ? turnstileTokenEl.value : '';
      if (!turnstileToken) {
        showStatus('कृपया सुरक्षा जाँच पूरी होने की प्रतीक्षा करें।', 'error-msg');
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
              maxWidth: 1600,
              maxHeight: 1600,
              quality: 0.82,
            });
          } catch (ce) {
            console.warn('Compression failed:', ce);
          }
        }

        const fd = new FormData();
        fd.append('turnstile_token', turnstileToken);
        fd.append('candidate_name', sanitizeInput(document.getElementById('candidate_name').value));
        fd.append('father_name', sanitizeInput(document.getElementById('father_name').value));
        fd.append('address', sanitizeInput(document.getElementById('address').value));
        fd.append('district', sanitizeInput(document.getElementById('district').value));
        fd.append('state', sanitizeInput(document.getElementById('state').value));
        fd.append('mobile', sanitizeInput(document.getElementById('mobile').value));
        fd.append('aadhaar', sanitizeInput(document.getElementById('aadhaar').value).replace(/\s+/g, ''));

        const additionalEl = document.getElementById('additional');
        fd.append('additional', sanitizeInput(additionalEl ? additionalEl.value : ''));

        if (photoFile) {
          fd.append('photo', photoFile, photoFile.name || 'photo.jpg');
        }

        const response = await fetch(endpoint, {
          method: 'POST',
          body: fd,
          headers: { 'Accept': 'application/json' },
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Server error');
        }

        showStatus('आपका आवेदन सफलतापूर्वक जमा हो गया है।', 'success');
        form.reset();

        if (turnstileTokenEl) turnstileTokenEl.value = '';
        const preview = document.getElementById('photo-preview');
        if (preview) {
          preview.replaceChildren();
          preview.style.display = 'none';
        }

        setTimeout(() => {
            const params = new URLSearchParams({
                id:     result.submissionId || '',
                member: result.memberId      || '',
                t:      result.card_token    || '',
            });
            window.location.href = '/thank-you.html?' + params.toString();
        }, 1200);

      } catch (err) {
        console.error('[submit]', err);
        showStatus('क्षमा करें, आवेदन जमा नहीं हो सका। कृपया दोबारा प्रयास करें।', 'error-msg');
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
        if (preview) {
          preview.replaceChildren();
          preview.style.display = 'none';
        }
      });
    }
  }

  function showStatus(message, type) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'form-status' + (message ? ' show ' + (type || '') : '');
  }

  // ============ INITIALIZATION ============
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
