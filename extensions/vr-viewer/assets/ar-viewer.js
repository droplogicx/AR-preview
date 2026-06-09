(function () {
  'use strict';

  const root = document.getElementById('ar-viewer-root');
  if (!root) return;

  const PAINTING_IMAGE = root.dataset.image || '';
  const PRODUCT_TITLE  = root.dataset.title  || 'Painting';
  const WIDTH_CM       = parseFloat(root.dataset.width)  || 60;
  const HEIGHT_CM      = parseFloat(root.dataset.height) || 40;

  const ua        = navigator.userAgent || '';
  const isIOS     = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);

  const appUrl  = root.dataset.appUrl  || '';
  const glbUrl  = root.dataset.glbUrl  ||
    (appUrl ? `${appUrl}/model.glb?img=${encodeURIComponent(PAINTING_IMAGE)}&w=${WIDTH_CM}&h=${HEIGHT_CM}` : '');
  const usdzUrl = root.dataset.usdzUrl ||
    (appUrl ? `${appUrl}/model.usdz?img=${encodeURIComponent(PAINTING_IMAGE)}&w=${WIDTH_CM}&h=${HEIGHT_CM}` : '');

  const pageUrl = window.location.href;

  // ─── Inject HTML ─────────────────────────────────────────────────────────────
  // Modal has NO [hidden] attribute — visibility controlled only by CSS class
  // so it never blocks page clicks when closed
  root.insertAdjacentHTML('afterend', `
    <button id="ar-fab" aria-label="View painting in your room" title="View in your room">
      <svg id="ar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span id="ar-fab-label">View in Room</span>
    </button>

    ${isIOS && usdzUrl ? `
    <a id="ar-ios-link" rel="ar" href="${usdzUrl}"
       style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden;"
       aria-hidden="true">
      <img src="${PAINTING_IMAGE}" alt="">
    </a>` : ''}

    <div id="ar-modal" role="dialog" aria-modal="true"
         aria-label="View in Room" aria-hidden="true">
      <div id="ar-modal-box">
        <button id="ar-modal-close" aria-label="Close">&times;</button>
        <div id="ar-modal-content"></div>
      </div>
    </div>
  `);

  const fab          = document.getElementById('ar-fab');
  const modal        = document.getElementById('ar-modal');
  const modalClose   = document.getElementById('ar-modal-close');
  const modalContent = document.getElementById('ar-modal-content');
  const iosLink      = document.getElementById('ar-ios-link');

  function buildQrImgUrl(text) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(text)}&margin=10`;
  }

  function openModal(html) {
    modalContent.innerHTML = html;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        modal.classList.add('ar-modal--visible');
      });
    });
    modalClose.focus();
  }

  function closeModal() {
    modal.classList.remove('ar-modal--visible');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    fab.focus();
  }

  function showDesktopQR() {
    openModal(`
      <div class="ar-qr-wrap">
        <div class="ar-qr-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5z"/>
            <path d="M2 17l10 5 10-5"/>
            <path d="M2 12l10 5 10-5"/>
          </svg>
        </div>
        <h2 class="ar-modal-title">View in Your Room</h2>
        <p class="ar-modal-sub">
          Scan this QR code with your phone to see
          <strong>${PRODUCT_TITLE}</strong> on your wall in AR.
        </p>
        <div class="ar-qr-frame">
          <img src="${buildQrImgUrl(pageUrl)}"
               alt="QR code to view painting in AR" width="200" height="200" />
        </div>
        <p class="ar-modal-hint">Point your phone camera at the code above</p>
      </div>
    `);
  }

  function triggerIOSAR() {
    if (iosLink) {
      iosLink.click();
    } else {
      showNoModelFallback();
    }
  }

  function triggerAndroidAR() {
    if (!glbUrl) { showNoModelFallback(); return; }
    const intentUrl =
      `intent://arvr.google.com/scene-viewer/1.0` +
      `?file=${encodeURIComponent(glbUrl)}` +
      `&mode=ar_preferred` +
      `&title=${encodeURIComponent(PRODUCT_TITLE)}` +
      `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
      `action=android.intent.action.VIEW;` +
      `S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`;
    window.location = intentUrl;
  }

  function showNoModelFallback() {
    openModal(`
      <div class="ar-qr-wrap">
        <div class="ar-qr-icon ar-qr-icon--warn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 class="ar-modal-title">3D Model Generating…</h2>
        <p class="ar-modal-sub">
          The AR model for this painting is being prepared.
          Please check back in a few minutes.
        </p>
        <button class="ar-retry-btn" onclick="window.location.reload()">Refresh page</button>
      </div>
    `);
  }

  fab.addEventListener('click', function () {
    if (isIOS)          triggerIOSAR();
    else if (isAndroid) triggerAndroidAR();
    else                showDesktopQR();
  });

  modalClose.addEventListener('click', closeModal);

  modal.addEventListener('click', function (e) {
    if (e.target === modal) closeModal();
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modal.classList.contains('ar-modal--visible')) closeModal();
  });

  let lastScrollY = window.scrollY;
  window.addEventListener('scroll', function () {
    const y = window.scrollY;
    if (y > lastScrollY + 60)      fab.classList.add('ar-fab--hidden');
    else if (y < lastScrollY - 10) fab.classList.remove('ar-fab--hidden');
    lastScrollY = y;
  }, { passive: true });

})();
