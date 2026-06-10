(function () {
  'use strict';

  var root = document.getElementById('ar-root');
  if (!root) return;

  var TITLE    = root.dataset.title   || 'Product';
  var IMG      = root.dataset.img     || '';
  var IMG_W    = parseFloat(root.dataset.imgW   || '0');
  var IMG_H    = parseFloat(root.dataset.imgH   || '0');
  var BACKEND  = (root.dataset.backend || '').replace(/\/$/, '');
  var WIDTH_CM = parseFloat(root.dataset.width  || '60');
  var HEIGHT_CM = parseFloat(root.dataset.height || '40');
  var PAGE_URL = window.location.href;

  if (IMG.indexOf('//') === 0) IMG = 'https:' + IMG;

  var productRatio = null;

  var ua        = navigator.userAgent || '';
  var isIOS     = /iphone|ipad|ipod/i.test(ua);
  var isAndroid = /android/i.test(ua);
  var isMobile  = isIOS || isAndroid;

  var DEFAULT_WALL = { top: 8, left: 10, width: 80, height: 42 };

  var ROOMS = [
    {
      name: 'Living Room',
      url: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=1200&q=80&auto=format&fit=crop',
      wall: { top: 6, left: 8, width: 84, height: 40 },
      productY: 30
    },
    {
      name: 'Modern Lounge',
      url: 'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=1200&q=80&auto=format&fit=crop',
      wall: { top: 5, left: 6, width: 88, height: 45 },
      productY: 28
    },
    {
      name: 'Cozy Space',
      url: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=1200&q=80&auto=format&fit=crop',
      wall: { top: 7, left: 10, width: 80, height: 38 },
      productY: 26
    },
    {
      name: 'Bright Room',
      url: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=1200&q=80&auto=format&fit=crop',
      wall: { top: 4, left: 5, width: 90, height: 48 },
      productY: 27
    },
    {
      name: 'Apartment',
      url: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200&q=80&auto=format&fit=crop',
      wall: { top: 8, left: 12, width: 76, height: 36 },
      productY: 25
    },
    {
      name: 'Plain Wall',
      url: 'https://images.unsplash.com/photo-1615529328331-f8917597711f?w=1200&q=80&auto=format&fit=crop',
      wall: { top: 10, left: 8, width: 84, height: 50 },
      productY: 32
    }
  ];

  var SIZE_PRESETS = [
    { label: 'Small',  scale: 0.65 },
    { label: 'Medium', scale: 1.0 },
    { label: 'Large',  scale: 1.35 },
    { label: 'XL',     scale: 1.7 }
  ];

  var SIZE_MIN = 0.35;
  var SIZE_MAX = 1.85;

  var FRAME_COLORS = [
    { id: 'none',  color: 'transparent', label: 'None' },
    { id: 'white', color: '#f5f5f0',     label: 'White' },
    { id: 'black', color: '#1a1a1a',     label: 'Black' },
    { id: 'brown', color: '#6b4c35',     label: 'Brown' },
    { id: 'gold',  color: '#c9a84c',     label: 'Gold' },
    { id: 'gray',  color: '#9a9a9a',     label: 'Gray' },
    { id: 'yellow',color: '#e8c547',     label: 'Yellow' }
  ];

  var state = {
    roomIndex: 0,
    customBg: null,
    posX: 50,
    posY: 32,
    sizeIndex: 1,
    sizeScale: 1.0,
    angle: 0,
    level: 0,
    pitch: 0,
    spaceWidth: 16.96,
    unit: 'feet',
    showFullBg: true,
    frameId: 'none',
    matting: 'none',
    wallTint: null,
    activePanel: null
  };

  // ── Inject FAB ───────────────────────────────────────────────────────────────
  document.body.insertAdjacentHTML('beforeend',
    '<button id="ar-fab" aria-label="View in your room">' +
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
          ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>' +
        '<polyline points="9 22 9 12 15 12 15 22"/>' +
      '</svg>' +
      '<span>View in Room</span>' +
    '</button>' +
    '<div id="ar-room" aria-hidden="true"></div>'
  );

  var fab      = document.getElementById('ar-fab');
  var roomEl   = document.getElementById('ar-room');
  var els      = {};

  function cmToIn(cm) { return (cm / 2.54).toFixed(1); }

  function imgUrl(base, extra) {
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + extra;
  }

  function currentBgUrl() {
    return state.customBg || ROOMS[state.roomIndex].url;
  }

  function currentWall() {
    if (state.customBg) return DEFAULT_WALL;
    return ROOMS[state.roomIndex].wall || DEFAULT_WALL;
  }

  function getProductRatio() {
    if (productRatio && productRatio > 0) return productRatio;
    if (IMG_W > 0 && IMG_H > 0) return IMG_H / IMG_W;
    if (HEIGHT_CM > 0 && WIDTH_CM > 0) return HEIGHT_CM / WIDTH_CM;
    return 1;
  }

  function productScale() {
    var scene = sceneEl();
    var vpW = scene ? scene.clientWidth : 400;
    var vpH = scene ? scene.clientHeight : 300;
    var ratio = getProductRatio();
    var scale = state.sizeScale || SIZE_PRESETS[state.sizeIndex].scale;
    var w, h;

    if (ratio >= 1) {
      h = Math.min(vpH * 0.62, 240) * scale;
      w = h / ratio;
    } else {
      w = Math.min(vpW * 0.42, 260) * scale;
      h = w * ratio;
    }

    return { w: Math.round(w), h: Math.round(h) };
  }

  function onProductImgLoad(img) {
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      productRatio = img.naturalHeight / img.naturalWidth;
      renderViewport();
    }
  }

  function scaleToSlider(scale) {
    return ((scale - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * 100;
  }

  function sliderToScale(pct) {
    return SIZE_MIN + (pct / 100) * (SIZE_MAX - SIZE_MIN);
  }

  function syncSizeSliderUI() {
    var pct = scaleToSlider(state.sizeScale);
    if (els.sizeThumb) els.sizeThumb.style.bottom = pct + '%';
    if (els.sizeFill) els.sizeFill.style.height = pct + '%';
  }

  function setSizeFromSliderPct(pct) {
    pct = Math.max(0, Math.min(100, pct));
    state.sizeScale = sliderToScale(pct);
    syncSizeSliderUI();
    renderViewport();
  }

  function applyWallTint() {
    var wall = currentWall();
    els.wallTint.style.top    = wall.top + '%';
    els.wallTint.style.left   = wall.left + '%';
    els.wallTint.style.width  = wall.width + '%';
    els.wallTint.style.height = wall.height + '%';
    if (state.wallTint) {
      els.wallTint.style.background = state.wallTint;
      els.wallTint.hidden = false;
    } else {
      els.wallTint.hidden = true;
    }
  }

  // ── Build room UI ────────────────────────────────────────────────────────────
  function buildRoomUI() {
    var sizeOpts = SIZE_PRESETS.map(function (s, i) {
      var w = (WIDTH_CM * s.scale).toFixed(1);
      var h = (HEIGHT_CM * s.scale).toFixed(1);
      return '<option value="' + i + '"' + (i === state.sizeIndex ? ' selected' : '') + '>' +
        cmToIn(w) + '" x ' + cmToIn(h) + '"</option>';
    }).join('');

    var frameSwatches = FRAME_COLORS.map(function (f) {
      var style = f.id === 'none'
        ? 'background:repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%) 0 0/8px 8px'
        : 'background:' + f.color;
      return '<button type="button" class="ar-swatch' + (state.frameId === f.id ? ' ar-active' : '') + '"' +
        ' data-frame="' + f.id + '" title="' + f.label + '" style="' + style + '"></button>';
    }).join('');

    var thumbs = ROOMS.map(function (r, i) {
      return '<button type="button" class="ar-thumb' + (i === state.roomIndex && !state.customBg ? ' ar-active' : '') + '"' +
        ' data-room="' + i + '" title="' + r.name + '">' +
        '<img src="' + imgUrl(r.url, 'w=128&h=84&fit=crop') + '" alt="' + r.name + '" loading="lazy"/>' +
        '</button>';
    }).join('');

    roomEl.innerHTML =
      '<div class="ar-room-dialog">' +
        '<div class="ar-room-header">' +
          '<h2>View in Room</h2>' +
          '<div class="ar-room-header-actions">' +
            '<button type="button" id="ar-room-close" class="ar-icon-btn" title="Close">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div class="ar-room-stage">' +
        '<div class="ar-room-viewport" id="ar-viewport">' +
          '<div class="ar-viewport-canvas" id="ar-viewport-canvas">' +
            '<img class="ar-room-bg" id="ar-bg" alt="" draggable="false" loading="eager"/>' +
            '<div class="ar-wall-tint" id="ar-wall-tint"></div>' +
            '<div class="ar-product-wrap" id="ar-product-wrap">' +
              '<div class="ar-product-mat" id="ar-product-mat">' +
                '<div class="ar-product-frame" id="ar-product-frame">' +
                  '<img id="ar-product-img" src="' + IMG + '" alt="' + TITLE + '" loading="eager"/>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +

        '<div class="ar-size-slider" id="ar-size-slider">' +
          '<div class="ar-size-slider-track" id="ar-size-track">' +
            '<div class="ar-size-slider-fill" id="ar-size-fill"></div>' +
            '<button type="button" class="ar-size-slider-thumb" id="ar-size-thumb" aria-label="Drag to resize product"></button>' +
          '</div>' +
        '</div>' +

        '<div class="ar-panel ar-settings-panel' + (state.activePanel === 'settings' ? ' ar-open' : '') + '" id="ar-settings-panel">' +
          '<div class="ar-panel-head">' +
            '<strong>Settings</strong>' +
            '<button type="button" class="ar-panel-reset" id="ar-reset-settings" title="Reset">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9"/><polyline points="3 3 3 12 12 12"/></svg>' +
            '</button>' +
          '</div>' +
          '<label class="ar-field">Angle<input type="range" id="ar-angle" min="-30" max="30" value="' + state.angle + '"/></label>' +
          '<label class="ar-field">Level<input type="range" id="ar-level" min="-30" max="30" value="' + state.level + '"/></label>' +
          '<label class="ar-field">Tilt<input type="range" id="ar-pitch" min="-30" max="30" value="' + state.pitch + '"/></label>' +
          '<label class="ar-toggle-label ar-field-row">' +
            '<span>Show full background</span>' +
            '<input type="checkbox" id="ar-full-bg" ' + (state.showFullBg ? 'checked' : '') + '/>' +
          '</label>' +
          '<div class="ar-field-row">' +
            '<label class="ar-field ar-field-half">Space Width' +
              '<input type="number" id="ar-space-width" step="0.01" value="' + state.spaceWidth + '"/>' +
            '</label>' +
            '<label class="ar-field ar-field-half">Unit' +
              '<select id="ar-unit"><option value="feet"' + (state.unit === 'feet' ? ' selected' : '') + '>Feet</option>' +
              '<option value="meters"' + (state.unit === 'meters' ? ' selected' : '') + '>Meters</option>' +
              '<option value="inches"' + (state.unit === 'inches' ? ' selected' : '') + '>Inches</option></select>' +
            '</label>' +
          '</div>' +
        '</div>' +

        '<div class="ar-loading-overlay" id="ar-loading" hidden>' +
          '<div class="ar-spinner"></div>' +
          '<p class="ar-loading-text" id="ar-loading-text">Preparing AR model…</p>' +
        '</div>' +

        '</div>' + /* close viewport */
        '<div class="ar-room-bottom">' +
          '<div class="ar-bottom-left">' +
            '<button type="button" class="ar-bottom-btn' + (state.activePanel === 'settings' ? ' ar-active' : '') + '" id="ar-btn-settings">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5"/></svg>Settings</button>' +
          '</div>' +
          '<div class="ar-thumb-strip">' + thumbs + '</div>' +
          '<div class="ar-bottom-right">' +
            '<button type="button" class="ar-bottom-btn" id="ar-btn-upload">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>Upload</button>' +
            '<button type="button" class="ar-bottom-btn" id="ar-btn-save">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Save</button>' +
            '<div class="ar-popover-anchor">' +
              '<button type="button" class="ar-bottom-btn ar-btn-ar' + (state.activePanel === 'qr' ? ' ar-active' : '') + '" id="ar-btn-vr">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>View in AR</button>' +
              '<div class="ar-popover ar-qr-popover' + (state.activePanel === 'qr' ? ' ar-open' : '') + '" id="ar-qr-popover">' +
                '<button type="button" class="ar-popover-close" id="ar-qr-close" aria-label="Close">&times;</button>' +
                '<h3>Preview on your wall</h3>' +
                '<p>Scan the QR code with your phone to view in AR.</p>' +
                '<div class="ar-qr-img" id="ar-qr-img"></div>' +
              '</div>' +
            '</div>' +
            '<div class="ar-popover-anchor">' +
              '<button type="button" class="ar-customize-toggle' + (state.activePanel === 'customize' ? ' ar-open' : '') + '" id="ar-btn-customize">' +
                'Customize' +
                '<svg class="ar-chevron" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>' +
              '</button>' +
              '<div class="ar-popover ar-customize-popover' + (state.activePanel === 'customize' ? ' ar-open' : '') + '" id="ar-customize-panel">' +
                '<label class="ar-field">Size<select id="ar-size">' + sizeOpts + '</select></label>' +
                '<div class="ar-field"><span class="ar-field-label">Frame</span><div class="ar-swatches">' + frameSwatches + '</div></div>' +
                '<div class="ar-field"><span class="ar-field-label">Matting</span>' +
                  '<div class="ar-matting-btns">' +
                    '<button type="button" class="ar-mat-btn' + (state.matting === 'none' ? ' ar-active' : '') + '" data-mat="none">None</button>' +
                    '<button type="button" class="ar-mat-btn' + (state.matting === '1' ? ' ar-active' : '') + '" data-mat="1">1"</button>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' + /* close bottom */
      '</div>' + /* close stage */
      '<input type="file" id="ar-bg-upload" accept="image/*" hidden/>' +
      '</div>'; /* close dialog */

    cacheEls();
    bindRoomEvents();

    var prodImg = document.getElementById('ar-product-img');
    if (prodImg) {
      prodImg.addEventListener('load', function () { onProductImgLoad(prodImg); });
      if (prodImg.complete) onProductImgLoad(prodImg);
    }

    els.bg.addEventListener('error', function () {
      if (els.bg.dataset.fallback) return;
      els.bg.dataset.fallback = '1';
      els.bg.src = ROOMS[state.roomIndex].url;
    });

    renderViewport();
  }

  function cacheEls() {
    els.dialog      = roomEl.querySelector('.ar-room-dialog');
    els.stage       = roomEl.querySelector('.ar-room-stage');
    els.bg          = document.getElementById('ar-bg');
    els.wallTint    = document.getElementById('ar-wall-tint');
    els.productWrap = document.getElementById('ar-product-wrap');
    els.productMat  = document.getElementById('ar-product-mat');
    els.productFrame= document.getElementById('ar-product-frame');
    els.viewport    = document.getElementById('ar-viewport');
    els.canvas      = document.getElementById('ar-viewport-canvas');
    els.qrPopover   = document.getElementById('ar-qr-popover');
    els.qrImg       = document.getElementById('ar-qr-img');
    els.loading     = document.getElementById('ar-loading');
    els.bgUpload    = document.getElementById('ar-bg-upload');
    els.sizeTrack   = document.getElementById('ar-size-track');
    els.sizeThumb   = document.getElementById('ar-size-thumb');
    els.sizeFill    = document.getElementById('ar-size-fill');
  }

  function sceneEl() {
    return els.canvas || els.viewport;
  }

  function renderViewport() {
    var bgUrl = currentBgUrl();
    els.bg.src = bgUrl;
    els.bg.classList.toggle('ar-bg-contain', !state.showFullBg);
    applyWallTint();

    var size = productScale();
    var frame = frameById(state.frameId);
    var matPx = state.matting === '1' ? Math.max(8, size.w * 0.06) : 0;
    var framePx = state.frameId === 'none' ? 0 : Math.max(3, size.w * 0.015);

    els.productWrap.style.left = state.posX + '%';
    els.productWrap.style.top  = state.posY + '%';
    els.productWrap.style.width  = size.w + 'px';
    els.productWrap.style.height = size.h + 'px';

    els.productMat.style.padding = matPx + 'px';
    els.productMat.style.background = state.matting === '1' ? '#f8f6f0' : 'transparent';

    els.productFrame.style.borderWidth = framePx + 'px';
    els.productFrame.style.borderColor = frame.color;
    els.productFrame.style.borderStyle = state.frameId === 'none' ? 'none' : 'solid';
    els.productFrame.style.width  = '100%';
    els.productFrame.style.height = '100%';
    els.productFrame.classList.toggle('ar-blend', state.frameId === 'none' && state.matting === 'none');

    var transform = 'translate(-50%,-50%) perspective(800px) rotateY(' + state.angle + 'deg) rotateX(' + state.pitch + 'deg) rotateZ(' + state.level + 'deg)';
    els.productWrap.style.transform = transform;

    var img = document.getElementById('ar-product-img');
    if (img) {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.objectPosition = 'center';
    }
    syncSizeSliderUI();
  }

  function syncPanelUI() {
    var p = state.activePanel;
    var settingsPanel = document.getElementById('ar-settings-panel');
    var settingsBtn = document.getElementById('ar-btn-settings');
    var customizePanel = document.getElementById('ar-customize-panel');
    var customizeBtn = document.getElementById('ar-btn-customize');
    var qrPopover = document.getElementById('ar-qr-popover');
    var qrBtn = document.getElementById('ar-btn-vr');

    if (settingsPanel) settingsPanel.classList.toggle('ar-open', p === 'settings');
    if (settingsBtn) settingsBtn.classList.toggle('ar-active', p === 'settings');
    if (customizePanel) customizePanel.classList.toggle('ar-open', p === 'customize');
    if (customizeBtn) customizeBtn.classList.toggle('ar-open', p === 'customize');
    if (qrPopover) qrPopover.classList.toggle('ar-open', p === 'qr');
    if (qrBtn) qrBtn.classList.toggle('ar-active', p === 'qr');
  }

  function togglePanel(name) {
    state.activePanel = state.activePanel === name ? null : name;
    syncPanelUI();
  }

  function closePopovers() {
    state.activePanel = null;
    syncPanelUI();
  }

  // ── Drag product ─────────────────────────────────────────────────────────────
  function enableDrag() {
    var dragging = false;
    var startX, startY, origX, origY;

    function onDown(e) {
      if (e.target.closest('.ar-panel') || e.target.closest('.ar-room-bottom')) return;
      dragging = true;
      var pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX;
      startY = pt.clientY;
      origX = state.posX;
      origY = state.posY;
      els.productWrap.classList.add('ar-dragging');
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      var pt = e.touches ? e.touches[0] : e;
      var rect = sceneEl().getBoundingClientRect();
      var dx = ((pt.clientX - startX) / rect.width) * 100;
      var dy = ((pt.clientY - startY) / rect.height) * 100;
      state.posX = Math.max(8, Math.min(92, origX + dx));
      state.posY = Math.max(10, Math.min(85, origY + dy));
      renderViewport();
    }

    function onUp() {
      dragging = false;
      els.productWrap.classList.remove('ar-dragging');
    }

    els.productWrap.addEventListener('mousedown', onDown);
    els.productWrap.addEventListener('touchstart', onDown, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }

  function frameById(id) {
    for (var i = 0; i < FRAME_COLORS.length; i++) {
      if (FRAME_COLORS[i].id === id) return FRAME_COLORS[i];
    }
    return FRAME_COLORS[0];
  }

  function drawProductOnCanvas(ctx, exportW, exportH, scaleX, scaleY) {
    var prodImg = document.getElementById('ar-product-img');
    var size = productScale();
    var matPx = state.matting === '1' ? Math.max(8, size.w * 0.06) : 0;
    var framePx = state.frameId === 'none' ? 0 : Math.max(3, size.w * 0.015);
    var frame = frameById(state.frameId);
    var totalW = (size.w + matPx * 2 + framePx * 2) * scaleX;
    var totalH = (size.h + matPx * 2 + framePx * 2) * scaleY;
    var cx = (state.posX / 100) * exportW;
    var cy = (state.posY / 100) * exportH;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((state.level * Math.PI) / 180);
    if (matPx > 0) {
      ctx.fillStyle = '#f8f6f0';
      ctx.fillRect(-totalW / 2, -totalH / 2, totalW, totalH);
    }
    if (framePx > 0) {
      ctx.fillStyle = frame.color;
      ctx.fillRect(-totalW / 2, -totalH / 2, totalW, totalH);
    }
    var imgRatio = getProductRatio();
    var boxW = size.w * scaleX;
    var boxH = size.h * scaleY;
    var drawW = boxW;
    var drawH = boxH;
    if (imgRatio > boxH / boxW) {
      drawH = boxH;
      drawW = drawH / imgRatio;
    } else {
      drawW = boxW;
      drawH = drawW * imgRatio;
    }
    ctx.drawImage(prodImg, -drawW / 2, -drawH / 2, drawW, drawH);
    ctx.restore();
  }

  function downloadCanvas(canvas) {
    var link = document.createElement('a');
    link.download = TITLE.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-room-preview.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  // Build product texture with frame + matting for AR GLB generation
  function buildARProductImage() {
    return new Promise(function (resolve, reject) {
      var prodImg = document.getElementById('ar-product-img');
      if (!prodImg || !prodImg.complete || !prodImg.naturalWidth) {
        reject(new Error('Product image not loaded yet'));
        return;
      }

      var frame = frameById(state.frameId);
      var imgRatio = getProductRatio();
      var prodW = 1024;
      var prodH = Math.round(prodW * imgRatio);
      var matPx = state.matting === '1' ? Math.max(14, Math.round(prodW * 0.06)) : 0;
      var framePx = state.frameId === 'none' ? 0 : Math.max(6, Math.round(prodW * 0.018));
      var totalW = prodW + matPx * 2 + framePx * 2;
      var totalH = prodH + matPx * 2 + framePx * 2;

      var canvas = document.createElement('canvas');
      canvas.width = totalW;
      canvas.height = totalH;
      var ctx = canvas.getContext('2d');

      if (matPx > 0) {
        ctx.fillStyle = '#f8f6f0';
        ctx.fillRect(0, 0, totalW, totalH);
      }
      if (framePx > 0) {
        ctx.fillStyle = frame.color;
        ctx.fillRect(0, 0, totalW, totalH);
      }

      ctx.drawImage(prodImg, matPx + framePx, matPx + framePx, prodW, prodH);

      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        dims: getARDimensions()
      });
    });
  }

  function getARDimensions() {
    var w = WIDTH_CM * state.sizeScale;
    var h = HEIGHT_CM * state.sizeScale;
    if (state.matting === '1') {
      var matCm = 2.54;
      w += matCm * 2;
      h += matCm * 2;
    }
    if (state.frameId !== 'none') {
      var frameCm = 1.5;
      w += frameCm * 2;
      h += frameCm * 2;
    }
    return { w: w, h: h };
  }


  // ── Save composite image ─────────────────────────────────────────────────────
  function savePreview() {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var scene = sceneEl();
    var vw = scene.clientWidth;
    var vh = scene.clientHeight;
    var exportW = Math.min(2400, Math.max(1200, vw * 2));
    var exportH = Math.round(exportW * (vh / vw));
    canvas.width = exportW;
    canvas.height = exportH;
    var scaleX = exportW / vw;
    var scaleY = exportH / vh;

    function finishWithBg(bgImg) {
      if (bgImg) {
        if (state.showFullBg) {
          var imgRatio = bgImg.width / bgImg.height;
          var canvasRatio = exportW / exportH;
          var dw, dh, dx, dy;
          if (imgRatio > canvasRatio) {
            dh = exportH; dw = dh * imgRatio;
            dx = (exportW - dw) / 2; dy = 0;
          } else {
            dw = exportW; dh = dw / imgRatio;
            dx = 0; dy = (exportH - dh) / 2;
          }
          ctx.drawImage(bgImg, dx, dy, dw, dh);
        } else {
          ctx.drawImage(bgImg, 0, 0, exportW, exportH);
        }
      } else {
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, exportW, exportH);
      }
      if (state.wallTint) {
        var wall = currentWall();
        ctx.fillStyle = state.wallTint;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(
          (wall.left / 100) * exportW,
          (wall.top / 100) * exportH,
          (wall.width / 100) * exportW,
          (wall.height / 100) * exportH
        );
        ctx.globalAlpha = 1;
      }
      drawProductOnCanvas(ctx, exportW, exportH, scaleX, scaleY);
      downloadCanvas(canvas);
    }

    var bgUrl = currentBgUrl();
    if (bgUrl.indexOf('data:') === 0) {
      var localImg = new Image();
      localImg.onload = function () { finishWithBg(localImg); };
      localImg.src = bgUrl;
      return;
    }

    var bgImg = new Image();
    bgImg.crossOrigin = 'anonymous';
    bgImg.onload = function () { finishWithBg(bgImg); };
    bgImg.onerror = function () { finishWithBg(null); };
    bgImg.src = bgUrl;
  }

  // ── AR / QR ──────────────────────────────────────────────────────────────────
  function showQR() {
    if (state.activePanel === 'qr') {
      closePopovers();
      return;
    }
    var qr = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=10&data=' +
             encodeURIComponent(PAGE_URL);
    if (els.qrImg) {
      els.qrImg.innerHTML = '<img src="' + qr + '" width="200" height="200" alt="QR code"/>';
    }
    state.activePanel = 'qr';
    syncPanelUI();
  }

  // AR via model-viewer — GLB (Android) + USDZ (iOS Safari Quick Look)
  function launchAR(glbUrl, usdzUrl) {
    var arPage = BACKEND + '/ar/view' +
      '?glb=' + encodeURIComponent(glbUrl) +
      '&title=' + encodeURIComponent(TITLE);
    if (usdzUrl) {
      arPage += '&usdz=' + encodeURIComponent(usdzUrl);
    }
    window.location.href = arPage;
  }

  function setARLoadingMessage(msg) {
    if (!els.loading) return;
    els.loading.hidden = false;
    var text = document.getElementById('ar-loading-text');
    if (text) text.textContent = msg;
  }

  function fetchAndLaunch() {
    if (!BACKEND) {
      alert('Backend URL is not set. Go to Themes → Customize → VR Viewer block → add your app URL.');
      return;
    }
    setARLoadingMessage('Preparing your product…');

    buildARProductImage()
      .then(function (payload) {
        setARLoadingMessage('Building 3D model…');
        return fetch(BACKEND + '/api/ar-model', {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: payload.dataUrl,
            w: payload.dims.w,
            h: payload.dims.h,
            frame: state.frameId,
            matting: state.matting,
            sizeScale: state.sizeScale,
            angle: state.angle,
            level: state.level,
            pitch: state.pitch
          })
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
          return data;
        });
      })
      .then(function (data) {
        if (!data.glb && !data.usdz) throw new Error('No model URL returned');
        setARLoadingMessage('Opening AR view…');
        if (data.glb) launchAR(data.glb, data.usdz || null);
        else alert('AR model not available. Please try again.');
      })
      .catch(function (err) {
        els.loading.hidden = true;
        console.error('[AR Viewer]', err);
        alert('Could not load AR model: ' + err.message);
      });
  }

  function onViewAR() {
    if (isMobile) {
      closePopovers();
      fetchAndLaunch();
    } else {
      showQR();
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────────
  function bindRoomEvents() {
    document.getElementById('ar-room-close').addEventListener('click', closeRoom);
    roomEl.addEventListener('click', function (e) {
      if (e.target === roomEl) closeRoom();
    });

    document.getElementById('ar-btn-settings').addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel('settings');
    });
    document.getElementById('ar-btn-customize').addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel('customize');
    });

    document.getElementById('ar-angle').addEventListener('input', function (e) {
      state.angle = parseFloat(e.target.value); renderViewport();
    });
    document.getElementById('ar-level').addEventListener('input', function (e) {
      state.level = parseFloat(e.target.value); renderViewport();
    });
    document.getElementById('ar-pitch').addEventListener('input', function (e) {
      state.pitch = parseFloat(e.target.value); renderViewport();
    });
    document.getElementById('ar-full-bg').addEventListener('change', function (e) {
      state.showFullBg = e.target.checked; renderViewport();
    });
    document.getElementById('ar-space-width').addEventListener('input', function (e) {
      state.spaceWidth = parseFloat(e.target.value) || state.spaceWidth;
    });
    document.getElementById('ar-unit').addEventListener('change', function (e) {
      state.unit = e.target.value;
    });
    document.getElementById('ar-reset-settings').addEventListener('click', function () {
      state.angle = 0; state.level = 0; state.pitch = 0; state.showFullBg = true;
      state.spaceWidth = 16.96; state.unit = 'feet';
      state.wallTint = null;
      state.posX = 50;
      state.posY = ROOMS[state.roomIndex].productY || 30;
      state.sizeIndex = 1;
      state.sizeScale = 1.0;
      buildRoomUI();
    });

    document.getElementById('ar-size').addEventListener('change', function (e) {
      state.sizeIndex = parseInt(e.target.value, 10);
      state.sizeScale = SIZE_PRESETS[state.sizeIndex].scale;
      syncSizeSliderUI();
      renderViewport();
    });

    roomEl.querySelectorAll('.ar-swatch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.frameId = btn.dataset.frame;
        roomEl.querySelectorAll('.ar-swatch').forEach(function (b) { b.classList.remove('ar-active'); });
        btn.classList.add('ar-active');
        renderViewport();
      });
    });
    roomEl.querySelectorAll('.ar-mat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.matting = btn.dataset.mat;
        roomEl.querySelectorAll('.ar-mat-btn').forEach(function (b) { b.classList.remove('ar-active'); });
        btn.classList.add('ar-active');
        renderViewport();
      });
    });

    roomEl.querySelectorAll('.ar-thumb').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.room, 10);
        state.roomIndex = idx;
        state.customBg = null;
        state.wallTint = null;
        state.posY = ROOMS[idx].productY || 30;
        state.posX = 50;
        roomEl.querySelectorAll('.ar-thumb').forEach(function (b) { b.classList.remove('ar-active'); });
        btn.classList.add('ar-active');
        renderViewport();
      });
    });

    document.getElementById('ar-btn-upload').addEventListener('click', function () {
      els.bgUpload.click();
    });
    els.bgUpload.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        state.customBg = ev.target.result;
        state.wallTint = null;
        state.posX = 50;
        state.posY = DEFAULT_WALL.top + DEFAULT_WALL.height * 0.45;
        roomEl.querySelectorAll('.ar-thumb').forEach(function (b) { b.classList.remove('ar-active'); });
        renderViewport();
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    document.getElementById('ar-btn-save').addEventListener('click', savePreview);
    document.getElementById('ar-btn-vr').addEventListener('click', function (e) {
      e.stopPropagation();
      onViewAR();
    });
    document.getElementById('ar-qr-close').addEventListener('click', function (e) {
      e.stopPropagation();
      closePopovers();
    });

    document.addEventListener('click', function (e) {
      if (!roomEl.classList.contains('ar-open')) return;
      if (e.target.closest('.ar-popover-anchor') || e.target.closest('.ar-settings-panel')) return;
      if (state.activePanel === 'qr' || state.activePanel === 'customize') closePopovers();
    });

    enableDrag();
    enableSizeSlider();
  }

  function enableSizeSlider() {
    var track = els.sizeTrack;
    var thumb = els.sizeThumb;
    if (!track || !thumb) return;

    var dragging = false;

    function pctFromEvent(e) {
      var rect = track.getBoundingClientRect();
      var y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return 100 - (y / rect.height) * 100;
    }

    function onDown(e) {
      dragging = true;
      thumb.classList.add('ar-dragging');
      setSizeFromSliderPct(pctFromEvent(e));
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      setSizeFromSliderPct(pctFromEvent(e));
    }

    function onUp() {
      dragging = false;
      thumb.classList.remove('ar-dragging');
    }

    thumb.addEventListener('mousedown', onDown);
    thumb.addEventListener('touchstart', onDown, { passive: false });
    track.addEventListener('mousedown', function (e) {
      if (e.target === thumb) return;
      setSizeFromSliderPct(pctFromEvent(e));
    });
    track.addEventListener('touchstart', function (e) {
      if (e.target === thumb) return;
      setSizeFromSliderPct(pctFromEvent(e));
    }, { passive: false });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }

  function openRoom() {
    state.posY = ROOMS[state.roomIndex].productY || 30;
    buildRoomUI();
    roomEl.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(function () {
      roomEl.classList.add('ar-open');
      requestAnimationFrame(function () {
        renderViewport();
      });
    });
  }

  function closeRoom() {
    roomEl.classList.remove('ar-open');
    roomEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(function () { roomEl.innerHTML = ''; }, 300);
  }

  fab.addEventListener('click', openRoom);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && roomEl.classList.contains('ar-open')) closeRoom();
  });

  var lastY = window.scrollY;
  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    if      (y > lastY + 60)  fab.classList.add('ar-fab-hide');
    else if (y < lastY - 10)  fab.classList.remove('ar-fab-hide');
    lastY = y;
  }, { passive: true });

})();
