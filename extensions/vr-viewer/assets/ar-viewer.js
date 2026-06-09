(function () {
  'use strict';

  var root = document.getElementById('ar-root');
  if (!root) return;

  var TITLE    = root.dataset.title   || 'Product';
  var IMG      = root.dataset.img     || '';
  var BACKEND  = (root.dataset.backend || '').replace(/\/$/, '');
  var WIDTH    = root.dataset.width   || '60';
  var HEIGHT   = root.dataset.height  || '40';
  var PAGE_URL = window.location.href;

  var ua        = navigator.userAgent || '';
  var isIOS     = /iphone|ipad|ipod/i.test(ua);
  var isAndroid = /android/i.test(ua);
  var isMobile  = isIOS || isAndroid;

  // ── Inject FAB + Modal into page ─────────────────────────────────────────────
  document.body.insertAdjacentHTML('beforeend',
    '<button id="ar-fab" aria-label="View in your room">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
          ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M12 2L2 7l10 5 10-5-10-5z"/>' +
        '<path d="M2 17l10 5 10-5"/>' +
        '<path d="M2 12l10 5 10-5"/>' +
      '</svg>' +
      '<span>' + (isMobile ? 'View in Room (AR)' : 'View in Room') + '</span>' +
    '</button>' +

    '<div id="ar-modal" aria-hidden="true">' +
      '<div id="ar-box">' +
        '<button id="ar-close" aria-label="Close">&times;</button>' +
        '<div id="ar-body"></div>' +
      '</div>' +
    '</div>'
  );

  var fab   = document.getElementById('ar-fab');
  var modal = document.getElementById('ar-modal');
  var body  = document.getElementById('ar-body');
  var closeBtn = document.getElementById('ar-close');

  // ── Modal open/close ─────────────────────────────────────────────────────────
  function openModal(html) {
    body.innerHTML = html;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        modal.classList.add('ar-open');
      });
    });
  }

  function closeModal() {
    modal.classList.remove('ar-open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('ar-open')) closeModal();
  });

  // ── Spinner while fetching GLB ────────────────────────────────────────────────
  function showLoading() {
    openModal(
      '<div class="ar-center">' +
        '<div class="ar-spinner"></div>' +
        '<p class="ar-msg">Preparing AR model…</p>' +
      '</div>'
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────────
  function showError(msg) {
    body.innerHTML =
      '<div class="ar-center">' +
        '<div class="ar-icon ar-warn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
              ' stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<line x1="12" y1="8" x2="12" y2="13"/>' +
            '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
          '</svg>' +
        '</div>' +
        '<h2 class="ar-title">AR not available</h2>' +
        '<p class="ar-msg">' + msg + '</p>' +
        '<button class="ar-btn" onclick="location.reload()">Try again</button>' +
      '</div>';
  }

  // ── Desktop: QR code ─────────────────────────────────────────────────────────
  function showQR() {
    var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=12&data=' +
             encodeURIComponent(PAGE_URL);
    openModal(
      '<div class="ar-center">' +
        '<div class="ar-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
              ' stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M12 2L2 7l10 5 10-5-10-5z"/>' +
            '<path d="M2 17l10 5 10-5"/>' +
            '<path d="M2 12l10 5 10-5"/>' +
          '</svg>' +
        '</div>' +
        '<h2 class="ar-title">View in Your Room</h2>' +
        '<p class="ar-msg">Scan with your phone to place <strong>' + TITLE + '</strong> on your wall in AR.</p>' +
        '<div class="ar-qr"><img src="' + qr + '" width="220" height="220" alt="QR"/></div>' +
        '<p class="ar-hint">Opens camera on iPhone &amp; Android</p>' +
      '</div>'
    );
  }

  // ── Android: Google Scene Viewer ──────────────────────────────────────────────
  function launchAndroid(glbUrl) {
    var fallback = 'https://arvr.google.com/scene-viewer/1.0' +
      '?file=' + encodeURIComponent(glbUrl) +
      '&mode=ar_preferred&resizable=false&title=' + encodeURIComponent(TITLE);

    var intent =
      'intent://arvr.google.com/scene-viewer/1.0' +
      '?file=' + encodeURIComponent(glbUrl) +
      '&mode=ar_preferred&resizable=false' +
      '&title=' + encodeURIComponent(TITLE) +
      '#Intent' +
      ';scheme=https' +
      ';package=com.google.android.googlequicksearchbox' +
      ';action=android.intent.action.VIEW' +
      ';S.browser_fallback_url=' + encodeURIComponent(fallback) +
      ';end';

    closeModal();
    window.location = intent;
  }

  // ── iOS: ARKit via hidden <a rel="ar"> ────────────────────────────────────────
  function launchIOS(usdzUrl) {
    var a = document.createElement('a');
    a.setAttribute('rel', 'ar');
    a.setAttribute('href', usdzUrl);
    a.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;';
    var img = document.createElement('img');
    img.src = ''; img.alt = '';
    a.appendChild(img);
    document.body.appendChild(a);
    closeModal();
    a.click();
    setTimeout(function () {
      if (document.body.contains(a)) document.body.removeChild(a);
    }, 3000);
  }

  // ── Fetch GLB URL from backend → then launch AR ───────────────────────────────
  function fetchAndLaunch() {
    if (!BACKEND) {
      showError('Backend URL is not set. Go to Themes → Customize → VR Viewer block → add your app URL.');
      return;
    }

    showLoading();

    var apiUrl = BACKEND + '/api/ar-model' +
      '?img=' + encodeURIComponent(IMG) +
      '&w=' + encodeURIComponent(WIDTH) +
      '&h=' + encodeURIComponent(HEIGHT) +
      '&title=' + encodeURIComponent(TITLE);

    fetch(apiUrl, { method: 'GET', mode: 'cors' })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            throw new Error(data.error || ('HTTP ' + res.status));
          }
          return data;
        });
      })
      .then(function (data) {
        if (!data.glb && !data.usdz) {
          throw new Error('No model URL returned from server');
        }
        if (isIOS && data.usdz) {
          launchIOS(data.usdz);
        } else if (data.glb) {
          launchAndroid(data.glb);
        } else {
          showError('AR model not available. Please try again in a moment.');
        }
      })
      .catch(function (err) {
        console.error('[AR Viewer]', err);
        showError('Could not load AR model: ' + err.message);
      });
  }

  // ── Button click ──────────────────────────────────────────────────────────────
  fab.addEventListener('click', function () {
    if (isMobile) fetchAndLaunch();
    else          showQR();
  });

  // ── Hide FAB on scroll down, show on scroll up ────────────────────────────────
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if      (y > lastY + 60)  fab.classList.add('ar-fab-hide');
    else if (y < lastY - 10)  fab.classList.remove('ar-fab-hide');
    lastY = y;
  }, { passive: true });

})();
