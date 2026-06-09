(function () {
  'use strict';

  const root = document.getElementById('ar-viewer-root');
  if (!root) return;

  // ─── Data from Liquid ─────────────────────────────────────────────────────────
  const PAINTING_IMAGE = root.dataset.image  || '';
  const PRODUCT_TITLE  = root.dataset.title  || 'Product';
  const WIDTH_CM       = parseFloat(root.dataset.width)  || 60;
  const HEIGHT_CM      = parseFloat(root.dataset.height) || 40;
  const appUrl         = root.dataset.appUrl || '';

  // GLB/USDZ — from metafields OR app proxy
  let glbUrl  = root.dataset.glbUrl  || '';
  let usdzUrl = root.dataset.usdzUrl || '';

  // If app proxy set, build URL dynamically (backend generates model on demand)
  if (!glbUrl && appUrl) {
    glbUrl  = `${appUrl}/model.glb?img=${encodeURIComponent(PAINTING_IMAGE)}&w=${WIDTH_CM}&h=${HEIGHT_CM}`;
    usdzUrl = `${appUrl}/model.usdz?img=${encodeURIComponent(PAINTING_IMAGE)}&w=${WIDTH_CM}&h=${HEIGHT_CM}`;
  }

  const pageUrl = window.location.href;

  // ─── Device detection ─────────────────────────────────────────────────────────
  const ua        = navigator.userAgent || '';
  const isIOS     = /iphone|ipad|ipod/i.test(ua);
  const isAndroid = /android/i.test(ua);
  const isMobile  = isIOS || isAndroid;

  // ─── Room background images (built-in presets) ───────────────────────────────
  // These are royalty-free room images hosted on Unsplash CDN
  const ROOM_BACKGROUNDS = [
    {
      label: 'Living Room',
      url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1200&q=80'
    },
    {
      label: 'Bedroom',
      url: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1200&q=80'
    },
    {
      label: 'Office',
      url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80'
    },
    {
      label: 'Dining Room',
      url: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80'
    }
  ];

  let currentRoomIndex = 0;
  let paintingX = 0.35; // 0-1 relative position
  let paintingY = 0.25;
  let paintingScale = 0.35;
  let isDragging = false;
  let dragStartX, dragStartY, dragStartPX, dragStartPY;

  // ─── Inject FAB + Modal ───────────────────────────────────────────────────────
  root.insertAdjacentHTML('afterend', `
    <button id="ar-fab" aria-label="View in your room">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" width="20" height="20">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      <span>View in Room</span>
    </button>

    <div id="ar-modal" role="dialog" aria-modal="true" aria-label="View in Room" aria-hidden="true">
      <div id="ar-modal-box">
        <div id="ar-modal-header">
          <span id="ar-modal-heading">View in Your Room</span>
          <button id="ar-modal-close" aria-label="Close">&times;</button>
        </div>
        <div id="ar-modal-content"></div>
      </div>
    </div>
  `);

  const fab          = document.getElementById('ar-fab');
  const modal        = document.getElementById('ar-modal');
  const modalClose   = document.getElementById('ar-modal-close');
  const modalContent = document.getElementById('ar-modal-content');

  // ─── Modal open/close ─────────────────────────────────────────────────────────
  function openModal(html) {
    modalContent.innerHTML = html;
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      modal.classList.add('ar-modal--visible');
    }));
    modalClose.focus();
  }

  function closeModal() {
    modal.classList.remove('ar-modal--visible');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    fab.focus();
  }

  // ─── QR helper ────────────────────────────────────────────────────────────────
  function qrUrl(text) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(text)}&margin=10&color=000000&bgcolor=ffffff`;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // MOBILE FLOW: Canvas room preview + model-viewer AR button
  // ─────────────────────────────────────────────────────────────────────────────
  function showMobilePreview() {
    const hasARModel = !!(glbUrl || usdzUrl);

    openModal(`
      <div id="ar-room-wrap">

        <!-- Room preview canvas -->
        <div id="ar-canvas-wrap">
          <canvas id="ar-canvas"></canvas>
          <div id="ar-canvas-hint">Drag painting to reposition</div>
        </div>

        <!-- Room selector thumbnails -->
        <div id="ar-room-selector">
          ${ROOM_BACKGROUNDS.map((r, i) => `
            <button class="ar-room-thumb ${i === 0 ? 'active' : ''}"
                    data-index="${i}"
                    aria-label="${r.label}">
              <img src="${r.url.replace('w=1200', 'w=120')}" alt="${r.label}" loading="lazy"/>
            </button>
          `).join('')}
          <button class="ar-room-thumb ar-room-upload" id="ar-upload-btn" aria-label="Upload your room photo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round" width="22" height="22">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Upload</span>
          </button>
        </div>
        <input type="file" id="ar-file-input" accept="image/*" style="display:none"/>

        <!-- Size slider -->
        <div id="ar-size-row">
          <label for="ar-size-slider">Size</label>
          <input type="range" id="ar-size-slider" min="10" max="70" value="35" step="1"/>
          <span id="ar-size-val">35%</span>
        </div>

        <!-- AR launch button (only if model available) -->
        ${hasARModel ? `
        <div id="ar-launch-wrap">
          ${isAndroid ? `
            <button id="ar-launch-btn" class="ar-launch-primary">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                   stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <circle cx="12" cy="12" r="3"/>
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
              </svg>
              Place on Wall (Camera)
            </button>
          ` : isIOS ? `
            <a id="ar-ios-link" rel="ar" href="${usdzUrl}">
              <img src="${PAINTING_IMAGE}" alt="" style="display:none"/>
            </a>
            <button id="ar-launch-btn" class="ar-launch-primary" onclick="document.getElementById('ar-ios-link').click()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
                   stroke-linecap="round" stroke-linejoin="round" width="18" height="18">
                <circle cx="12" cy="12" r="3"/>
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
              </svg>
              Place on Wall (Camera)
            </button>
          ` : ''}
        </div>
        ` : `
        <p id="ar-no-model-note">
          AR camera view coming soon. Use the room preview above to visualise the painting.
        </p>
        `}

      </div>
    `);

    // Now wire up canvas + controls
    initCanvas();
  }

  // ─── Canvas: draw painting on room background ─────────────────────────────────
  function initCanvas() {
    const canvas  = document.getElementById('ar-canvas');
    const ctx     = canvas.getContext('2d');
    const wrap    = document.getElementById('ar-canvas-wrap');

    const roomImg     = new Image();
    const paintingImg = new Image();
    roomImg.crossOrigin     = 'anonymous';
    paintingImg.crossOrigin = 'anonymous';

    let roomLoaded     = false;
    let paintingLoaded = false;

    function resize() {
      canvas.width  = wrap.clientWidth;
      canvas.height = Math.round(wrap.clientWidth * 0.6);
      draw();
    }

    function draw() {
      if (!roomLoaded || !paintingLoaded) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw room background (cover)
      const rW = canvas.width, rH = canvas.height;
      const imgAR = roomImg.naturalWidth / roomImg.naturalHeight;
      const canAR = rW / rH;
      let sx = 0, sy = 0, sw = roomImg.naturalWidth, sh = roomImg.naturalHeight;
      if (imgAR > canAR) {
        sw = roomImg.naturalHeight * canAR;
        sx = (roomImg.naturalWidth - sw) / 2;
      } else {
        sh = roomImg.naturalWidth / canAR;
        sy = (roomImg.naturalHeight - sh) / 2;
      }
      ctx.drawImage(roomImg, sx, sy, sw, sh, 0, 0, rW, rH);

      // Draw painting with subtle shadow
      const pw = rW * paintingScale;
      const ph = pw * (HEIGHT_CM / WIDTH_CM);
      const px = paintingX * rW - pw / 2;
      const py = paintingY * rH - ph / 2;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur  = 18;
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 6;
      ctx.drawImage(paintingImg, px, py, pw, ph);
      ctx.restore();

      // Thin frame border
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth   = 2;
      ctx.strokeRect(px, py, pw, ph);
    }

    // Load room
    function loadRoom(url) {
      roomLoaded = false;
      roomImg.onload = () => { roomLoaded = true; draw(); };
      roomImg.src = url;
    }

    // Load painting
    paintingImg.onload = () => { paintingLoaded = true; draw(); };
    paintingImg.src = PAINTING_IMAGE;

    loadRoom(ROOM_BACKGROUNDS[currentRoomIndex].url);
    resize();
    window.addEventListener('resize', resize);

    // ── Drag painting on canvas ──
    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x: cx / canvas.width, y: cy / canvas.height };
    }

    function onDragStart(e) {
      const pos = getPos(e);
      // Only start drag if near the painting
      const pw = paintingScale;
      const ph = pw * (HEIGHT_CM / WIDTH_CM);
      if (
        pos.x > paintingX - pw / 2 - 0.05 &&
        pos.x < paintingX + pw / 2 + 0.05 &&
        pos.y > paintingY - ph / 2 - 0.05 &&
        pos.y < paintingY + ph / 2 + 0.05
      ) {
        isDragging = true;
        dragStartX  = pos.x;
        dragStartY  = pos.y;
        dragStartPX = paintingX;
        dragStartPY = paintingY;
        e.preventDefault();
      }
    }

    function onDragMove(e) {
      if (!isDragging) return;
      const pos = getPos(e);
      paintingX = Math.max(0.05, Math.min(0.95, dragStartPX + (pos.x - dragStartX)));
      paintingY = Math.max(0.05, Math.min(0.95, dragStartPY + (pos.y - dragStartY)));
      draw();
      e.preventDefault();
    }

    function onDragEnd() { isDragging = false; }

    canvas.addEventListener('mousedown',  onDragStart);
    canvas.addEventListener('mousemove',  onDragMove);
    canvas.addEventListener('mouseup',    onDragEnd);
    canvas.addEventListener('touchstart', onDragStart, { passive: false });
    canvas.addEventListener('touchmove',  onDragMove,  { passive: false });
    canvas.addEventListener('touchend',   onDragEnd);

    // ── Room selector ──
    document.querySelectorAll('.ar-room-thumb[data-index]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ar-room-thumb').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentRoomIndex = parseInt(btn.dataset.index);
        loadRoom(ROOM_BACKGROUNDS[currentRoomIndex].url);
      });
    });

    // ── Upload own room photo ──
    const uploadBtn   = document.getElementById('ar-upload-btn');
    const fileInput   = document.getElementById('ar-file-input');
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          roomLoaded = false;
          roomImg.onload = () => { roomLoaded = true; draw(); };
          roomImg.src = e.target.result;
          document.querySelectorAll('.ar-room-thumb').forEach(b => b.classList.remove('active'));
        };
        reader.readAsDataURL(file);
      });
    }

    // ── Size slider ──
    const slider  = document.getElementById('ar-size-slider');
    const sizeVal = document.getElementById('ar-size-val');
    if (slider) {
      slider.addEventListener('input', () => {
        paintingScale = parseInt(slider.value) / 100;
        sizeVal.textContent = slider.value + '%';
        draw();
      });
    }

    // ── Android AR launch ──
    const launchBtn = document.getElementById('ar-launch-btn');
    if (launchBtn && isAndroid && glbUrl) {
      launchBtn.addEventListener('click', () => {
        const intentUrl =
          `intent://arvr.google.com/scene-viewer/1.0` +
          `?file=${encodeURIComponent(glbUrl)}` +
          `&mode=ar_preferred` +
          `&title=${encodeURIComponent(PRODUCT_TITLE)}` +
          `#Intent;scheme=https;package=com.google.android.googlequicksearchbox;` +
          `action=android.intent.action.VIEW;` +
          `S.browser_fallback_url=${encodeURIComponent(pageUrl)};end`;
        window.location = intentUrl;
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DESKTOP FLOW: QR code
  // ─────────────────────────────────────────────────────────────────────────────
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
          Scan with your phone to preview
          <strong>${PRODUCT_TITLE}</strong> on your wall.
        </p>
        <div class="ar-qr-frame">
          <img src="${qrUrl(pageUrl)}" alt="QR code" width="220" height="220"/>
        </div>
        <p class="ar-modal-hint">Point your phone camera at the code above</p>
      </div>
    `);
  }

  // ─── FAB click ────────────────────────────────────────────────────────────────
  fab.addEventListener('click', function () {
    if (isMobile) showMobilePreview();
    else          showDesktopQR();
  });

  // ─── Close ───────────────────────────────────────────────────────────────────
  modalClose.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('ar-modal--visible')) closeModal();
  });

  // ─── Scroll hide/show FAB ─────────────────────────────────────────────────────
  let lastY = window.scrollY;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    if (y > lastY + 60)      fab.classList.add('ar-fab--hidden');
    else if (y < lastY - 10) fab.classList.remove('ar-fab--hidden');
    lastY = y;
  }, { passive: true });

})();
