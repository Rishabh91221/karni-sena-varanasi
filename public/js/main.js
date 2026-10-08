/* ============================================================
   KARNI SENA VARANASI — Main Script
   Loads content.json and renders the page dynamically.
   Handles form validation, photo preview, and submission
   to the Cloudflare Worker backend.
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

  function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el && html != null) el.innerHTML = html;
  }

  function setAttr(id, attr, value) {
    const el = document.getElementById(id);
    if (el && value != null) el.setAttribute(attr, value);
  }

  // ============ LOAD CONTENT ============
  async function loadContent() {
    try {
      const res = await fetch('/content.json?v=' + Date.now());
      if (!res.ok) throw new Error('Failed to load content.json');
      return await res.json();
    } catch (err) {
      console.error('[main.js] Content load error:', err);
      return null;
    }
  }

  // ============ RENDER FUNCTIONS ============
  function renderHeader(data) {
    setText('topbar-text', data.org.topbar);
    setText('brand-name', data.org.name);
    setText('brand-subtitle', data.org.subtitle);
    setAttr('brand-logo', 'src', data.org.logo);
    setText('header-cta', data.header.ctaText);
    setAttr('header-cta', 'href', data.header.ctaLink);
    document.title = data.org.name + ' — ' + data.org.subtitle;
  }

  function renderHero(data) {
    setText('hero-badge', data.hero.badge);
    setText('hero-title', data.hero.title);
    setText('hero-desc', data.hero.description);
    setText('hero-primary', data.hero.primaryButton);
    setAttr('hero-primary', 'href', data.hero.primaryLink);
    setText('hero-secondary', data.hero.secondaryButton);
    setAttr('hero-secondary', 'href', data.hero.secondaryLink);
  }

  function renderAbout(data) {
    setText('about-title', data.about.title);
    setText('about-desc', data.about.description);
    const grid = document.getElementById('about-values');
    if (!grid) return;
    grid.innerHTML = '';
    (data.about.values || []).forEach(v => {
      const card = document.createElement('div');
      card.className = 'value-card';
      card.innerHTML = `
        <div class="value-icon">${v.icon || '•'}</div>
        <h3>${v.title || ''}</h3>
        <p>${v.text || ''}</p>
      `;
      grid.appendChild(card);
    });
  }

  function renderTeam(data) {
    setText('team-title', data.team.title);
    const grid = document.getElementById('team-grid');
    if (!grid) return;
    grid.innerHTML = '';
    (data.team.members || []).forEach(m => {
      const card = document.createElement('div');
      card.className = 'team-card';
      card.innerHTML = `
        <img class="team-photo" src="${m.photo}" alt="${m.name}"
             onerror="this.style.background='#F5E9D0'; this.src='data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text x=%2250%22 y=%2255%22 font-size=%2240%22 text-anchor=%22middle%22 fill=%22%23C6600F%22>👤</text></svg>'">
        <div class="team-info">
          <h3>${m.name}</h3>
          <div class="team-role">${m.role}</div>
          <p class="team-bio">${m.bio}</p>
          ${m.phone ? `<a class="team-phone" href="tel:${m.phone}">📞 ${m.phone}</a>` : ''}
        </div>
      `;
      grid.appendChild(card);
    });
  }

  function renderGallery(data) {
    setText('gallery-title', data.gallery.title);
    setText('gallery-desc', data.gallery.description);
    const grid = document.getElementById('gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const images = data.gallery.images || [];
    if (images.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:2rem 0;">अभी कोई गतिविधि चित्र उपलब्ध नहीं है।</p>';
      return;
    }
    images.forEach(src => {
      const item = document.createElement('div');
      item.className = 'gallery-item';
      item.innerHTML = `<img src="${src}" alt="गतिविधि" loading="lazy">`;
      grid.appendChild(item);
    });
  }

  function renderJoinForm(data) {
    const f = data.joinForm;
    setText('join-title', f.title);
    setText('join-desc', f.description);
    setText('form-card-title', f.cardTitle);
    setText('form-card-subtitle', f.cardSubtitle);
    setText('form-card-desc', f.cardDescription);
    setText('form-help-title', f.helpTitle);
    setText('consent-text', f.consentText);
    setText('submit-btn', f.submitText);
    setText('reset-btn', f.resetText);

    // Card list
    const list = document.getElementById('form-card-list');
    if (list) {
      list.innerHTML = '';
      (f.cardList || []).forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
    }

    // Help phones
    const phonesWrap = document.getElementById('form-help-phones');
    if (phonesWrap) {
      phonesWrap.innerHTML = '';
      (f.helpPhones || []).forEach(p => {
        const a = document.createElement('a');
        a.href = 'tel:' + p;
        a.textContent = p;
        phonesWrap.appendChild(a);
        phonesWrap.appendChild(document.createElement('br'));
      });
    }
  }

  function renderContact(data) {
    setText('contact-title', data.contact.title);
    const grid = document.getElementById('contact-grid');
    if (!grid) return;
    grid.innerHTML = '';

    // Phone cards
    (data.contact.phones || []).forEach(phone => {
      const card = document.createElement('div');
      card.className = 'contact-card';
      card.innerHTML = `
        <div class="contact-icon">📞</div>
        <h4>फ़ोन</h4>
        <a href="tel:${phone}">${phone}</a>
      `;
      grid.appendChild(card);
    });

    // Address card
    if (data.contact.address) {
      const card = document.createElement('div');
      card.className = 'contact-card';
      card.innerHTML = `
        <div class="contact-icon">📍</div>
        <h4>पता</h4>
        <p>${data.contact.address}</p>
      `;
      grid.appendChild(card);
    }
  }

  function renderFooter(data) {
    setText('footer-name', data.org.name + ' — ' + data.org.subtitle);
    setText('footer-tagline', data.footer.tagline);
    setText('footer-copy', data.footer.copyright);
    setText('floating-cta', data.floatingCta.text);
    setAttr('floating-cta', 'href', data.floatingCta.link);
  }

  // ============ FORM VALIDATION ============
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
    const errors = [];

    const required = [
      { id: 'candidate_name', msg: 'कृपया उम्मीदवार का नाम भरें।' },
      { id: 'father_name',    msg: 'कृपया पिता का नाम भरें।' },
      { id: 'address',        msg: 'कृपया पता भरें।' },
      { id: 'district',       msg: 'कृपया जिला भरें।' },
      { id: 'state',          msg: 'कृपया राज्य भरें।' },
    ];

    required.forEach(({ id, msg }) => {
      const el = document.getElementById(id);
      if (!el || !el.value.trim()) {
        showError(id, msg);
        errors.push(msg);
        ok = false;
      }
    });

    // Mobile: exactly 10 digits, starts with 6-9
    const mobile = document.getElementById('mobile');
    if (mobile) {
      const v = mobile.value.trim();
      if (!v) {
        showError('mobile', 'कृपया मोबाइल नंबर भरें।');
        errors.push('mobile');
        ok = false;
      } else if (!/^[6-9]\d{9}$/.test(v)) {
        showError('mobile', 'कृपया 10 अंकों का वैध मोबाइल नंबर भरें।');
        errors.push('mobile');
        ok = false;
      }
    }

    // Aadhaar: exactly 12 digits
    const aadhaar = document.getElementById('aadhaar');
    if (aadhaar) {
      const v = aadhaar.value.trim();
      if (!v) {
        showError('aadhaar', 'कृपया आधार नंबर भरें।');
        errors.push('aadhaar');
        ok = false;
      } else if (!/^\d{12}$/.test(v)) {
        showError('aadhaar', 'कृपया 12 अंकों का वैध आधार नंबर भरें।');
        errors.push('aadhaar');
        ok = false;
      }
    }

    // Photo
    const photo = document.getElementById('photo');
    if (photo) {
      if (!photo.files || !photo.files.length) {
        showError('photo', 'कृपया उम्मीदवार की फोटो अपलोड करें।');
        errors.push('photo');
        ok = false;
      } else {
        const file = photo.files[0];
        const maxSize = 5 * 1024 * 1024; // 5 MB
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.type)) {
          showError('photo', 'केवल JPG, PNG या WebP फाइल स्वीकार्य है।');
          errors.push('photo');
          ok = false;
        } else if (file.size > maxSize) {
          showError('photo', 'फोटो का आकार 5MB से कम होना चाहिए।');
          errors.push('photo');
          ok = false;
        }
      }
    }

    // Consent
    const consent = document.getElementById('consent');
    if (consent && !consent.checked) {
      showError('consent', 'कृपया सहमति जाँचें।');
      errors.push('consent');
      ok = false;
    }

    return ok;
  }

  // ============ PHOTO PREVIEW ============
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

    // Drag-and-drop support
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
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        input.files = e.dataTransfer.files;
        input.dispatchEvent(new Event('change'));
      }
    });
  }

  // ============ FORM SUBMIT ============
  function setupFormSubmit(content) {
    if (!form) return;

    const endpoint = (content && content.formEndpoint) ? content.formEndpoint : '';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Validate
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
        // Compress photo before upload (if available)
        const photoInput = document.getElementById('photo');
        let photoFile = photoInput && photoInput.files ? photoInput.files[0] : null;

        if (photoFile && window.KSImageCompressor) {
          try {
            photoFile = await window.KSImageCompressor.compressImage(photoFile, {
              maxWidth: 1600,
              maxHeight: 1600,
              quality: 0.82,
            });
          } catch (compErr) {
            console.warn('Compression failed, using original:', compErr);
          }
        }

        // Build FormData
        const fd = new FormData();
        fd.append('candidate_name', document.getElementById('candidate_name').value.trim());
        fd.append('father_name',    document.getElementById('father_name').value.trim());
        fd.append('address',        document.getElementById('address').value.trim());
        fd.append('district',       document.getElementById('district').value.trim());
        fd.append('state',          document.getElementById('state').value.trim());
        fd.append('mobile',         document.getElementById('mobile').value.trim());
        fd.append('aadhaar',        document.getElementById('aadhaar').value.trim());
        fd.append('additional',     (document.getElementById('additional').value || '').trim());
        if (photoFile) {
          fd.append('photo', photoFile, photoFile.name || 'photo.jpg');
        }

        // Send to backend
        const response = await fetch(endpoint, {
          method: 'POST',
          body: fd,
        });

        const result = await response.json().catch(() => ({}));

        if (!response.ok || !result.success) {
          throw new Error(result.error || 'Server error');
        }

        // Success
        showStatus('आपका आवेदन सफलतापूर्वक जमा हो गया है।', 'success');
        form.reset();
        const preview = document.getElementById('photo-preview');
        if (preview) preview.innerHTML = '';

        // Redirect to thank-you page
        setTimeout(() => {
          window.location.href = '/thank-you.html?id=' + (result.submissionId || '');
        }, 1200);

      } catch (err) {
        console.error('[submit]', err);
        showStatus(
          'क्षमा करें, आवेदन जमा नहीं हो सका। कृपया दोबारा प्रयास करें। (' + (err.message || 'error') + ')',
          'error-msg'
        );
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    // Clear errors on input
    $$('#joining-form input, #joining-form textarea').forEach(el => {
      el.addEventListener('input', () => clearError(el.id));
      el.addEventListener('change', () => clearError(el.id));
    });

    // Reset button
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

  // ============ INIT ============
  document.addEventListener('DOMContentLoaded', async () => {
    const content = await loadContent();
    if (content) {
      renderHeader(content);
      renderHero(content);
      renderAbout(content);
      renderTeam(content);
      renderGallery(content);
      renderJoinForm(content);
      renderContact(content);
      renderFooter(content);
      setupPhotoPreview();
      setupFormSubmit(content);
    } else {
      console.warn('[main.js] Running without content.json — page will show static defaults.');
    }
  });

})();
