(function () {
  'use strict';

  var root = document.getElementById('ps-root');
  if (!root) return;

  var TITLE = root.dataset.title || 'Product';
  var IMG   = root.dataset.img || '';
  var IMG_W = parseFloat(root.dataset.imgW || '0');
  var IMG_H = parseFloat(root.dataset.imgH || '0');
  var W_CM  = parseFloat(root.dataset.width || '60');
  var H_CM  = parseFloat(root.dataset.height || '40');
  if (IMG.indexOf('//') === 0) IMG = 'https:' + IMG;

  var productData = null;
  try {
    var dataEl = document.getElementById('ps-product-data');
    if (dataEl) productData = JSON.parse(dataEl.textContent);
  } catch (e) {}

  var SIZE_MAP = {
    '8x10': 0.52, '10x15': 0.56, '11x14': 0.70, '16x20': 0.84,
    '16x24': 0.82, '18x24': 0.94, '20x30': 1.00, '24x36': 1.18,
    '30x40': 1.32, '40x50': 1.46, '50x70': 1.58
  };

  var FRAMES = {
    none:   { frame: false, mat: false, float: false, color: null },
    canvas: { frame: false, mat: false, float: false, color: null },
    float:  { frame: false, mat: false, float: true,  color: null },
    wood:   { frame: true,  mat: true,  float: false, color: '#c4a574' },
    white:  { frame: true,  mat: true,  float: false, color: '#f0eeea' },
    black:  { frame: true,  mat: true,  float: false, color: '#1c1c1c' },
    gold:   { frame: true,  mat: true,  float: false, color: '#c9a84c' },
    silver: { frame: true,  mat: true,  float: false, color: '#a0a0a0' },
    walnut: { frame: true,  mat: true,  float: false, color: '#5c3d1e' },
    maple:  { frame: true,  mat: true,  float: false, color: '#d4a96a' }
  };

  var ROOMS = [
    { label: 'Living Room', url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1800&q=85&auto=format&fit=crop' },
    { label: 'Bedroom',     url: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1800&q=85&auto=format&fit=crop' },
    { label: 'Office',      url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1800&q=85&auto=format&fit=crop' },
    { label: 'Hallway',     url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1800&q=85&auto=format&fit=crop' }
  ];

  var S = {
    scale: 1.0, label: '', frameKey: 'wood',
    tiltX: 0, tiltY: 0, zoomed: false, loading: false,
    roomIdx: 0, artX: 0.5, artY: 0.42, artSize: 34
  };

  var E = {};
  var bufs = [new Image(), new Image()];
  var activeIdx = -1, pendingId = 0;
  var imgRatio = null, imgSrc = '';
  var lastVarId = '', lastPickSig = '', pollId = null;

  var roomImg = new Image();
  var roomReady = false, roomLoadedUrl = '';
  var roomCanvas, roomCtx, roomFs, drag = null;

  function norm(s) {
    if (!s || s === 'undefined' || s === 'null') return '';
    s = ('' + s).trim();
    return s.indexOf('//') === 0 ? 'https:' + s : s;
  }
  function imgKey(src) {
    var f = norm(src); if (!f) return '';
    try { var u = new URL(f); return u.hostname + u.pathname; }
    catch (e) { return f.replace(/^https?:\/\//, '').split('?')[0]; }
  }
  function shopifyW(src, w) {
    var f = norm(src); if (!f) return '';
    return /[?&]width=\d+/i.test(f)
      ? f.replace(/width=\d+/i, 'width=' + w)
      : f + (f.indexOf('?') >= 0 ? '&' : '?') + 'width=' + w;
  }
  function getRatio() {
    if (imgRatio > 0) return imgRatio;
    if (IMG_W > 0 && IMG_H > 0) return IMG_H / IMG_W;
    if (W_CM > 0 && H_CM > 0) return H_CM / W_CM;
    return 1.25;
  }
  function parseSizeScale(str) {
    var m = String(str || '').match(/(\d+(?:\.\d+)?)\s*[*x×"']\s*(\d+(?:\.\d+)?)/i);
    if (!m) return 1.0;
    var k = parseFloat(m[1]) + 'x' + parseFloat(m[2]);
    if (SIZE_MAP[k]) return SIZE_MAP[k];
    return Math.min(1.58, Math.max(0.45, Math.sqrt(parseFloat(m[1]) * parseFloat(m[2]) / 864) * 1.12));
  }
  function parseFrameKey(str) {
    var s = String(str || '').toLowerCase().trim();
    if (!s || /unfram|none/i.test(s)) return 'none';
    if (/float/i.test(s)) return 'float';
    if (/^canvas/i.test(s)) return 'canvas';
    if (/walnut/i.test(s)) return 'walnut';
    if (/maple/i.test(s)) return 'maple';
    if (/wood|natural/i.test(s)) return 'wood';
    if (/white/i.test(s)) return 'white';
    if (/black/i.test(s)) return 'black';
    if (/gold/i.test(s)) return 'gold';
    if (/silver/i.test(s)) return 'silver';
    return 'wood';
  }
  function shade(hex, amt) {
    if (!hex || hex[0] !== '#') return hex;
    var n = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, ((n >> 16) & 255) + amt));
    var g = Math.max(0, Math.min(255, ((n >> 8) & 255) + amt));
    var b = Math.max(0, Math.min(255, (n & 255) + amt));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  function varIdInput() {
    return document.querySelector('product-form input[name="id"]') ||
      document.querySelector('form[action*="/cart/add"] input[name="id"]') ||
      document.querySelector('input[name="id"]');
  }
  function currentVariant() {
    if (!productData || !productData.variants) return null;
    var inp = varIdInput(), id = inp ? String(inp.value) : '';
    for (var i = 0; i < productData.variants.length; i++) {
      if (String(productData.variants[i].id) === id) return productData.variants[i];
    }
    return productData.variants[0] || null;
  }
  function varImgSrc(v) {
    if (!v) return IMG;
    var fi = v.featured_image || (v.featured_media && v.featured_media.preview_image);
    return fi && fi.src ? norm(fi.src) : IMG;
  }
  function readPicker() {
    var out = {};
    document.querySelectorAll('variant-picker fieldset, fieldset.variant-option').forEach(function (fs) {
      var leg = fs.querySelector('legend');
      var name = leg ? leg.textContent.trim() : '';
      if (!name) return;
      var chk = fs.querySelector('input[type="radio"]:checked, input:checked');
      if (chk && chk.value) { out[name] = chk.value; return; }
      var sel = fs.querySelector('[aria-checked="true"], .variant-option__button-label--selected, .selected');
      if (sel) {
        var inp = sel.querySelector('input[type="radio"]');
        if (inp && inp.value) out[name] = inp.value;
        else if (sel.dataset.value) out[name] = sel.dataset.value;
      }
    });
    document.querySelectorAll('variant-picker select, select[name^="options["]').forEach(function (sel) {
      var wrap = sel.closest('fieldset, .product-form__input, .variant-option');
      var name = '';
      if (wrap) { var l = wrap.querySelector('legend, label'); if (l) name = l.textContent.trim(); }
      if (!name && sel.name) name = sel.name.replace(/^options\[|\]$/g, '');
      if (name && sel.value) out[name] = sel.value;
    });
    return out;
  }
  function pickerSig() { return JSON.stringify(readPicker()); }
  function applyOption(name, val) {
    if (!val) return;
    if (/size|dimension|format/i.test(name)) { S.scale = parseSizeScale(val); S.label = val; }
    else if (/fram|mount|style|finish|type|print/i.test(name)) { S.frameKey = parseFrameKey(val); }
  }
  function applyPicker() { var p = readPicker(); Object.keys(p).forEach(function (k) { applyOption(k, p[k]); }); }
  function applyVariant(v) {
    if (!v || !productData) return;
    var opts = productData.options || [];
    [v.option1, v.option2, v.option3].forEach(function (val, i) { if (opts[i]) applyOption(opts[i], val); });
  }

  function activeBuf() { return activeIdx >= 0 ? bufs[activeIdx] : null; }
  function loadImg(src) {
    var full = norm(src) || IMG;
    if (!full) return;
    if (imgKey(full) === imgKey(imgSrc) && activeBuf() && activeBuf().naturalWidth) return;
    S.loading = true;
    if (E.loader) E.loader.hidden = false;
    var id = ++pendingId;
    var buf = bufs[activeIdx < 0 ? 0 : 1 - activeIdx];
    buf.onload = function () {
      if (id !== pendingId) return;
      if (buf.naturalWidth) {
        imgRatio = buf.naturalHeight / buf.naturalWidth;
        activeIdx = bufs.indexOf(buf);
        imgSrc = full;
      }
      S.loading = false;
      if (E.loader) E.loader.hidden = true;
      drawGalleryCanvas();
      if (roomFs && roomFs.classList.contains('ps-room-open')) drawRoomCanvas();
    };
    buf.onerror = function () {
      if (id !== pendingId) return;
      S.loading = false;
      if (E.loader) E.loader.hidden = true;
      if (activeBuf()) drawGalleryCanvas();
    };
    buf.src = shopifyW(full, 2400);
    if (buf.complete && buf.naturalWidth) buf.onload();
  }

  function drawFramedArt(ctx, img, fc, ox, oy, artW, artH, opts) {
    opts = opts || {};
    var tiltX = opts.tiltX || 0;
    var tiltY = opts.tiltY || 0;
    var matPx   = fc.mat   ? Math.round(Math.max(12, artW * 0.07))  : 0;
    var framePx = fc.frame ? Math.round(Math.max(4,  artW * 0.016)) : 0;
    var totW = artW + (matPx + framePx) * 2;
    var totH = artH + (matPx + framePx) * 2;

    ctx.save();
    if (fc.float) {
      ctx.shadowColor = 'rgba(0,0,0,0.34)';
      ctx.shadowBlur = 26;
      ctx.shadowOffsetX = Math.round(5 - tiltY * 0.35);
      ctx.shadowOffsetY = Math.round(12 + tiltX * 0.3);
    } else {
      ctx.shadowColor = 'rgba(0,0,0,0.2)';
      ctx.shadowBlur = 20;
      ctx.shadowOffsetX = Math.round(3 - tiltY * 0.4);
      ctx.shadowOffsetY = Math.round(8 + tiltX * 0.35);
    }
    ctx.fillStyle = fc.frame ? fc.color : '#ffffff';
    ctx.fillRect(ox, oy, totW, totH);
    ctx.restore();

    if (fc.frame && fc.color) {
      ctx.fillStyle = fc.color;
      ctx.fillRect(ox, oy, totW, totH);
      ctx.fillStyle = shade(fc.color, -16);
      ctx.fillRect(ox, oy, totW, framePx);
      ctx.fillRect(ox, oy, framePx, totH);
      ctx.fillStyle = shade(fc.color, 12);
      ctx.fillRect(ox, oy + totH - framePx, totW, framePx);
      ctx.fillRect(ox + totW - framePx, oy, framePx, totH);
    }

    if (fc.mat && matPx > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + framePx, oy + framePx, artW + matPx * 2, artH + matPx * 2);
    }

    try {
      ctx.drawImage(img, ox + framePx + matPx, oy + framePx + matPx, artW, artH);
    } catch (e) {}

    return { totW: totW, totH: totH };
  }

  function calcGalleryFrame(stageW, stageH) {
    var fc = FRAMES[S.frameKey] || FRAMES.wood;
    var r = getRatio();
    var padX = Math.max(20, stageW * 0.035);
    var padY = Math.max(24, stageH * 0.04);
    var availW = stageW - padX * 2;
    var availH = stageH - padY * 2;

    var artW = Math.round(availW * 0.96 * S.scale);
    var artH = Math.round(artW * r);
    var matPx   = fc.mat   ? Math.round(Math.max(12, artW * 0.07))  : 0;
    var framePx = fc.frame ? Math.round(Math.max(4,  artW * 0.016)) : 0;
    var totW = artW + (matPx + framePx) * 2;
    var totH = artH + (matPx + framePx) * 2;

    if (totH > availH) {
      artH = Math.round(availH - (matPx + framePx) * 2);
      artW = Math.round(artH / r);
      totW = artW + (matPx + framePx) * 2;
      totH = artH + (matPx + framePx) * 2;
    }
    if (totW > availW) {
      artW = Math.round(availW - (matPx + framePx) * 2);
      artH = Math.round(artW * r);
      totW = artW + (matPx + framePx) * 2;
      totH = artH + (matPx + framePx) * 2;
    }

    return { fc: fc, artW: artW, artH: artH, totW: totW, totH: totH };
  }

  function drawGalleryCanvas() {
    var canvas = E.canvas, stage = E.stage;
    if (!canvas || !stage) return;
    var img = activeBuf();
    if (!img || !img.naturalWidth) return;
    var rect = stage.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;

    var layout = calcGalleryFrame(rect.width, rect.height);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var totW = layout.totW, totH = layout.totH;

    if (canvas.width !== Math.round(totW * dpr) || canvas.height !== Math.round(totH * dpr)) {
      canvas.width = Math.round(totW * dpr);
      canvas.height = Math.round(totH * dpr);
      canvas.style.width = totW + 'px';
      canvas.style.height = totH + 'px';
    }

    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, totW, totH);

    drawFramedArt(ctx, img, layout.fc, 0, 0, layout.artW, layout.artH, {
      tiltX: S.zoomed ? 0 : S.tiltX,
      tiltY: S.zoomed ? 0 : S.tiltY
    });

    if (E.sizeLabel) {
      E.sizeLabel.textContent = S.label || '';
      E.sizeLabel.hidden = !S.label;
    }
  }

  function applyTilt() {
    if (!E.tilt) return;
    var sc = S.zoomed ? 1.65 : 1;
    var ty = S.zoomed ? 0 : S.tiltY;
    var tx = S.zoomed ? 0 : S.tiltX;
    E.tilt.style.transform =
      'perspective(1100px) rotateX(' + tx + 'deg) rotateY(' + ty + 'deg) scale(' + sc + ')';
    if (E.stage) E.stage.classList.toggle('ps-zoomed', S.zoomed);
    drawGalleryCanvas();
  }

  function bindGalleryTilt(el) {
    if (!el) return;
    function set(cx, cy) {
      if (S.zoomed || S.loading) return;
      var b = el.getBoundingClientRect();
      var nx = (cx - b.left) / b.width;
      var ny = (cy - b.top) / b.height;
      S.tiltY = (0.5 - nx) * 18;
      S.tiltX = (0.5 - ny) * 12;
      applyTilt();
    }
    function rst() { S.tiltX = 0; S.tiltY = 0; applyTilt(); }
    el.addEventListener('mousemove', function (e) { set(e.clientX, e.clientY); });
    el.addEventListener('mouseleave', rst);
    el.addEventListener('touchmove', function (e) {
      if (e.touches[0]) set(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    el.addEventListener('touchend', rst);
  }

  /* ── Room fullscreen (reference site lightbox) ─────────────────────────── */
  function buildRoomView() {
    if (document.getElementById('ps-room-fs')) {
      roomFs = document.getElementById('ps-room-fs');
      roomCanvas = document.getElementById('ps-room-canvas');
      return;
    }

    roomFs = document.createElement('div');
    roomFs.id = 'ps-room-fs';
    roomFs.setAttribute('role', 'dialog');
    roomFs.setAttribute('aria-modal', 'true');
    roomFs.setAttribute('aria-label', 'View in a room');
    roomFs.innerHTML = [
      '<button type="button" id="ps-room-close" aria-label="Close">',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">',
          '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
        '</svg>',
      '</button>',
      '<div id="ps-room-cv-wrap"><canvas id="ps-room-canvas"></canvas></div>',
      '<div id="ps-room-thumbs">',
        ROOMS.map(function (rm, i) {
          return '<button type="button" class="ps-rthumb' + (i === 0 ? ' ps-rthumb-active' : '') + '" data-ridx="' + i + '">' +
            '<img src="' + rm.url.replace('w=1800', 'w=120') + '" alt="' + rm.label + '" loading="lazy"/>' +
          '</button>';
        }).join(''),
      '</div>',
      '<button type="button" id="ps-closeup-btn">View close up</button>'
    ].join('');
    document.body.appendChild(roomFs);

    roomCanvas = document.getElementById('ps-room-canvas');

    document.getElementById('ps-room-close').addEventListener('click', closeRoomView);
    document.getElementById('ps-closeup-btn').addEventListener('click', closeRoomView);
    roomFs.addEventListener('click', function (e) { if (e.target === roomFs) closeRoomView(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && roomFs.classList.contains('ps-room-open')) closeRoomView();
    });

    roomFs.querySelectorAll('.ps-rthumb[data-ridx]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var idx = parseInt(btn.dataset.ridx, 10);
        S.roomIdx = idx;
        roomFs.querySelectorAll('.ps-rthumb').forEach(function (b) { b.classList.remove('ps-rthumb-active'); });
        btn.classList.add('ps-rthumb-active');
        loadRoomBg(ROOMS[idx].url, drawRoomCanvas);
      });
    });

    roomCanvas.addEventListener('mousedown', onRoomDragStart);
    roomCanvas.addEventListener('mousemove', onRoomDragMove);
    roomCanvas.addEventListener('mouseup', onRoomDragEnd);
    roomCanvas.addEventListener('mouseleave', onRoomDragEnd);
    roomCanvas.addEventListener('touchstart', onRoomDragStart, { passive: true });
    roomCanvas.addEventListener('touchmove', onRoomDragMove, { passive: false });
    roomCanvas.addEventListener('touchend', onRoomDragEnd);

    if (window.ResizeObserver) {
      new ResizeObserver(resizeRoomCanvas).observe(document.getElementById('ps-room-cv-wrap'));
    }
  }

  function loadRoomBg(url, cb) {
    if (url === roomLoadedUrl && roomReady) { if (cb) cb(); return; }
    roomLoadedUrl = url;
    roomReady = false;
    roomImg.onload = function () { roomReady = true; drawRoomCanvas(); if (cb) cb(); };
    roomImg.onerror = function () {};
    roomImg.src = url;
    if (roomImg.complete && roomImg.naturalWidth) { roomReady = true; drawRoomCanvas(); if (cb) cb(); }
  }

  function resizeRoomCanvas() {
    if (!roomCanvas) return;
    var wrap = document.getElementById('ps-room-cv-wrap');
    if (!wrap) return;
    var r = wrap.getBoundingClientRect();
    if (r.width < 4) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    roomCanvas.width = Math.round(r.width * dpr);
    roomCanvas.height = Math.round(r.height * dpr);
    roomCanvas.style.width = r.width + 'px';
    roomCanvas.style.height = r.height + 'px';
    roomCtx = roomCanvas.getContext('2d');
    roomCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    roomCtx.imageSmoothingEnabled = true;
    roomCtx.imageSmoothingQuality = 'high';
    drawRoomCanvas();
  }

  function drawRoomCanvas() {
    if (!roomCanvas || !roomCtx) return;
    var img = activeBuf();
    if (!img || !img.naturalWidth) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vw = roomCanvas.width / dpr;
    var vh = roomCanvas.height / dpr;
    roomCtx.clearRect(0, 0, vw, vh);

    if (roomReady && roomImg.naturalWidth) {
      var iw = roomImg.naturalWidth, ih = roomImg.naturalHeight;
      var ir = iw / ih, cr = vw / vh;
      var sx = 0, sy = 0, sw = iw, sh = ih;
      if (ir > cr) { sw = ih * cr; sx = (iw - sw) / 2; }
      else { sh = iw / cr; sy = (ih - sh) / 2; }
      roomCtx.drawImage(roomImg, sx, sy, sw, sh, 0, 0, vw, vh);
    } else {
      roomCtx.fillStyle = '#d8d5cf';
      roomCtx.fillRect(0, 0, vw, vh);
    }

    var fc = FRAMES[S.frameKey] || FRAMES.wood;
    var r = getRatio();
    var artW = Math.round(vw * S.artSize / 100 * S.scale);
    var artH = Math.round(artW * r);
    if (artH > vh * 0.72) { artH = Math.round(vh * 0.72); artW = Math.round(artH / r); }

    var matPx   = fc.mat   ? Math.round(Math.max(8, artW * 0.07))  : 0;
    var framePx = fc.frame ? Math.round(Math.max(3, artW * 0.016)) : 0;
    var totW = artW + (matPx + framePx) * 2;
    var totH = artH + (matPx + framePx) * 2;
    var ox = Math.round(S.artX * vw - totW / 2);
    var oy = Math.round(S.artY * vh - totH / 2);

    drawFramedArt(roomCtx, img, fc, ox, oy, artW, artH, {});
  }

  function roomPos(e) {
    var r = roomCanvas.getBoundingClientRect();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var cy = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (cx - r.left) / r.width, y: (cy - r.top) / r.height };
  }
  function onRoomDragStart(e) {
    var p = roomPos(e);
    var fc = FRAMES[S.frameKey] || FRAMES.wood;
    var r = roomCanvas.getBoundingClientRect();
    var vw = r.width, vh = r.height;
    var artW = vw * S.artSize / 100 * S.scale;
    var artH = artW * getRatio();
    var mat = fc.mat ? Math.max(8, artW * 0.07) : 0;
    var frm = fc.frame ? Math.max(3, artW * 0.016) : 0;
    var tw = (artW + (mat + frm) * 2) / vw * 0.5 + 0.05;
    var th = (artH + (mat + frm) * 2) / vh * 0.5 + 0.05;
    if (Math.abs(p.x - S.artX) < tw && Math.abs(p.y - S.artY) < th) {
      drag = { px: p.x, py: p.y, ax: S.artX, ay: S.artY };
      roomCanvas.style.cursor = 'grabbing';
    }
  }
  function onRoomDragMove(e) {
    if (!drag) return;
    if (e.cancelable) e.preventDefault();
    var p = roomPos(e);
    S.artX = Math.max(0.08, Math.min(0.92, drag.ax + (p.x - drag.px)));
    S.artY = Math.max(0.1, Math.min(0.85, drag.ay + (p.y - drag.py)));
    drawRoomCanvas();
  }
  function onRoomDragEnd() {
    drag = null;
    if (roomCanvas) roomCanvas.style.cursor = 'grab';
  }

  function openRoomView() {
    buildRoomView();
    document.body.style.overflow = 'hidden';
    roomFs.classList.add('ps-room-open');
    setTimeout(function () {
      resizeRoomCanvas();
      loadRoomBg(ROOMS[S.roomIdx].url, drawRoomCanvas);
    }, 30);
  }
  function closeRoomView() {
    if (!roomFs) return;
    roomFs.classList.remove('ps-room-open');
    document.body.style.overflow = '';
  }

  function sync(evV) {
    applyPicker();
    var v = evV || currentVariant();
    if (v) applyVariant(v);
    applyTilt();
    if (v) {
      var src = varImgSrc(v);
      if (imgKey(src) !== imgKey(imgSrc)) loadImg(src);
      else if (roomFs && roomFs.classList.contains('ps-room-open')) drawRoomCanvas();
    }
  }
  function scheduleSync(evV) {
    sync(evV);
    setTimeout(function () { sync(evV); }, 0);
    setTimeout(function () { sync(evV); }, 100);
  }

  var GALLERY_SEL = [
    '[data-testid="product-information-media"] media-gallery',
    '.product-information__media media-gallery',
    '.product-information__media',
    'product-media-gallery',
    '.product__media-wrapper media-gallery',
    '.product__media-wrapper',
    'media-gallery',
    '.product__media'
  ];
  function findGallery() {
    for (var i = 0; i < GALLERY_SEL.length; i++) {
      var el = document.querySelector(GALLERY_SEL[i]);
      if (el) return el;
    }
    return null;
  }
  function hideGallery(g) {
    g.style.setProperty('visibility', 'hidden', 'important');
    g.style.setProperty('opacity', '0', 'important');
    g.style.setProperty('pointer-events', 'none', 'important');
  }

  function mount(gallery) {
    var wrap = gallery.parentElement || gallery;
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

    hideGallery(gallery);
    new MutationObserver(function () { hideGallery(gallery); })
      .observe(gallery, { attributes: true, attributeFilter: ['style', 'class'] });
    new MutationObserver(function () {
      hideGallery(gallery);
      var ov = document.getElementById('ps-overlay');
      if (ov && wrap.lastElementChild && wrap.lastElementChild.id !== 'ps-overlay') wrap.appendChild(ov);
    }).observe(wrap, { childList: true });

    var overlay = document.createElement('div');
    overlay.id = 'ps-overlay';
    overlay.innerHTML = [
      '<div id="ps-stage">',
        '<div id="ps-loader" hidden><div class="ps-spinner"></div></div>',
        '<button type="button" id="ps-zoom-btn" aria-label="Zoom in" aria-pressed="false">',
          '<svg id="ps-zi" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">',
            '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
            '<line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
          '</svg>',
          '<svg id="ps-zo" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" hidden>',
            '<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
            '<line x1="8" y1="11" x2="14" y2="11"/>',
          '</svg>',
        '</button>',
        '<div id="ps-tilt">',
          '<span id="ps-size-lbl" hidden></span>',
          '<canvas id="ps-canvas" aria-label="' + TITLE + ' preview"></canvas>',
        '</div>',
      '</div>'
    ].join('');
    wrap.appendChild(overlay);

    function sizeOv() {
      var gr = gallery.getBoundingClientRect();
      var wr = wrap.getBoundingClientRect();
      if (gr.width < 4) return;
      overlay.style.cssText = [
        'position:absolute',
        'top:' + (gr.top - wr.top) + 'px',
        'left:' + (gr.left - wr.left) + 'px',
        'width:' + gr.width + 'px',
        'height:' + gr.height + 'px',
        'z-index:200',
        'background:#ffffff',
        'overflow:hidden'
      ].join(';');
    }
    sizeOv();
    window.addEventListener('resize', sizeOv);
    if (window.ResizeObserver) new ResizeObserver(function () { sizeOv(); drawGalleryCanvas(); }).observe(gallery);

    E.stage     = document.getElementById('ps-stage');
    E.tilt      = document.getElementById('ps-tilt');
    E.canvas    = document.getElementById('ps-canvas');
    E.sizeLabel = document.getElementById('ps-size-lbl');
    E.loader    = document.getElementById('ps-loader');

    var zBtn = document.getElementById('ps-zoom-btn');
    var zi = document.getElementById('ps-zi'), zo = document.getElementById('ps-zo');
    function toggleZoom() {
      S.zoomed = !S.zoomed;
      if (S.zoomed) { S.tiltX = 0; S.tiltY = 0; }
      applyTilt();
      zBtn.setAttribute('aria-pressed', S.zoomed ? 'true' : 'false');
      zBtn.setAttribute('aria-label', S.zoomed ? 'Zoom out' : 'Zoom in');
      zi.hidden = S.zoomed;
      zo.hidden = !S.zoomed;
    }
    zBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleZoom(); });

    bindGalleryTilt(E.tilt);
    if (window.ResizeObserver) new ResizeObserver(function () { drawGalleryCanvas(); }).observe(E.stage);

    var virBtn = document.createElement('button');
    virBtn.id = 'ps-vir-btn';
    virBtn.type = 'button';
    virBtn.textContent = 'View in a room';
    virBtn.addEventListener('click', openRoomView);

    var mediaCol = wrap.closest('.product-information__media') ||
      document.querySelector('[data-testid="product-information-media"]') || wrap;
    mediaCol.appendChild(virBtn);

    ['variant:update', 'variant:change', 'product:variant-change'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        var v = e && e.detail && (e.detail.variant || e.detail.resource);
        scheduleSync(v);
      });
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('variant-picker') || t.closest('product-form') || t.name === 'id' ||
          (t.name && t.name.indexOf('options') === 0) || t.closest('.variant-option')) scheduleSync();
    }, true);
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('.variant-option__button-label') || e.target.closest('fieldset.variant-option') ||
          e.target.closest('.variant-option') || e.target.closest('variant-picker')) scheduleSync();
    }, true);

    var idInp = varIdInput();
    if (idInp) {
      lastVarId = idInp.value;
      lastPickSig = pickerSig();
      if (pollId) clearInterval(pollId);
      pollId = setInterval(function () {
        var vid = idInp.value, ps = pickerSig();
        if (vid !== lastVarId || ps !== lastPickSig) {
          lastVarId = vid;
          lastPickSig = ps;
          scheduleSync();
        }
      }, 120);
    }

    scheduleSync();
    loadImg(varImgSrc(currentVariant()));
  }

  var tries = 0;
  function init() {
    var g = findGallery();
    if (!g) { if (++tries < 30) setTimeout(init, 250); return; }
    mount(g);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
