(function () {
  'use strict';

  var root = document.getElementById('ar-root');
  if (!root) return;

  var TITLE      = root.dataset.title   || 'Product';
  var IMG        = root.dataset.img     || '';
  var BACKEND    = (root.dataset.backend || '').replace(/\/$/, '');
  var WIDTH_CM   = root.dataset.width   || '60';
  var HEIGHT_CM  = root.dataset.height  || '40';
  var PAGE_URL   = window.location.href;

  var ua        = navigator.userAgent || '';
  var isIOS     = /iphone|ipad|ipod/i.test(ua);
  var isAndroid = /android/i.test(ua);
  var isMobile  = isIOS || isAndroid;

  // ── Inject button + modal ────────────────────────────────────────────────────
  document.body.insertAdjacentHTML('beforeend',
    '<button id="ar-fab">' +
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
  var close = document.getElementById('ar-close');

  // ── Modal ────────────────────────────────────────────────────────────────────
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

  close.addEventListener('click', closeModal);
  modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('ar-open')) closeModal();
  });

  // ── Loading screen ───────────────────────────────────────────────────────────
  function showLoading() {
    openModal(
      '<div class="ar-center">' +
        '<div class="ar-spinner"></div>' +
        '<p class="ar-loading-text">Preparing AR model…</p>' +
      '</div>'
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────
  function showError(msg) {
    body.innerHTML =
      '<div class="ar-center">' +
        '<div class="ar-icon ar-icon-warn">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"' +
              ' stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"/>' +
            '<line x1="12" y1="8" x2="12" y2="13"/>' +
            '<line x1="12" y1="17" x2="12.01" y2="17"/>' +
          '</svg>' +
        '</div>' +
        '<h2 class="ar-title">Could not load AR</h2>' +
        '<p class="ar-sub">' + msg + '</p>' +
        '<button class="ar-btn" onclick="location.reload()">Try again</button>' +
      '</div>';
  }

  // ── QR modal (desktop) ───────────────────────────────────────────────────────
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
        '<p class="ar-sub">Scan with your phone to place <strong>' + TITLE + '</strong> in your real room using AR.</p>' +
        '<div class="ar-qr"><img src="' + qr + '" width="220" height="220" alt="QR code"/></div>' +
        '<p class="ar-hint">Opens camera on iPhone &amp; Android</p>' +
      '</div>'
    );
  }

  // ── Launch Android Scene Viewer ──────────────────────────────────────────────
  function launchAndroid(glbUrl) {
    // Google Scene Viewer — opens device camera + places 3D object in real room
    var sceneViewerUrl =
      'https://arvr.google.com/scene-viewer/1.0?' +
      'file=' + encodeURIComponent(glbUrl) +
      '&mode=ar_preferred' +
      '&resizable=false' +
      '&title=' + encodeURIComponent(TITLE);

    // Intent URL for Chrome on Android
    var intentUrl =
      'intent://arvr.google.com/scene-viewer/1.0' +
      '?file=' + encodeURIComponent(glbUrl) +
      '&mode=ar_preferred' +
      '&resizable=false' +
      '&title=' + encodeURIComponent(TITLE) +
      '#Intent' +
      ';scheme=https' +
      ';package=com.google.android.googlequicksearchbox' +
      ';action=android.intent.action.VIEW' +
      ';S.browser_fallback_url=' + encodeURIComponent(sceneViewerUrl) +
      ';end';

    closeModal();
    window.location = intentUrl;
  }

  // ── Launch iOS ARKit ─────────────────────────────────────────────────────────
  function launchIOS(usdzUrl) {
    // Create hidden <a rel="ar"> and click it — Safari opens native AR camera
    var a = document.createElement('a');
    a.setAttribute('rel', 'ar');
    a.setAttribute('href', usdzUrl);
    a.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
    var img = document.createElement('img');
    img.src = '';
    img.alt = '';
    a.appendChild(img);
    document.body.appendChild(a);
    closeModal();
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 2000);
  }

  // ── Fetch GLB from backend then launch ───────────────────────────────────────
  function fetchAndLaunch() {
    if (!BACKEND) {
      showError('Backend URL not configured. Set it in theme editor.');
      return;
    }

    showLoading();

    // Call your Remix backend — it returns { glb: "https://...", usdz: "https://..." }
    var apiUrl = BACKEND + '/api/ar-model' +
      '?img=' + encodeURIComponent(IMG) +
      '&w=' + encodeURIComponent(WIDTH_CM) +
      '&h=' + encodeURIComponent(HEIGHT_CM) +
      '&title=' + encodeURIComponent(TITLE);

    fetch(apiUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('Server error ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (isIOS && data.usdz) {
          launchIOS(data.usdz);
        } else if (isAndroid && data.glb) {
          launchAndroid(data.glb);
        } else {
          showError('AR model not available for this device.');
        }
      })
      .catch(function (err) {
        console.error('[AR]', err);
        showError('Could not generate AR model. Please try again.');
      });
  }

  // ── FAB click ────────────────────────────────────────────────────────────────
  fab.addEventListener('click', function () {
    if (isMobile) fetchAndLaunch();
    else          showQR();
  });

  // ── Scroll hide/show ─────────────────────────────────────────────────────────
  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if      (y > lastY + 60)  fab.classList.add('ar-fab-hide');
    else if (y < lastY - 10)  fab.classList.remove('ar-fab-hide');
    lastY = y;
  }, { passive: true });

})();
