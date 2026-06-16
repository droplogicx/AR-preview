(function () {
  'use strict';

  var root = document.getElementById('ar-root');
  if (!root) return;

  var TITLE    = root.dataset.title   || 'Product';
  var IMG      = root.dataset.img     || '';
  var IMG_THUMB = root.dataset.imgThumb || '';
  var IMG_W    = parseFloat(root.dataset.imgW   || '0');
  var IMG_H    = parseFloat(root.dataset.imgH   || '0');
  var BACKEND  = (root.dataset.backend || '').replace(/\/$/, '');
  var SHOP_DOMAIN = root.dataset.shop || '';
  var WIDTH_CM = parseFloat(root.dataset.width  || '60');
  var HEIGHT_CM = parseFloat(root.dataset.height || '40');
  var PAGE_URL = window.location.href;

  if (!BACKEND) {
    if (typeof window.Shopify !== 'undefined' && window.Shopify.shop) {
      BACKEND = 'https://' + window.Shopify.shop + '/apps/ar-preview';
    } else if (SHOP_DOMAIN) {
      BACKEND = 'https://' + SHOP_DOMAIN + '/apps/ar-preview';
    }
  }

  if (IMG.indexOf('//') === 0) IMG = 'https:' + IMG;
  if (IMG_THUMB.indexOf('//') === 0) IMG_THUMB = 'https:' + IMG_THUMB;

  function toSecureUrl(url) {
    if (!url) return '';
    url = String(url).trim();
    if (url.indexOf('//') === 0) url = 'https:' + url;
    if (url.indexOf('http://') === 0) url = 'https://' + url.slice(7);
    return url;
  }

  var productRatio = null;

  var ua        = navigator.userAgent || '';
  var isIOS     = /iphone|ipad|ipod/i.test(ua);
  var isAndroid = /android/i.test(ua);
  var isMobile  = isIOS || isAndroid;

  var DEFAULT_WALL = { top: 8, left: 10, width: 80, height: 42 };

  var ROOM_FALLBACK = [
    { name: 'Living Room', wall: { top: 14, left: 3, width: 94, height: 52 }, productY: 38, paintable: false },
    { name: 'Bedroom', wall: { top: 8, left: 5, width: 90, height: 58 }, productY: 34, paintable: false },
    { name: 'Coastal Lounge', wall: { top: 12, left: 4, width: 92, height: 50 }, productY: 36, paintable: false },
    { name: 'Empty Wall', wall: { top: 0, left: 0, width: 100, height: 84 }, productY: 38, paintable: true },
    { name: 'Rustic Dining', wall: { top: 10, left: 4, width: 92, height: 48 }, productY: 32, paintable: false },
    { name: 'Bathroom', wall: { top: 6, left: 6, width: 88, height: 55 }, productY: 30, paintable: false },
    { name: 'Modern Dining', wall: { top: 8, left: 5, width: 90, height: 50 }, productY: 34, paintable: false },
    { name: 'Study', wall: { top: 10, left: 8, width: 84, height: 52 }, productY: 36, paintable: false }
  ];

  var ROOMS = [];
  (function loadRooms() {
    var el = document.getElementById('ar-rooms-data');
    if (el) {
      try { ROOMS = JSON.parse(el.textContent.trim()); } catch (e) { ROOMS = []; }
    }
    ROOMS = ROOMS.filter(function (r) { return r && r.url; });
    if (!ROOMS.length) {
      var root = document.getElementById('ar-root');
      if (root) {
        ROOMS = ROOM_FALLBACK.map(function (meta, i) {
          var url = root.getAttribute('data-room-' + i) || '';
          return {
            name: meta.name,
            url: url,
            wall: meta.wall,
            productY: meta.productY,
            paintable: meta.paintable === true
          };
        }).filter(function (r) { return r.url; });
      }
    }
    ROOMS = ROOMS.map(function (r) {
      r.paintable = r.paintable === true;
      return r;
    });
    if (!ROOMS.length) {
      ROOMS = [{ name: 'Room', url: '', wall: DEFAULT_WALL, productY: 32, paintable: false }];
    }
  })();

  var SESSION_ROOMS = [];

  function isRoomPaintable(index) {
    if (index == null) index = state.roomIndex;
    var room = getRoom(index);
    if (!room || room.uploaded) return false;
    return room.paintable === true;
  }

  function syncPaintButton() {
    var paintBtn = document.getElementById('ar-btn-paint');
    if (!paintBtn) return;
    var canPaint = isRoomPaintable(state.roomIndex);
    paintBtn.disabled = !canPaint;
    paintBtn.classList.toggle('ar-disabled', !canPaint);
    paintBtn.setAttribute('aria-disabled', canPaint ? 'false' : 'true');
    paintBtn.title = canPaint ? 'Paint wall color' : 'Wall paint not available for this background';
    if (!canPaint && state.activePanel === 'paint') closePopovers();
  }

  function allRooms() {
    return SESSION_ROOMS.concat(ROOMS);
  }

  function getRoom(index) {
    var rooms = allRooms();
    if (!rooms.length) return null;
    return rooms[index] || rooms[0];
  }

  function buildThumbsHtml() {
    return allRooms().map(function (r, i) {
      return '<button type="button" class="ar-thumb' + (i === state.roomIndex ? ' ar-active' : '') + '"' +
        ' data-room="' + i + '" title="' + (r.name || 'Room') + '">' +
        '<img src="' + r.url + '" alt="' + (r.name || 'Room') + '" loading="lazy"/>' +
        '</button>';
    }).join('');
  }

  function bindThumbEvents() {
    roomEl.querySelectorAll('.ar-thumb').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.room, 10);
        var room = getRoom(idx);
        state.roomIndex = idx;
        state.posY = room ? (room.productY || 30) : 30;
        state.posX = 50;
        if (isRoomPaintable(idx)) {
          state.wallTint = paintColorById(state.paintId);
        } else {
          state.wallTint = null;
          if (state.activePanel === 'paint') closePopovers();
        }
        roomEl.querySelectorAll('.ar-thumb').forEach(function (b) { b.classList.remove('ar-active'); });
        btn.classList.add('ar-active');
        renderViewport();
        syncPaintButton();
        centerActiveThumb();
      });
    });
  }

  function refreshThumbStrip() {
    var strip = roomEl.querySelector('.ar-thumb-strip');
    if (!strip) return;
    strip.innerHTML = buildThumbsHtml();
    bindThumbEvents();
  }

  var DEFAULT_PAINT_COLOR = '#333333';

  var WALL_PAINT_HEX = [
    '#333333', '#FFFFFF', '#FAFAF8', '#F6F4F0', '#F2EFE8',
    '#EDEAE2', '#E8E4DB', '#E2DDD2', '#DCD6C9', '#D6CFC0',
    '#D0C8B7', '#C9C1AE', '#C2BAA5', '#BBB29C', '#B4AA93',
    '#ADA28A', '#A69B82', '#8E8E8E', '#7A7A7A', '#666666',
    '#525252', '#3E3E3E', '#2E2E2E', '#1E1E1E', '#0F0F0F',
    '#B8D4E8', '#8CB4D4', '#6094C0', '#3A7498', '#1E5470',
    '#4A8090', '#5E9498', '#72A8A0', '#86BCA8', '#9AD0B0',
    '#6A9878', '#7EAC88', '#92C098', '#A6D4A8', '#BAE8B8',
    '#F0E8C8', '#E8DCA8', '#E0D088', '#D8C468', '#D0B848',
    '#C89870', '#BC8870', '#B07868', '#A46860', '#985858',
    '#C87078', '#D08090', '#D890A8', '#E0A0C0', '#E8B0D8',
    '#9070A8', '#806898', '#706088', '#806860', '#705848'
  ];

  var WALL_PAINT_COLORS = WALL_PAINT_HEX.map(function (hex, i) {
    return { id: 'c' + (i + 1), color: hex, label: 'Wall ' + (i + 1) };
  });

  var DEFAULT_PAINT_ID = 'c1';

  function isLightColor(hex) {
    if (!hex || hex.charAt(0) !== '#') return true;
    var r = parseInt(hex.slice(1, 3), 16);
    var g = parseInt(hex.slice(3, 5), 16);
    var b = parseInt(hex.slice(5, 7), 16);
    return (r * 299 + g * 587 + b * 114) / 1000 > 160;
  }

  function paintColorById(id) {
    if (id === 'custom') return state.customPaintColor || DEFAULT_PAINT_COLOR;
    for (var i = 0; i < WALL_PAINT_COLORS.length; i++) {
      if (WALL_PAINT_COLORS[i].id === id) return WALL_PAINT_COLORS[i].color;
    }
    return DEFAULT_PAINT_COLOR;
  }

  var SIZE_PRESETS = [
    { label: 'A4', w: 21,  h: 30 },
    { label: 'A3', w: 30,  h: 42 },
    { label: 'A2', w: 42,  h: 60 },
    { label: 'A1', w: 60,  h: 84 },
    { label: 'B1', w: 70,  h: 100 },
    { label: 'A0', w: 84,  h: 119 },
    { label: 'B0', w: 100, h: 141 }
  ];

  function presetScale(p) {
    return WIDTH_CM > 0 ? p.w / WIDTH_CM : 1;
  }

  function defaultSizeIndex() {
    var best = 0;
    var bestDiff = Infinity;
    SIZE_PRESETS.forEach(function (p, i) {
      var d = Math.abs(p.w - WIDTH_CM);
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    return best;
  }

  var DEFAULT_SIZE_INDEX = defaultSizeIndex();
  var SIZE_MIN = presetScale(SIZE_PRESETS[0]);
  var SIZE_MAX = presetScale(SIZE_PRESETS[SIZE_PRESETS.length - 1]);

  function activePresetRatio() {
    var p = SIZE_PRESETS[state.sizeIndex] || SIZE_PRESETS[DEFAULT_SIZE_INDEX];
    return p.w > 0 ? p.h / p.w : getProductRatio();
  }

  function outerSizeCm() {
    var w = WIDTH_CM * state.sizeScale;
    return { w: w, h: w * activePresetRatio() };
  }

  function matPaddingPx(outerPx, outerCm) {
    if (state.frameId === 'none' || state.matting !== '1') return 0;
    return Math.max(4, Math.round((MAT_INCH_CM / outerCm) * outerPx));
  }

  function frameBorderPx(outerPx, outerCm) {
    if (state.frameId === 'none') return 0;
    return Math.max(4, Math.round((FRAME_CM / outerCm) * outerPx));
  }

  var FRAME_COLORS = [
    { id: 'none',           color: 'transparent', label: 'None' },
    { id: 'natural-timber', color: '#c4a574',     label: 'Natural Timber' },
    { id: 'white',          color: '#f5f5f0',     label: 'White Frame' },
    { id: 'black',          color: '#1a1a1a',     label: 'Black Frame' }
  ];

  var CM_PER_FOOT = 30.48;
  var CM_PER_METER = 100;

  function formatSpaceWidth(val) {
    return Math.round(val * 100) / 100;
  }

  function cmToDisplayUnit(cm, unit) {
    if (unit === 'meters') return formatSpaceWidth(cm / CM_PER_METER);
    return formatSpaceWidth(cm / CM_PER_FOOT);
  }

  function displayUnitToCm(val, unit) {
    if (unit === 'meters') return val * CM_PER_METER;
    return val * CM_PER_FOOT;
  }

  function defaultSpaceWidth(unit) {
    return cmToDisplayUnit(WIDTH_CM, unit || 'feet');
  }

  var MAT_COLOR = '#ffffff';
  var MAT_INCH_CM = 2.54;
  var FRAME_CM = 1.5;

  var state = {
    roomIndex: 0,
    posX: 50,
    posY: 32,
    sizeIndex: DEFAULT_SIZE_INDEX,
    sizeScale: presetScale(SIZE_PRESETS[DEFAULT_SIZE_INDEX]),
    angle: 0,
    level: 0,
    pitch: 0,
    spaceWidth: cmToDisplayUnit(SIZE_PRESETS[DEFAULT_SIZE_INDEX].w, 'feet'),
    unit: 'feet',
    showFullBg: false,
    frameId: 'none',
    matting: 'none',
    wallTint: null,
    activePanel: null,
    fullWidth: false,
    showInterface: true,
    paintId: DEFAULT_PAINT_ID,
    customPaintColor: null
  };

  function imgUrl(base, extra) {
    return base + (base.indexOf('?') >= 0 ? '&' : '?') + extra;
  }

  // ── Inject product CTA (above Add to Cart form) ─────────────────────────────
  function findAddToCartForm() {
    var selectors = [
      'form[data-type="add-to-cart-form"]',
      'form.shopify-product-form',
      'form.product-single__form',
      'form[action*="/cart/add"]'
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  var fabHtml =
    '<button id="ar-fab" class="ar-fab-inline" aria-label="Preview in your room">' +
      '<span class="ar-fab-text">Preview here</span>' +
    '</button>';

  var fabMountedInline = false;
  var addForm = findAddToCartForm();
  if (addForm && addForm.parentNode) {
    var fabWrap = document.createElement('div');
    fabWrap.className = 'ar-product-cta';
    fabWrap.innerHTML = fabHtml;
    addForm.parentNode.insertBefore(fabWrap, addForm);
    fabMountedInline = true;
  } else {
    document.body.insertAdjacentHTML('beforeend',
      '<button id="ar-fab" aria-label="Preview in your room"><span class="ar-fab-text">Preview here</span></button>'
    );
  }

  document.body.insertAdjacentHTML('beforeend',
    '<div id="ar-splash" aria-hidden="true">' +
      '<div class="ar-splash-backdrop"></div>' +
      '<div class="ar-splash-top">' +
        '<button type="button" class="ar-splash-icon-btn" id="ar-splash-fullscreen" aria-label="Full screen">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>' +
          '</svg>' +
        '</button>' +
        '<button type="button" class="ar-splash-icon-btn" id="ar-splash-close" aria-label="Close">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
            '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
          '</svg>' +
        '</button>' +
      '</div>' +
      '<div class="ar-splash-loader" aria-hidden="true">' +
        '<div class="ar-splash-loader-bar"></div>' +
      '</div>' +
    '</div>' +
    '<div id="ar-room" aria-hidden="true"></div>'
  );

  var fab      = document.getElementById('ar-fab');
  var splashEl = document.getElementById('ar-splash');
  var roomEl   = document.getElementById('ar-room');
  var els      = {};
  var openGeneration = 0;
  var splashMaxTimer = null;
  var roomOpening = false;
  var blockBackdropCloseUntil = 0;

  function cmToIn(cm) { return (cm / 2.54).toFixed(1); }

  function productWidthCm() {
    return WIDTH_CM * (state.sizeScale || 1);
  }

  function syncSpaceWidthFields(skipIfFocused) {
    var sw = cmToDisplayUnit(productWidthCm(), state.unit);
    state.spaceWidth = sw;
    var spaceEl = document.getElementById('ar-space-width');
    if (spaceEl && (!skipIfFocused || document.activeElement !== spaceEl)) {
      spaceEl.value = sw.toFixed(2);
    }
  }

  function syncSizeIndexFromScale() {
    var currentW = WIDTH_CM * state.sizeScale;
    var best = DEFAULT_SIZE_INDEX;
    var bestDiff = Infinity;
    SIZE_PRESETS.forEach(function (p, i) {
      var d = Math.abs(p.w - currentW);
      if (d < bestDiff) { bestDiff = d; best = i; }
    });
    state.sizeIndex = best;
    var sizeEl = document.getElementById('ar-size');
    if (sizeEl) sizeEl.value = String(best);
  }

  function applySpaceWidthInput(val) {
    if (!(val > 0) || !(WIDTH_CM > 0)) return;
    var cm = displayUnitToCm(val, state.unit);
    state.sizeScale = Math.max(SIZE_MIN, Math.min(SIZE_MAX, cm / WIDTH_CM));
    state.spaceWidth = formatSpaceWidth(val);
    syncSizeIndexFromScale();
    syncSizeSliderUI();
    renderViewport();
  }

  function currentBgUrl() {
    var room = getRoom(state.roomIndex);
    return room ? room.url : '';
  }

  function currentWall() {
    var room = getRoom(state.roomIndex);
    if (!room) return DEFAULT_WALL;
    if (room.paintable && room.name === 'Empty Wall') {
      return { top: 0, left: 0, width: 100, height: 84 };
    }
    return room.wall || DEFAULT_WALL;
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
    var scale = state.sizeScale || presetScale(SIZE_PRESETS[state.sizeIndex]);
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
      return '<option value="' + i + '"' + (i === state.sizeIndex ? ' selected' : '') + '>' +
        s.label + ': ' + s.w + 'x' + s.h + ' cm</option>';
    }).join('');

    var frameSwatches = FRAME_COLORS.map(function (f) {
      var extraCls = f.id === 'none' ? ' ar-swatch-none' : '';
      var style = f.id === 'none' ? '' : 'background:' + f.color;
      return '<button type="button" class="ar-swatch' + extraCls + (state.frameId === f.id ? ' ar-active' : '') + '"' +
        ' data-frame="' + f.id + '" title="' + f.label + '"' +
        (style ? ' style="' + style + '"' : '') + '></button>';
    }).join('');

    var thumbs = buildThumbsHtml();

    var paintSwatches = WALL_PAINT_COLORS.map(function (c) {
      var active = state.paintId === c.id;
      var checkCls = active ? (isLightColor(c.color) ? ' ar-check-dark' : ' ar-check-light') : '';
      return '<button type="button" class="ar-paint-swatch' + (active ? ' ar-active' : '') + checkCls + '"' +
        ' data-paint="' + c.id + '" data-hex="' + c.color + '" title="' + c.label + '" style="background:' + c.color + '"></button>';
    }).join('');

    roomEl.innerHTML =
      '<div class="ar-room-chrome">' +
        '<div class="ar-room-top">' +
          '<button type="button" class="ar-splash-icon-btn" id="ar-room-fullscreen" aria-label="Full width" aria-pressed="false">' +
            '<svg class="ar-icon-expand" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M15 4.88897V3.33308C15 2.71431 14.7542 2.12088 14.3167 1.68334C13.8791 1.24581 13.2857 1 12.6669 1H10.3331M10.3331 15H12.6669C13.2857 15 13.8791 14.7542 14.3167 14.3167C14.7542 13.8791 15 13.2857 15 12.6669V11.1103M1 11.111V12.6669C1 13.2857 1.24581 13.8791 1.68334 14.3167C2.12088 14.7542 2.71431 15 3.33308 15H5.66692M5.66692 1H3.33308C2.71431 1 2.12088 1.24581 1.68334 1.68334C1.24581 2.12088 1 2.71431 1 3.33308V4.88973" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
            '<svg class="ar-icon-compress" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="1.5"><path d="m3 6v-3h3" transform="matrix(-1 0 0 -1 9 9)"></path><path d="m14 6v-3h3" transform="matrix(0 -1 1 0 11 20)"></path><path d="m14 17v-3h3"></path><path d="m3 17v-3h3" transform="matrix(0 1 -1 0 20 11)"></path></g></svg>' +
          '</button>' +
          '<button type="button" class="ar-splash-icon-btn" id="ar-room-close" aria-label="Close">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<label class="ar-show-ui-toggle ar-chrome-toggle">' +
          '<input type="checkbox" id="ar-show-ui" ' + (state.showInterface ? 'checked' : '') + '/>' +
          '<span class="ar-knob-track"><span class="ar-knob-thumb"></span></span>' +
          '<span>Show interface</span>' +
        '</label>' +
        '<div class="ar-size-slider" id="ar-size-slider">' +
          '<div class="ar-size-slider-track" id="ar-size-track">' +
            '<div class="ar-size-slider-fill" id="ar-size-fill"></div>' +
            '<button type="button" class="ar-size-slider-thumb" id="ar-size-thumb" aria-label="Drag to resize"></button>' +
          '</div>' +
        '</div>' +
        '<div class="ar-room-bottom-chrome">' +
          '<div class="ar-room-bottom-left">' +
            '<div class="ar-toolbar ar-toolbar-left">' +
              '<div class="ar-popover-anchor ar-popover-anchor-left">' +
                '<button type="button" class="ar-action-btn' + (state.activePanel === 'settings' ? ' ar-active' : '') + '" id="ar-btn-settings" aria-label="Settings">' +
                  '<span class="ar-action-label">Settings</span><svg height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><g fill="none" fill-rule="evenodd" stroke="currentColor" stroke-width="1.5" transform="matrix(.70710678 -.70710678 .70710678 .70710678 2.221748 13.535775)"><path d="m3.5 6v-2"></path><path d="m6.5 6v-2m3 2v-2m3 2v-2m-7.5-4v2m6-2v2"></path><path d="m0 0h16v6h-16z"></path></g></svg>' +
                '</button>' +
                '<div class="ar-popover ar-settings-popover' + (state.activePanel === 'settings' ? ' ar-open' : '') + '" id="ar-settings-panel">' +
                  '<div class="ar-panel-head">' +
                    '<strong>Settings</strong>' +
                    '<button type="button" class="ar-panel-reset" id="ar-reset-settings" title="Reset" aria-label="Reset settings">' +
                      '<svg height="20" viewBox="0 0 20 20" width="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
                        '<g fill="none" fill-rule="evenodd">' +
                          '<path d="m3.5 9.75c0-3.72792206 3.02207794-6.75 6.75-6.75 3.7279221 0 6.75 3.02207794 6.75 6.75 0 3.7279221-3.0220779 6.75-6.75 6.75-1.5815153 0-3.03599602-.5438997-4.18659337-1.4548503" stroke="currentColor" stroke-linecap="round" stroke-width="1.5"></path>' +
                          '<path d="m1.13684501 9.5077492 1.97891304 3.4670041c.13688857.2398252.44227542.3232719.68210063.1863833.0776802-.0443387.1420446-.1087031.18638327-.1863833l2.01824675-3.53591574c.13688857-.23982521.05344194-.54521206-.18638327-.68210063-.15462952-.08826017-.3445275-.08763474-.4985723.00164204l-1.84702009 1.07044197-1.63981362-.99624924c-.23600167-.14338-.54355127-.06829531-.68693128.16770636-.09436699.15532687-.09701772.34962776-.00692313.50747114z" fill="currentColor"></path>' +
                        '</g>' +
                      '</svg>' +
                    '</button>' +
                  '</div>' +
                  '<label class="ar-field ar-range-field">Angle<input type="range" id="ar-angle" min="-30" max="30" value="' + state.angle + '"/></label>' +
                  '<label class="ar-field ar-range-field">Level<input type="range" id="ar-level" min="-30" max="30" value="' + state.level + '"/></label>' +
                  '<div class="ar-field-row ar-settings-inputs">' +
                    '<label class="ar-field ar-field-half">Space Width' +
                      '<input type="number" id="ar-space-width" step="0.01" min="0.01" value="' + state.spaceWidth.toFixed(2) + '"/>' +
                    '</label>' +
                    '<label class="ar-field ar-field-half">Unit' +
                      '<select id="ar-unit"><option value="feet"' + (state.unit === 'feet' ? ' selected' : '') + '>Feet</option>' +
                      '<option value="meters"' + (state.unit === 'meters' ? ' selected' : '') + '>Meters</option></select>' +
                    '</label>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="ar-popover-anchor ar-popover-anchor-left">' +
                '<button type="button" class="ar-action-btn' + (state.activePanel === 'help' ? ' ar-active' : '') + '" id="ar-btn-help" aria-label="Help">' +
                  '<span class="ar-action-label">Help</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' +
                '</button>' +
                '<div class="ar-popover ar-help-popover' + (state.activePanel === 'help' ? ' ar-open' : '') + '" id="ar-help-panel">' +
                  '<button type="button" class="ar-help-close" id="ar-help-close" aria-label="Close">&times;</button>' +
                  '<h3>Help</h3>' +
                  '<ul class="ar-help-list">' +
                    '<li><span class="ar-help-icon">&#x1F4F1;</span><span>Live preview this product in your own 3D space/room using AR</span></li>' +
                    '<li><span class="ar-help-icon">&#x2B07;</span><span>Save your newly curated product with your selected background to your device</span></li>' +
                    '<li><span class="ar-help-icon">&#x1F5BC;</span><span>Upload your own background from your files</span></li>' +
                    '<li><span class="ar-help-icon">&#x2699;</span><span>Configure angles, levels, and background frame within the Settings</span></li>' +
                  '</ul>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="ar-room-bottom-right">' +
            '<div class="ar-room-bottom-right-col">' +
              '<div class="ar-popover-anchor ar-popover-anchor-right ar-popover-anchor-customize">' +
                '<button type="button" class="ar-customize-toggle' + (state.activePanel === 'customize' ? ' ar-open' : '') + '" id="ar-btn-customize">' +
                  'Customize<svg class="ar-chevron" viewBox="0 0 24 24" fill="currentColor"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>' +
                '</button>' +
                '<div class="ar-popover ar-customize-popover' + (state.activePanel === 'customize' ? ' ar-open' : '') + '" id="ar-customize-panel">' +
                  '<label class="ar-field">Size<select id="ar-size">' + sizeOpts + '</select></label>' +
                  '<div class="ar-field"><span class="ar-field-label" id="ar-frame-label">Frame: <strong>None</strong></span><div class="ar-swatches">' + frameSwatches + '</div></div>' +
                  '<div class="ar-field' + (state.frameId === 'none' ? ' ar-matting-disabled' : '') + '" id="ar-matting-field">' +
                    '<span class="ar-field-label">Border Options:</span>' +
                    '<div class="ar-matting-btns">' +
                      '<button type="button" class="ar-mat-btn' + (state.matting === 'none' ? ' ar-active' : '') + '" data-mat="none">None</button>' +
                      '<button type="button" class="ar-mat-btn' + (state.matting === '1' ? ' ar-active' : '') + '" data-mat="1">White</button>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="ar-toolbar ar-toolbar-right">' +
                '<div class="ar-popover-anchor ar-popover-anchor-right ar-popover-anchor-paint">' +
                  '<button type="button" class="ar-action-btn' + (state.activePanel === 'paint' ? ' ar-active' : '') + '" id="ar-btn-paint" aria-label="Paint">' +
                    '<span class="ar-action-label">Paint</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/></svg>' +
                  '</button>' +
                  '<div class="ar-popover ar-paint-popover' + (state.activePanel === 'paint' ? ' ar-open' : '') + '" id="ar-paint-panel">' +
                    '<div class="ar-paint-swatches">' + paintSwatches + '</div>' +
                    '<button type="button" class="ar-paint-custom-btn' + (state.paintId === 'custom' ? ' ar-active' : '') + '" id="ar-paint-custom-trigger">Pick other colors</button>' +
                    '<input type="color" id="ar-paint-custom-input" class="ar-paint-custom-input" value="' + (state.customPaintColor || DEFAULT_PAINT_COLOR) + '"/>' +
                  '</div>' +
                '</div>' +
                '<button type="button" class="ar-action-btn" id="ar-btn-upload" aria-label="Upload">' +
                  '<span class="ar-action-label">Upload</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
                '</button>' +
                '<button type="button" class="ar-action-btn" id="ar-btn-save" aria-label="Save">' +
                  '<span class="ar-save-label">Save</span>' +
                  '<span class="ar-save-icon-slot" aria-hidden="true">' +
                    '<svg class="ar-save-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
                    '<span class="ar-save-spinner" aria-hidden="true"></span>' +
                  '</span>' +
                '</button>' +
                '<div class="ar-popover-anchor ar-popover-anchor-right ar-popover-anchor-ar">' +
                  '<button type="button" class="ar-action-btn ar-action-ar' + (state.activePanel === 'ar' ? ' ar-active' : '') + '" id="ar-btn-vr" aria-label="View in AR">' +
                    '<span class="ar-action-label">View in AR</span>' +
                    '<span class="ar-save-icon-slot" aria-hidden="true">' +
                      '<svg class="ar-ar-icon" width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M7.24932 3.2763L4.16553 4.98808C3.92503 5.12228 3.7248 5.31837 3.58561 5.55602C3.44643 5.79368 3.37335 6.06424 3.37397 6.33965V9.6603C3.37335 9.93571 3.44643 10.2063 3.58561 10.4439C3.7248 10.6816 3.92503 10.8777 4.16553 11.0119L7.24932 12.7237C7.4789 12.8514 7.73729 12.9185 8.00002 12.9185C8.26276 12.9185 8.52114 12.8514 8.75072 12.7237L11.8345 11.0119C12.075 10.8777 12.2752 10.6816 12.4144 10.4439C12.5536 10.2063 12.6267 9.93571 12.6261 9.6603V6.33965C12.6267 6.06424 12.5536 5.79368 12.4144 5.55602C12.2752 5.31837 12.075 5.12228 11.8345 4.98808L8.75072 3.2763C8.52114 3.14854 8.26276 3.08148 8.00002 3.08148C7.73729 3.08148 7.4789 3.14854 7.24932 3.2763Z" stroke="currentColor" stroke-width="1.5"></path><path d="M12.3128 5.40962L8.00001 8M8.00001 8L3.68726 5.40962M8.00001 8V12.9144" stroke="currentColor" stroke-width="1.5"></path><path d="M15 4.88897V3.33308C15 2.71431 14.7542 2.12088 14.3167 1.68334C13.8791 1.24581 13.2857 1 12.6669 1H10.3331M10.3331 15H12.6669C13.2857 15 13.8791 14.7542 14.3167 14.3167C14.7542 13.8791 15 13.2857 15 12.6669V11.1103M1 11.111V12.6669C1 13.2857 1.24581 13.8791 1.68334 14.3167C2.12088 14.7542 2.71431 15 3.33308 15H5.66692M5.66692 1H3.33308C2.71431 1 2.12088 1.24581 1.68334 1.68334C1.24581 2.12088 1 2.71431 1 3.33308V4.88973" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path></svg>' +
                      '<span class="ar-save-spinner ar-ar-spinner" aria-hidden="true"></span>' +
                    '</span>' +
                  '</button>' +
                  '<div class="ar-popover ar-qr-popover' + (state.activePanel === 'ar' ? ' ar-open' : '') + '" id="ar-qr-popover">' +
                    '<button type="button" class="ar-qr-close" id="ar-qr-close" aria-label="Close">&times;</button>' +
                    '<h3>Preview on your wall</h3>' +
                    '<p>To view this in your room, start by scanning the QR code below.</p>' +
                    '<div class="ar-qr-img" id="ar-qr-img"></div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="ar-room-dialog' + (state.showInterface ? ' ar-show-ui' : '') + '">' +
        '<div class="ar-room-stage">' +
          '<div class="ar-room-viewport" id="ar-viewport">' +
            '<div class="ar-room-preview-wrap">' +
              '<div class="ar-viewport-canvas" id="ar-viewport-canvas">' +
                '<img class="ar-room-bg" id="ar-bg" src="' + currentBgUrl() + '" alt="" draggable="false" loading="eager"/>' +
                '<div class="ar-wall-tint" id="ar-wall-tint"></div>' +
                '<div class="ar-product-wrap" id="ar-product-wrap">' +
                  '<div class="ar-product-frame" id="ar-product-frame">' +
                    '<div class="ar-product-mat" id="ar-product-mat">' +
                      '<img id="ar-product-img" src="' + IMG + '" alt="' + TITLE + '" loading="eager"/>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
              '</div>' +
              '<div class="ar-ui-layer">' +
                '<div class="ar-thumb-strip">' + thumbs + '</div>' +
              '</div>' +
            '</div>' +
            '<div class="ar-loading-overlay" id="ar-loading" hidden>' +
              '<div class="ar-spinner"></div>' +
              '<p class="ar-loading-text" id="ar-loading-text">Preparing AR model…</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<input type="file" id="ar-bg-upload" accept="image/*" hidden/>' +
      '</div>';

    cacheEls();
    bindRoomEvents();
    viewportResizeBound = false;

    var prodImg = document.getElementById('ar-product-img');
    if (prodImg) {
      prodImg.addEventListener('load', function () { onProductImgLoad(prodImg); });
      if (prodImg.complete) onProductImgLoad(prodImg);
    }

    els.bg.addEventListener('error', function onBgError() {
      var room = getRoom(state.roomIndex);
      if (!room || room.uploaded) {
        els.bg.removeEventListener('error', onBgError);
        return;
      }
      var tries = parseInt(els.bg.dataset.fallback || '0', 10);
      var root = document.getElementById('ar-root');
      var builtinIndex = state.roomIndex - SESSION_ROOMS.length;
      var fallbackUrl = root && builtinIndex >= 0 && root.getAttribute('data-room-' + builtinIndex);
      if (fallbackUrl && tries < 2 && els.bg.getAttribute('src') !== fallbackUrl) {
        els.bg.dataset.fallback = String(tries + 1);
        if (ROOMS[builtinIndex]) ROOMS[builtinIndex].url = fallbackUrl;
        room.url = fallbackUrl;
        els.bg.setAttribute('src', fallbackUrl);
        return;
      }
      els.bg.removeEventListener('error', onBgError);
    });
    els.bg.addEventListener('load', function () {
      fitCanvasToBackground(els.bg);
      renderViewport();
    });
    if (els.bg.complete && els.bg.naturalWidth > 0) {
      fitCanvasToBackground(els.bg);
    }

    renderViewport();
    syncInterfaceUI();
    syncFullWidthButton();
    bindViewportResize();
    centerActiveThumb();
  }

  var viewportResizeBound = false;
  function bindViewportResize() {
    if (viewportResizeBound || !els.canvas || typeof ResizeObserver === 'undefined') return;
    viewportResizeBound = true;
    var ro = new ResizeObserver(function () { renderViewport(); });
    ro.observe(els.canvas);
  }

  function preloadRoomImages() {
    ROOMS.forEach(function (r) {
      if (!r.url) return;
      var img = new Image();
      img.src = r.url;
    });
  }
  preloadRoomImages();

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

  function fitCanvasToBackground(img) {
    if (!els.canvas) return;
    var isFull = roomEl.classList.contains('ar-room-fullwidth');
    var fill = state.showFullBg;
    els.canvas.classList.toggle('ar-canvas-fullwidth', isFull);
    els.canvas.classList.toggle('ar-canvas-fill', fill && !isFull);
    if (isFull) {
      els.canvas.style.aspectRatio = '';
      return;
    }
    if (fill && img && img.naturalWidth > 0 && img.naturalHeight > 0) {
      els.canvas.style.aspectRatio = img.naturalWidth + ' / ' + img.naturalHeight;
    } else {
      els.canvas.style.aspectRatio = '';
    }
  }

  function centerActiveThumb() {
    var strip = roomEl.querySelector('.ar-thumb-strip');
    if (!strip) return;
    var active = strip.querySelector('.ar-thumb.ar-active');
    if (!active) return;
    requestAnimationFrame(function () {
      var target = active.offsetLeft - (strip.clientWidth / 2) + (active.offsetWidth / 2);
      strip.scrollLeft = Math.max(0, Math.min(target, strip.scrollWidth - strip.clientWidth));
    });
  }

  function productTiltTransform() {
    var a = state.angle || 0;
    var p = state.pitch || 0;
    var l = state.level || 0;
    if (!a && !p && !l) return 'translate(-50%,-50%)';
    // Match Three.js YXZ (angle=Y, pitch=X, level=Z)
    return 'translate(-50%,-50%) rotateY(' + a + 'deg) rotateX(' + p + 'deg) rotateZ(' + l + 'deg)';
  }

  function renderViewport() {
    if (!els.bg) return;
    var bgUrl = currentBgUrl();
    if (bgUrl && els.bg.getAttribute('src') !== bgUrl) {
      els.bg.setAttribute('src', bgUrl);
    }
    if (els.canvas) {
      els.canvas.style.backgroundImage = 'none';
    }
    fitCanvasToBackground(els.bg);
    applyWallTint();

    var size = productScale();
    var outerCm = outerSizeCm();
    var frame = frameById(state.frameId);
    var framePx = frameBorderPx(size.w, outerCm.w);
    var framePy = frameBorderPx(size.h, outerCm.h);
    var matPx = matPaddingPx(size.w, outerCm.w);
    var matPy = matPaddingPx(size.h, outerCm.h);

    els.productWrap.style.left = state.posX + '%';
    els.productWrap.style.top  = state.posY + '%';
    els.productWrap.style.width  = size.w + 'px';
    els.productWrap.style.height = size.h + 'px';

    els.productFrame.style.boxSizing = 'border-box';
    els.productFrame.style.borderRadius = '0';
    els.productFrame.style.borderWidth = framePy + 'px ' + framePx + 'px';
    els.productFrame.style.borderColor = frame.color;
    els.productFrame.style.borderStyle = state.frameId === 'none' ? 'none' : 'solid';
    els.productFrame.style.width  = '100%';
    els.productFrame.style.height = '100%';

    els.productMat.style.boxSizing = 'border-box';
    els.productMat.style.borderRadius = '0';
    els.productMat.style.padding = matPy + 'px ' + matPx + 'px';
    els.productMat.style.background = (state.frameId !== 'none' && state.matting === '1') ? MAT_COLOR : 'transparent';
    els.productMat.style.width  = '100%';
    els.productMat.style.height = '100%';
    els.productMat.classList.toggle('ar-matted', state.frameId !== 'none' && state.matting === '1');
    els.productFrame.classList.toggle('ar-framed', state.frameId !== 'none');
    els.productWrap.classList.toggle('ar-wall-piece', state.frameId !== 'none');
    els.productFrame.classList.toggle('ar-blend', state.frameId === 'none' && state.matting === 'none');

    els.productWrap.style.transform = productTiltTransform();

    var img = document.getElementById('ar-product-img');
    if (img) {
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'contain';
      img.style.objectPosition = 'center';
      img.style.borderRadius = '0';
    }
    syncCustomizeFrameUI();
    syncSizeSliderUI();
    syncSpaceWidthFields(true);
    syncPaintButton();
  }

  function syncCustomizeFrameUI() {
    var frameLabel = document.getElementById('ar-frame-label');
    if (frameLabel) {
      frameLabel.innerHTML = 'Frame: <strong>' + frameById(state.frameId).label + '</strong>';
    }
    var matField = document.getElementById('ar-matting-field');
    if (matField) {
      matField.classList.toggle('ar-matting-disabled', state.frameId === 'none');
    }
    if (state.frameId === 'none' && state.matting !== 'none') {
      state.matting = 'none';
    }
    roomEl.querySelectorAll('.ar-mat-btn').forEach(function (btn) {
      btn.disabled = state.frameId === 'none';
      btn.classList.toggle('ar-active', btn.dataset.mat === state.matting);
    });
  }

  function syncPanelUI() {
    var p = state.activePanel;
    var map = [
      ['ar-settings-panel', 'settings', 'ar-btn-settings'],
      ['ar-customize-panel', 'customize', 'ar-btn-customize'],
      ['ar-help-panel', 'help', 'ar-btn-help'],
      ['ar-paint-panel', 'paint', 'ar-btn-paint'],
      ['ar-qr-popover', 'ar', 'ar-btn-vr']
    ];
    map.forEach(function (item) {
      var panel = document.getElementById(item[0]);
      var btn = document.getElementById(item[2]);
      if (panel) panel.classList.toggle('ar-open', p === item[1]);
      if (btn) btn.classList.toggle('ar-active', p === item[1]);
    });
    var customizeBtn = document.getElementById('ar-btn-customize');
    if (customizeBtn) customizeBtn.classList.toggle('ar-open', p === 'customize');
  }

  function syncInterfaceUI() {
    roomEl.classList.toggle('ar-show-ui', state.showInterface);
    if (els.dialog) els.dialog.classList.toggle('ar-show-ui', state.showInterface);
    var chk = document.getElementById('ar-show-ui');
    if (chk) chk.checked = state.showInterface;
  }

  function syncPaintSwatchUI() {
    roomEl.querySelectorAll('.ar-paint-swatch').forEach(function (btn) {
      var active = btn.dataset.paint === state.paintId;
      btn.classList.toggle('ar-active', active);
      btn.classList.toggle('ar-check-dark', active && isLightColor(btn.dataset.hex));
      btn.classList.toggle('ar-check-light', active && !isLightColor(btn.dataset.hex));
    });
    var customBtn = document.getElementById('ar-paint-custom-trigger');
    if (customBtn) customBtn.classList.toggle('ar-active', state.paintId === 'custom');
  }

  function applyPaintColor(paintId, customHex) {
    if (customHex) state.customPaintColor = customHex;
    state.paintId = paintId;
    state.wallTint = isRoomPaintable(state.roomIndex) ? paintColorById(paintId) : null;
    syncPaintSwatchUI();
    renderViewport();
  }

  function resetSettings() {
    state.angle = 0;
    state.level = 0;
    state.pitch = 0;
    state.showFullBg = false;
    state.sizeScale = presetScale(SIZE_PRESETS[DEFAULT_SIZE_INDEX]);
    state.sizeIndex = DEFAULT_SIZE_INDEX;
    state.unit = 'feet';
    state.spaceWidth = cmToDisplayUnit(SIZE_PRESETS[DEFAULT_SIZE_INDEX].w, 'feet');

    var angleEl = document.getElementById('ar-angle');
    var levelEl = document.getElementById('ar-level');
    var pitchEl = document.getElementById('ar-pitch');
    var spaceEl = document.getElementById('ar-space-width');
    var unitEl = document.getElementById('ar-unit');
    var sizeEl = document.getElementById('ar-size');
    if (angleEl) angleEl.value = '0';
    if (levelEl) levelEl.value = '0';
    if (pitchEl) pitchEl.value = '0';
    if (spaceEl) spaceEl.value = state.spaceWidth.toFixed(2);
    if (unitEl) unitEl.value = 'feet';
    if (sizeEl) sizeEl.value = String(DEFAULT_SIZE_INDEX);

    syncSizeSliderUI();
    renderViewport();
  }

  function togglePanel(name) {
    if (name === 'paint' && !isRoomPaintable(state.roomIndex)) return;
    state.activePanel = state.activePanel === name ? null : name;
    syncPanelUI();
  }

  function closePopovers() {
    state.activePanel = null;
    syncPanelUI();
  }

  // ── Drag product on room background ───────────────────────────────────────────
  function enableDrag() {
    var dragging = false;
    var startX, startY, origX, origY;

    function onDown(e) {
      if (e.touches && e.touches.length > 1) return;
      if (e.target.closest('.ar-popover') || e.target.closest('.ar-toolbar')) return;
      dragging = true;
      var pt = e.touches ? e.touches[0] : e;
      startX = pt.clientX;
      startY = pt.clientY;
      origX = state.posX;
      origY = state.posY;
      els.productWrap.classList.add('ar-dragging');
      e.preventDefault();
      e.stopPropagation();
    }

    function onMove(e) {
      if (!dragging) return;
      if (e.touches && e.touches.length > 1) {
        dragging = false;
        els.productWrap.classList.remove('ar-dragging');
        return;
      }
      var pt = e.touches ? e.touches[0] : e;
      var rect = sceneEl().getBoundingClientRect();
      var dx = ((pt.clientX - startX) / rect.width) * 100;
      var dy = ((pt.clientY - startY) / rect.height) * 100;
      // Constrain to wall area so painting stays on the wall
      var wall = currentWall();
      state.posX = Math.max(wall.left + 5, Math.min(wall.left + wall.width  - 5, origX + dx));
      state.posY = Math.max(wall.top  + 5, Math.min(wall.top  + wall.height - 5, origY + dy));
      renderViewport();
      e.preventDefault();
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

  // ── Pinch / wheel zoom (two fingers or scroll) ─────────────────────────────────
  function enablePinchZoom() {
    var pinching = false;
    var initialDist = 0;
    var initialScale = 1;

    function touchDist(touches) {
      var dx = touches[0].clientX - touches[1].clientX;
      var dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    }

    function applyScale(scale) {
      state.sizeScale = Math.max(SIZE_MIN, Math.min(SIZE_MAX, scale));
      syncSizeIndexFromScale();
      syncSizeSliderUI();
      syncSpaceWidthFields();
      renderViewport();
    }

    var target = sceneEl();
    if (!target) return;

    target.addEventListener('touchstart', function (e) {
      if (e.target.closest('.ar-popover') || e.target.closest('.ar-toolbar') ||
          e.target.closest('.ar-thumb-strip') || e.target.closest('.ar-size-slider')) return;
      if (e.touches.length === 2) {
        pinching = true;
        initialDist = touchDist(e.touches);
        initialScale = state.sizeScale;
        e.preventDefault();
      }
    }, { passive: false });

    target.addEventListener('touchmove', function (e) {
      if (!pinching || e.touches.length !== 2) return;
      if (!initialDist) return;
      applyScale(initialScale * (touchDist(e.touches) / initialDist));
      e.preventDefault();
    }, { passive: false });

    target.addEventListener('touchend', function (e) {
      if (e.touches.length < 2) pinching = false;
    });

    target.addEventListener('wheel', function (e) {
      if (e.target.closest('.ar-popover') || e.target.closest('.ar-toolbar') ||
          e.target.closest('.ar-size-slider')) return;
      var delta = e.deltaY > 0 ? -0.05 : 0.05;
      applyScale(state.sizeScale + delta);
      e.preventDefault();
    }, { passive: false });
  }

  function frameById(id) {
    for (var i = 0; i < FRAME_COLORS.length; i++) {
      if (FRAME_COLORS[i].id === id) return FRAME_COLORS[i];
    }
    return FRAME_COLORS[0];
  }

  function paintFramedArt(ctx, outerW, outerH, prodImg, scaleX, scaleY) {
    var outerCm = outerSizeCm();
    var framePx = frameBorderPx(outerW, outerCm.w);
    var framePy = frameBorderPx(outerH, outerCm.h);
    var matPx = matPaddingPx(outerW, outerCm.w);
    var matPy = matPaddingPx(outerH, outerCm.h);
    var frame = frameById(state.frameId);
    var frameSX = framePx * scaleX;
    var frameSY = framePy * scaleY;
    var matSX = matPx * scaleX;
    var matSY = matPy * scaleY;
    var totalW = outerW * scaleX;
    var totalH = outerH * scaleY;

    if (framePx > 0) {
      ctx.fillStyle = frame.color;
      ctx.fillRect(-totalW / 2, -totalH / 2, totalW, totalH);
    }
    if (matPx > 0 || matPy > 0) {
      ctx.fillStyle = MAT_COLOR;
      ctx.fillRect(
        -totalW / 2 + frameSX,
        -totalH / 2 + frameSY,
        totalW - frameSX * 2,
        totalH - frameSY * 2
      );
    }

    var innerW = totalW - (frameSX + matSX) * 2;
    var innerH = totalH - (frameSY + matSY) * 2;
    if (innerW <= 0 || innerH <= 0) return { totalW: totalW, totalH: totalH, matPx: matPx, framePx: framePx };

    var imgRatio = getProductRatio();
    var drawW = innerW;
    var drawH = innerH;
    if (imgRatio > drawH / drawW) {
      drawH = innerH;
      drawW = drawH / imgRatio;
    } else {
      drawW = innerW;
      drawH = drawW * imgRatio;
    }
    ctx.drawImage(prodImg, -drawW / 2, -drawH / 2, drawW, drawH);
    return { totalW: totalW, totalH: totalH, matPx: matPx, framePx: framePx };
  }

  function drawProductOnCanvas(ctx, exportW, exportH, scaleX, scaleY) {
    var prodImg = document.getElementById('ar-product-img');
    var size = productScale();
    var cx = (state.posX / 100) * exportW;
    var cy = (state.posY / 100) * exportH;

    ctx.save();
    ctx.translate(cx, cy);
    if (state.level) ctx.rotate((state.level * Math.PI) / 180);
    if (state.angle) {
      var skew = Math.tan((state.angle * Math.PI) / 180) * 0.35;
      ctx.transform(1, 0, skew, 1, 0, 0);
    }
    if (state.pitch) {
      var scaleY = Math.cos((state.pitch * Math.PI) / 180);
      ctx.scale(1, Math.max(0.55, scaleY));
    }
    paintFramedArt(ctx, size.w, size.h, prodImg, scaleX, scaleY);
    ctx.restore();
  }

  var saveInProgress = false;
  var arInProgress = false;

  function setSaveLoading(on) {
    saveInProgress = on;
    var btn = document.getElementById('ar-btn-save');
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle('ar-loading', on);
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function downloadCanvas(canvas) {
    var link = document.createElement('a');
    link.download = TITLE.replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '-room-preview.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function blobToImage(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var objUrl = URL.createObjectURL(blob);
      img.onload = function () {
        URL.revokeObjectURL(objUrl);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objUrl);
        reject(new Error('Product image failed to decode'));
      };
      img.src = objUrl;
    });
  }

  function loadProductImageForCanvas() {
    var secureUrl = toSecureUrl(IMG);
    if (!secureUrl) {
      return Promise.reject(new Error('Product image URL missing'));
    }

    return fetch(secureUrl, { mode: 'cors', credentials: 'omit', cache: 'default' })
      .then(function (res) {
        if (!res.ok) throw new Error('Product image fetch failed (HTTP ' + res.status + ')');
        return res.blob();
      })
      .then(blobToImage)
      .catch(function () {
        var prodImg = document.getElementById('ar-product-img');
        if (prodImg && prodImg.complete && prodImg.naturalWidth) {
          return prodImg;
        }
        return new Promise(function (resolve, reject) {
          if (!prodImg) {
            reject(new Error('Product image not loaded yet'));
            return;
          }
          prodImg.onload = function () {
            if (prodImg.naturalWidth) resolve(prodImg);
            else reject(new Error('Product image not loaded yet'));
          };
          prodImg.onerror = function () {
            reject(new Error('Product image failed to load'));
          };
        });
      });
  }

  function renderARCompositeDataUrl(prodImg) {
    var imgRatio = getProductRatio();
    var artW = 1024;
    var artH = Math.round(artW * imgRatio);

    var canvas = document.createElement('canvas');
    canvas.width = artW;
    canvas.height = artH;
    var ctx = canvas.getContext('2d');

    ctx.save();
    ctx.translate(artW / 2, artH / 2);
    paintFramedArt(ctx, artW, artH, prodImg, 1, 1);
    ctx.restore();

    return canvas.toDataURL('image/png');
  }

  function buildARProductImage() {
    var dims = getARDimensions();
    var frame = frameById(state.frameId);
    if (!toSecureUrl(IMG)) {
      return Promise.reject(new Error('Product image is missing'));
    }
    return Promise.resolve({
      imgUrl: toSecureUrl(IMG),
      frameColor: frame.id === 'none' ? '' : frame.color,
      dims: dims
    });
  }

  function setARButtonLoading(on) {
    arInProgress = on;
    var btn = document.getElementById('ar-btn-vr');
    if (!btn) return;
    btn.disabled = on;
    btn.classList.toggle('ar-loading', on);
    btn.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function resetARButtonThenNavigate(url) {
    setARButtonLoading(false);
    requestAnimationFrame(function () {
      window.location.href = url;
    });
  }

  function getARDimensions() {
    var outer = outerSizeCm();
    return { w: outer.w, h: outer.h };
  }


  // ── Save composite image ─────────────────────────────────────────────────────
  function savePreview() {
    if (saveInProgress) return;
    setSaveLoading(true);

    function finishSave() {
      requestAnimationFrame(function () { setSaveLoading(false); });
    }

    function runExport() {
      var canvas = document.createElement('canvas');
      var ctx = canvas.getContext('2d');
      var scene = sceneEl();
      if (!scene) {
        finishSave();
        return;
      }
      var vw = scene.clientWidth;
      var vh = scene.clientHeight;
      if (vw <= 0 || vh <= 0) {
        finishSave();
        return;
      }
      var exportW = Math.min(2400, Math.max(1200, vw * 2));
      var exportH = Math.round(exportW * (vh / vw));
      canvas.width = exportW;
      canvas.height = exportH;
      var scaleX = exportW / vw;
      var scaleY = exportH / vh;

      function finishWithBg(bgImg) {
        try {
          if (bgImg) {
            if (state.showFullBg) {
              var imgRatio = bgImg.width / bgImg.height;
              var canvasRatio = exportW / exportH;
              var sw, sh, sx, sy;
              if (imgRatio > canvasRatio) {
                sh = bgImg.height;
                sw = sh * canvasRatio;
                sx = (bgImg.width - sw) / 2;
                sy = 0;
              } else {
                sw = bgImg.width;
                sh = sw / canvasRatio;
                sx = 0;
                sy = (bgImg.height - sh) / 2;
              }
              ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, exportW, exportH);
            } else {
              ctx.drawImage(bgImg, 0, 0, exportW, exportH);
            }
          }
          if (state.wallTint) {
            var wall = currentWall();
            var wx = (wall.left / 100) * exportW;
            var wy = (wall.top / 100) * exportH;
            var ww = (wall.width / 100) * exportW;
            var wh = (wall.height / 100) * exportH;
            ctx.save();
            ctx.globalCompositeOperation = 'multiply';
            ctx.globalAlpha = 1;
            ctx.fillStyle = state.wallTint;
            ctx.fillRect(wx, wy, ww, wh);
            ctx.restore();
          }
          drawProductOnCanvas(ctx, exportW, exportH, scaleX, scaleY);
          downloadCanvas(canvas);
        } catch (err) {
          console.error('[AR Viewer] Save failed:', err);
        }
        finishSave();
      }

      var bgUrl = currentBgUrl();
      if (!bgUrl) {
        finishWithBg(null);
        return;
      }
      if (bgUrl.indexOf('data:') === 0) {
        var localImg = new Image();
        localImg.onload = function () { finishWithBg(localImg); };
        localImg.onerror = function () { finishWithBg(null); };
        localImg.src = bgUrl;
        return;
      }

      var bgImg = new Image();
      bgImg.crossOrigin = 'anonymous';
      bgImg.onload = function () { finishWithBg(bgImg); };
      bgImg.onerror = function () { finishWithBg(null); };
      bgImg.src = bgUrl;
    }

    requestAnimationFrame(function () {
      setTimeout(runExport, 0);
    });
  }

  function ensureQRImage() {
    if (!els.qrImg) return;
    var img = els.qrImg.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      img.alt = 'QR code';
      img.width = 220;
      img.height = 220;
      els.qrImg.appendChild(img);
    }
    var qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=' +
      encodeURIComponent(PAGE_URL);
    if (img.getAttribute('src') !== qrUrl) img.src = qrUrl;
  }

  function openQRPopover() {
    ensureQRImage();
    togglePanel('ar');
  }

  // ── AR / QR ──────────────────────────────────────────────────────────────────
  function extractModelPath(urlOrPath) {
    if (!urlOrPath) return '';
    var value = String(urlOrPath);
    var idx = value.indexOf('/api/ar-model/file/');
    if (idx >= 0) return value.slice(idx);
    if (value.charAt(0) === '/') return value;
    return '';
  }

  function launchIOSARPage(data) {
    var glbPath  = extractModelPath(data.glbPath  || data.glb);
    var usdzPath = extractModelPath(data.usdzPath || data.usdz);

    if (!usdzPath) {
      return Promise.reject(new Error('No USDZ model path returned'));
    }

    var arPage = toSecureUrl(BACKEND) + '/ar/view?title=' + encodeURIComponent(TITLE) +
      '&usdzPath=' + encodeURIComponent(usdzPath);
    if (glbPath) arPage += '&glbPath=' + encodeURIComponent(glbPath);
    resetARButtonThenNavigate(arPage);
    return Promise.resolve();
  }

  function launchAR(data) {
    var glbPath  = extractModelPath(data.glbPath  || data.glb);
    var usdzPath = extractModelPath(data.usdzPath || data.usdz);

    if (!glbPath) {
      throw new Error('No GLB model path returned from server');
    }

    var arPage = toSecureUrl(BACKEND) + '/ar/view?title=' + encodeURIComponent(TITLE) +
      '&glbPath=' + encodeURIComponent(glbPath);
    if (usdzPath) arPage += '&usdzPath=' + encodeURIComponent(usdzPath);
    resetARButtonThenNavigate(arPage);
  }

  function setARLoadingMessage(msg) {
    if (isMobile) return;
    if (!els.loading) return;
    els.loading.hidden = false;
    var text = document.getElementById('ar-loading-text');
    if (text) text.textContent = msg;
  }

  function fetchAndLaunch() {
    if (arInProgress) return;
    if (!BACKEND) {
      alert('AR backend is not configured. Ensure the AR Preview app is installed and the app proxy is enabled.');
      return;
    }
    if (isMobile) {
      setARButtonLoading(true);
    } else {
      setARLoadingMessage('Preparing your product…');
    }

    buildARProductImage()
      .then(function (payload) {
        if (!payload.imgUrl) {
          throw new Error('Could not prepare product image for AR');
        }
        setARLoadingMessage('Building 3D model…');
        return fetch(BACKEND + '/api/ar-model', {
          method: 'POST',
          mode: 'cors',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imgUrl: payload.imgUrl,
            frameColor: payload.frameColor || '',
            w: payload.dims.w,
            h: payload.dims.h,
            frame: state.frameId,
            matting: state.frameId === 'none' ? 'none' : state.matting,
            sizeScale: 1,
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
        if (!data.glb && !data.usdz && !data.glbPath && !data.usdzPath) {
          throw new Error('No model URL returned');
        }
        setARLoadingMessage('Opening AR view…');
        if (isIOS) {
          if (data.usdzPath || data.usdz) {
            return launchIOSARPage(data);
          }
          throw new Error('AR model not available for iOS');
        }
        launchAR(data);
      })
      .catch(function (err) {
        if (els.loading) els.loading.hidden = true;
        arInProgress = false;
        setARButtonLoading(false);
        console.error('[AR Viewer]', err);
        alert('Could not load AR model: ' + err.message);
      });
  }

  function onViewAR() {
    if (isMobile) {
      closePopovers();
      fetchAndLaunch();
    } else {
      openQRPopover();
    }
  }

  function isCompactLayout() {
    return window.matchMedia('(max-width: 1024px)').matches;
  }

  function syncFullWidthButton() {
    var fsBtn = document.getElementById('ar-room-fullscreen');
    if (!fsBtn) return;
    fsBtn.classList.toggle('ar-is-fullwidth', state.fullWidth);
    fsBtn.setAttribute('aria-label', state.fullWidth ? 'Exit full width' : 'Full width');
    fsBtn.setAttribute('aria-pressed', state.fullWidth ? 'true' : 'false');
  }

  function syncCompactLayout() {
    if (!roomEl.classList.contains('ar-open')) return;
    if (isCompactLayout() && state.fullWidth) {
      state.fullWidth = false;
      roomEl.classList.remove('ar-room-fullwidth');
      syncFullWidthButton();
      fitCanvasToBackground(els.bg);
      renderViewport();
    }
  }

  function toggleRoomFullWidth() {
    if (isCompactLayout()) return;
    state.fullWidth = !state.fullWidth;
    roomEl.classList.toggle('ar-room-fullwidth', state.fullWidth);
    syncFullWidthButton();
    fitCanvasToBackground(els.bg);
    requestAnimationFrame(function () {
      renderViewport();
      requestAnimationFrame(renderViewport);
    });
  }

  // ── Events ─────────────────────────────────────────────────────────────────────
  function bindRoomEvents() {
    document.getElementById('ar-room-close').addEventListener('click', closeRoom);
    var fsBtn = document.getElementById('ar-room-fullscreen');
    if (fsBtn) fsBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      toggleRoomFullWidth();
    });
    roomEl.addEventListener('click', function (e) {
      if (Date.now() < blockBackdropCloseUntil) return;
      if (e.target.closest('.ar-size-slider')) return;
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
    document.getElementById('ar-btn-help').addEventListener('click', function (e) {
      e.stopPropagation();
      togglePanel('help');
    });
    document.getElementById('ar-btn-paint').addEventListener('click', function (e) {
      e.stopPropagation();
      if (this.disabled || !isRoomPaintable(state.roomIndex)) return;
      togglePanel('paint');
    });
    var helpClose = document.getElementById('ar-help-close');
    if (helpClose) helpClose.addEventListener('click', function (e) {
      e.stopPropagation();
      closePopovers();
    });

    var showUi = document.getElementById('ar-show-ui');
    if (showUi) showUi.addEventListener('change', function (e) {
      state.showInterface = e.target.checked;
      syncInterfaceUI();
    });

    roomEl.querySelectorAll('.ar-paint-swatch').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        applyPaintColor(btn.dataset.paint);
      });
    });

    var paintCustomTrigger = document.getElementById('ar-paint-custom-trigger');
    var paintCustomInput = document.getElementById('ar-paint-custom-input');
    if (paintCustomTrigger && paintCustomInput) {
      paintCustomTrigger.addEventListener('click', function (e) {
        e.stopPropagation();
        paintCustomInput.click();
      });
      paintCustomInput.addEventListener('input', function (e) {
        applyPaintColor('custom', e.target.value);
      });
      paintCustomInput.addEventListener('change', function (e) {
        applyPaintColor('custom', e.target.value);
      });
    }

    document.getElementById('ar-angle').addEventListener('input', function (e) {
      state.angle = parseFloat(e.target.value); renderViewport();
    });
    document.getElementById('ar-level').addEventListener('input', function (e) {
      state.level = parseFloat(e.target.value); renderViewport();
    });
    var pitchEl = document.getElementById('ar-pitch');
    if (pitchEl) pitchEl.addEventListener('input', function (e) {
      state.pitch = parseFloat(e.target.value); renderViewport();
    });
    document.getElementById('ar-space-width').addEventListener('change', function (e) {
      var val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) applySpaceWidthInput(val);
    });
    document.getElementById('ar-space-width').addEventListener('input', function (e) {
      var val = parseFloat(e.target.value);
      if (!isNaN(val) && val > 0) applySpaceWidthInput(val);
    });
    document.getElementById('ar-unit').addEventListener('change', function (e) {
      state.unit = e.target.value;
      syncSpaceWidthFields(false);
    });
    document.getElementById('ar-reset-settings').addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      resetSettings();
    });

    document.getElementById('ar-size').addEventListener('change', function (e) {
      state.sizeIndex = parseInt(e.target.value, 10);
      state.sizeScale = presetScale(SIZE_PRESETS[state.sizeIndex]);
      syncSpaceWidthFields(false);
      syncSizeSliderUI();
      renderViewport();
    });

    roomEl.querySelectorAll('.ar-swatch').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.frameId = btn.dataset.frame;
        if (state.frameId === 'none') {
          state.matting = 'none';
        }
        roomEl.querySelectorAll('.ar-swatch').forEach(function (b) { b.classList.remove('ar-active'); });
        btn.classList.add('ar-active');
        syncCustomizeFrameUI();
        renderViewport();
      });
    });
    roomEl.querySelectorAll('.ar-mat-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (state.frameId === 'none') return;
        state.matting = btn.dataset.mat;
        roomEl.querySelectorAll('.ar-mat-btn').forEach(function (b) { b.classList.remove('ar-active'); });
        btn.classList.add('ar-active');
        renderViewport();
      });
    });

    bindThumbEvents();

    document.getElementById('ar-btn-upload').addEventListener('click', function () {
      els.bgUpload.click();
    });
    els.bgUpload.addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        SESSION_ROOMS.unshift({
          name: 'Upload',
          url: ev.target.result,
          wall: DEFAULT_WALL,
          productY: DEFAULT_WALL.top + DEFAULT_WALL.height * 0.45,
          paintable: false,
          uploaded: true
        });
        state.roomIndex = 0;
        state.wallTint = isRoomPaintable(0) ? paintColorById(state.paintId) : null;
        state.posX = 50;
        state.posY = DEFAULT_WALL.top + DEFAULT_WALL.height * 0.45;
        refreshThumbStrip();
        renderViewport();
        centerActiveThumb();
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });

    document.getElementById('ar-btn-save').addEventListener('click', savePreview);
    document.getElementById('ar-btn-vr').addEventListener('click', function (e) {
      e.stopPropagation();
      onViewAR();
    });
    var qrClose = document.getElementById('ar-qr-close');
    if (qrClose) qrClose.addEventListener('click', function (e) {
      e.stopPropagation();
      closePopovers();
    });

    document.addEventListener('click', function (e) {
      if (!roomEl.classList.contains('ar-open')) return;
      if (e.target.closest('.ar-popover-anchor') || e.target.closest('.ar-popover')) return;
      if (state.activePanel === 'customize' || state.activePanel === 'paint' || state.activePanel === 'ar') closePopovers();
    });

    enableDrag();
    enablePinchZoom();
    enableSizeSlider();
    syncCompactLayout();
    if (!window.__arCompactResizeBound) {
      window.__arCompactResizeBound = true;
      window.addEventListener('resize', syncCompactLayout);
    }
  }

  function enableSizeSlider() {
    var track = els.sizeTrack;
    var thumb = els.sizeThumb;
    var slider = document.getElementById('ar-size-slider');
    if (!track || !thumb) return;

    var dragging = false;

    function blockBackdropClose() {
      blockBackdropCloseUntil = Date.now() + 400;
    }

    function pctFromEvent(e) {
      var rect = track.getBoundingClientRect();
      var y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return 100 - (y / rect.height) * 100;
    }

    function onDown(e) {
      e.stopPropagation();
      blockBackdropClose();
      dragging = true;
      thumb.classList.add('ar-dragging');
      setSizeFromSliderPct(pctFromEvent(e));
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      blockBackdropClose();
      setSizeFromSliderPct(pctFromEvent(e));
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove('ar-dragging');
      blockBackdropClose();
    }

    thumb.addEventListener('mousedown', onDown);
    thumb.addEventListener('touchstart', onDown, { passive: false });
    track.addEventListener('mousedown', function (e) {
      if (e.target === thumb) return;
      e.stopPropagation();
      blockBackdropClose();
      setSizeFromSliderPct(pctFromEvent(e));
    });
    track.addEventListener('touchstart', function (e) {
      if (e.target === thumb) return;
      e.stopPropagation();
      blockBackdropClose();
      setSizeFromSliderPct(pctFromEvent(e));
    }, { passive: false });
    if (slider) {
      slider.addEventListener('mousedown', function (e) { e.stopPropagation(); });
      slider.addEventListener('touchstart', function (e) { e.stopPropagation(); }, { passive: true });
      slider.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
  }

  function loadImageUrl(url) {
    return new Promise(function (resolve) {
      if (!url) {
        resolve(false);
        return;
      }
      var img = new Image();
      img.onload = function () { resolve(true); };
      img.onerror = function () { resolve(false); };
      img.src = url;
    });
  }

  function waitForImgElement(imgEl) {
    return new Promise(function (resolve) {
      if (!imgEl) {
        resolve(false);
        return;
      }
      if (imgEl.complete && imgEl.naturalWidth > 0) {
        resolve(true);
        return;
      }
      function done() {
        imgEl.removeEventListener('load', done);
        imgEl.removeEventListener('error', done);
        resolve(imgEl.naturalWidth > 0);
      }
      imgEl.addEventListener('load', done);
      imgEl.addEventListener('error', done);
      if (imgEl.complete) done();
    });
  }

  function waitForRoomReady() {
    var bgUrl = currentBgUrl();
    var root = document.getElementById('ar-root');
    var room = getRoom(state.roomIndex);
    var builtinIndex = state.roomIndex - SESSION_ROOMS.length;
    var fallbackUrl = (room && !room.uploaded && builtinIndex >= 0 && root)
      ? root.getAttribute('data-room-' + builtinIndex)
      : null;
    var prodImg = document.getElementById('ar-product-img');

    return waitForImgElement(els.bg).then(function (bgOk) {
      if (!bgOk && fallbackUrl && fallbackUrl !== bgUrl) {
        if (els.bg) els.bg.setAttribute('src', fallbackUrl);
        if (ROOMS[builtinIndex]) ROOMS[builtinIndex].url = fallbackUrl;
        if (room) room.url = fallbackUrl;
        return waitForImgElement(els.bg);
      }
      return bgOk;
    }).then(function () {
      return waitForImgElement(prodImg);
    }).then(function () {
      var jobs = allRooms().map(function (r) { return loadImageUrl(r.url); });
      return Promise.all(jobs);
    });
  }

  function finishOpenRoom(gen) {
    if (gen !== openGeneration || !roomOpening) return;
    if (roomEl.classList.contains('ar-open')) return;
    roomOpening = false;
    if (splashMaxTimer) {
      clearTimeout(splashMaxTimer);
      splashMaxTimer = null;
    }
    hideSplash();
    requestAnimationFrame(function () {
      if (gen !== openGeneration) return;
      roomEl.classList.add('ar-open');
      requestAnimationFrame(function () {
        if (gen !== openGeneration) return;
        renderViewport();
        centerActiveThumb();
      });
    });
  }

  function scheduleOpenWhenReady(gen) {
    waitForRoomReady().then(function () {
      finishOpenRoom(gen);
    });
    splashMaxTimer = setTimeout(function () {
      splashMaxTimer = null;
      finishOpenRoom(gen);
    }, 15000);
  }

  function showSplash() {
    if (!splashEl) return;
    splashEl.setAttribute('aria-hidden', 'false');
    splashEl.classList.add('ar-splash-open');
    document.body.style.overflow = 'hidden';
    var loader = splashEl.querySelector('.ar-splash-loader');
    if (loader) loader.hidden = false;
  }

  function hideSplash() {
    if (!splashEl) return;
    splashEl.classList.remove('ar-splash-open');
    splashEl.setAttribute('aria-hidden', 'true');
  }

  function cancelOpen() {
    openGeneration++;
    if (splashMaxTimer) {
      clearTimeout(splashMaxTimer);
      splashMaxTimer = null;
    }
    roomOpening = false;
    state.fullWidth = false;
    hideSplash();
    roomEl.classList.remove('ar-open', 'ar-room-fullwidth');
    roomEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    roomEl.innerHTML = '';
  }

  function toggleSplashFullscreen() {
    var doc = document.documentElement;
    if (!document.fullscreenElement && doc.requestFullscreen) {
      doc.requestFullscreen().catch(function () {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(function () {});
    }
  }

  function openRoom() {
    if (roomOpening || roomEl.classList.contains('ar-open')) return;
    roomOpening = true;
    state.fullWidth = false;
    state.roomIndex = 0;
    state.paintId = DEFAULT_PAINT_ID;
    state.customPaintColor = null;
    state.posX = 50;
    var firstRoom = getRoom(0);
    state.wallTint = isRoomPaintable(0) ? paintColorById(DEFAULT_PAINT_ID) : null;
    state.posY = firstRoom ? (firstRoom.productY || 30) : 30;
    openGeneration++;
    var gen = openGeneration;

    showSplash();
    buildRoomUI();
    roomEl.classList.remove('ar-room-fullwidth');
    roomEl.setAttribute('aria-hidden', 'false');

    scheduleOpenWhenReady(gen);
  }

  function closeRoom() {
    openGeneration++;
    if (splashMaxTimer) {
      clearTimeout(splashMaxTimer);
      splashMaxTimer = null;
    }
    roomOpening = false;
    state.fullWidth = false;
    hideSplash();
    roomEl.classList.remove('ar-open', 'ar-room-fullwidth');
    roomEl.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    setTimeout(function () { roomEl.innerHTML = ''; }, 300);
  }

  fab.addEventListener('click', openRoom);

  var splashClose = document.getElementById('ar-splash-close');
  var splashFullscreen = document.getElementById('ar-splash-fullscreen');
  if (splashClose) splashClose.addEventListener('click', cancelOpen);
  if (splashFullscreen) splashFullscreen.addEventListener('click', toggleSplashFullscreen);

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (splashEl && splashEl.classList.contains('ar-splash-open')) {
      cancelOpen();
      return;
    }
    if (roomEl.classList.contains('ar-open')) closeRoom();
  });

  if (!fabMountedInline) {
    var lastY = window.scrollY;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if      (y > lastY + 60)  fab.classList.add('ar-fab-hide');
      else if (y < lastY - 10)  fab.classList.remove('ar-fab-hide');
      lastY = y;
    }, { passive: true });
  }

})();
