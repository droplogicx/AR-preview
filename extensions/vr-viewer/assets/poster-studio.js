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

  var INIT_SIZE  = root.dataset.initSize || '';
  var INIT_FRAME = root.dataset.initFrame || '';

  var productData = null;
  try {
    var dataEl = document.getElementById('ps-product-data');
    if (dataEl) productData = JSON.parse(dataEl.textContent);
  } catch (e) {}

  var SIZE_MAP = {
    '8x10': 0.50, '8x12': 0.40, '10x15': 0.54, '11x14': 0.68, '16x20': 0.82,
    '16x24': 0.80, '18x24': 0.92, '20x30': 1.00, '24x36': 1.22,
    '30x40': 1.36, '40x50': 1.50, '50x70': 1.62
  };

  var FRAMES = {
    none:   { frame: false, mat: false, float: false, canvas: false, metallic: false, color: null },
    canvas: { frame: false, mat: false, float: false, canvas: true,  metallic: false, color: null },
    float:  { frame: true,  mat: false, float: true,  canvas: false, metallic: false, color: '#0d0d0d' },
    wood:   { frame: true,  mat: true,  float: false, canvas: false, metallic: false, color: '#c9a96e' },
    white:  { frame: true,  mat: true,  float: false, canvas: false, metallic: false, color: '#ffffff' },
    black:  { frame: true,  mat: true,  float: false, canvas: false, metallic: false, color: '#1a1a1a' },
    gold:   { frame: true,  mat: true,  float: false, canvas: false, metallic: true,  color: '#c9a84c' },
    silver: { frame: true,  mat: true,  float: false, canvas: false, metallic: true,  color: '#b0b0b0' },
    walnut: { frame: true,  mat: true,  float: false, canvas: false, metallic: false, color: '#5c3d1e' },
    maple:  { frame: true,  mat: true,  float: false, canvas: false, metallic: false, color: '#d4a96a' }
  };

  var ROOMS = [
    { label: 'Living Room', url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?w=1800&q=85&auto=format&fit=crop' },
    { label: 'Bedroom',     url: 'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=1800&q=85&auto=format&fit=crop' },
    { label: 'Office',      url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=1800&q=85&auto=format&fit=crop' },
    { label: 'Hallway',     url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1800&q=85&auto=format&fit=crop' }
  ];
  (function loadRoomAssets() {
    var built = [];
    for (var i = 0; i < 8; i++) {
      var url = root.getAttribute('data-room-' + i) || '';
      if (!url) continue;
      if (url.indexOf('//') === 0) url = 'https:' + url;
      built.push({ label: 'Room ' + (built.length + 1), url: url });
    }
    if (built.length) ROOMS = built;
  })();

  var WALL_ART_X = 0.5;
  var WALL_ART_Y = 0.36;

  var S = {
    scale: 1.0, sizeW: 0, sizeH: 0, label: '', frameKey: 'wood',
    tiltX: 0, tiltY: 0, tiltOriginX: 50, tiltOriginY: 50, zoomed: false, loading: false,
    roomMode: false, roomIdx: 0
  };

  var E = {};
  var bufs = [new Image(), new Image()];
  var activeIdx = -1, pendingId = 0;
  var imgRatio = null, imgSrc = '';
  var mediaHost = null;
  var mounted = false;
  var syncTimer = null;
  var watchId = null;
  var lastVarId = '', lastPickSig = '', pollId = null;

  var roomImg = new Image();
  var roomReady = false, roomLoadedUrl = '';
  var roomInlineCtx = null;

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
    if (S.sizeW > 0 && S.sizeH > 0) return S.sizeH / S.sizeW;
    if (W_CM > 0 && H_CM > 0) return H_CM / W_CM;
    return 1.0;
  }
  function isLandscapeImg() {
    return getRatio() < 1;
  }
  function parseSize(str) {
    var m = String(str || '').match(/(\d+(?:\.\d+)?)\s*[*x×"']\s*(\d+(?:\.\d+)?)/i);
    if (!m) return { scale: 1.0, w: 0, h: 0 };
    var w = parseFloat(m[1]), h = parseFloat(m[2]);
    var k = w + 'x' + h;
    var scale = SIZE_MAP[k];
    if (!scale) scale = Math.min(1.62, Math.max(0.40, Math.sqrt(w * h / 864) * 1.12));
    return { scale: scale, w: w, h: h };
  }
  function parseSizeScale(str) { return parseSize(str).scale; }
  function parseFrameKey(str) {
    var s = String(str || '').toLowerCase().trim();
    if (!s || /unfram|no frame|^none$/i.test(s)) return 'none';
    if (/float|flort|convus|floating/i.test(s)) return 'float';
    if (/^canvas$|canvas wrap|gallery wrap|^stretched/i.test(s)) return 'canvas';
    if (/walnut/i.test(s)) return 'walnut';
    if (/maple/i.test(s)) return 'maple';
    if (/wood|natural|oak/i.test(s)) return 'wood';
    if (/white/i.test(s)) return 'white';
    if (/black/i.test(s)) return 'black';
    if (/gold/i.test(s)) return 'gold';
    if (/silver/i.test(s)) return 'silver';
    if (/canvas/i.test(s)) return 'canvas';
    return 'wood';
  }
  function normOptName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function pickValue(el) {
    if (!el) return '';
    if (el.value) return el.value;
    if (el.dataset.value) return el.dataset.value;
    if (el.dataset.optionValue) return el.dataset.optionValue;
    return (el.textContent || '').trim();
  }

  if (INIT_SIZE) {
    var initSz = parseSize(INIT_SIZE);
    S.scale = initSz.scale;
    S.sizeW = initSz.w;
    S.sizeH = initSz.h;
    S.label = INIT_SIZE;
  }
  if (INIT_FRAME) S.frameKey = parseFrameKey(INIT_FRAME);
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

    document.querySelectorAll('input[type="radio"][name^="options["]:checked').forEach(function (inp) {
      var name = inp.name.replace(/^options\[|\]$/g, '');
      if (name && inp.value) out[name] = inp.value;
    });

    document.querySelectorAll(
      'variant-picker fieldset, variant-selects fieldset, fieldset.variant-option, ' +
      '.product-form__input--pill, .product-form__input, .variant-input-wrap'
    ).forEach(function (fs) {
      var leg = fs.querySelector('legend, .form__label, label.form__label, .variant-form__label');
      var name = leg ? leg.textContent.trim().replace(/:$/, '') : '';
      if (!name && fs.dataset.optionName) name = fs.dataset.optionName;
      if (!name && fs.dataset.index != null && productData && productData.options) {
        name = productData.options[parseInt(fs.dataset.index, 10)] || '';
      }
      if (!name || out[name]) return;

      var chk = fs.querySelector('input[type="radio"]:checked, input:checked');
      if (chk && chk.value) { out[name] = chk.value; return; }

      var pressed = fs.querySelector('button[aria-pressed="true"], [aria-pressed="true"]');
      if (pressed) { out[name] = pickValue(pressed); return; }

      var checked = fs.querySelector('[aria-checked="true"]');
      if (checked) {
        var inp = checked.tagName === 'INPUT' ? checked : checked.querySelector('input[type="radio"], input');
        out[name] = pickValue(inp || checked);
        return;
      }

      var sel = fs.querySelector('.variant-option__button-label--selected, .variant-option--selected');
      if (sel) {
        var inp2 = sel.tagName === 'INPUT' ? sel : sel.querySelector('input[type="radio"], input');
        out[name] = pickValue(inp2 || sel);
      }
    });

    document.querySelectorAll(
      'variant-picker select, variant-selects select, select[name^="options["], .product-form__input select'
    ).forEach(function (sel) {
      var wrap = sel.closest('fieldset, .product-form__input, .variant-option, variant-picker, variant-selects');
      var name = '';
      if (wrap) {
        var l = wrap.querySelector('legend, label, .form__label');
        if (l) name = l.textContent.trim().replace(/:$/, '');
      }
      if (!name && sel.name) name = sel.name.replace(/^options\[|\]$/g, '');
      if (name && sel.value && !out[name]) out[name] = sel.value;
    });

    if (productData && productData.options) {
      productData.options.forEach(function (optName, i) {
        if (out[optName]) return;
        var chk = document.querySelector('input[name="options[' + i + ']"]:checked');
        if (chk && chk.value) { out[optName] = chk.value; return; }
        var sel = document.querySelector('select[name="options[' + i + ']"]');
        if (sel && sel.value) out[optName] = sel.value;
      });
    }

    return out;
  }
  function pickerSig() { return JSON.stringify(readPicker()); }
  function applyOption(name, val) {
    if (!val) return;
    var n = normOptName(name);
    if (/size|dimension|format/.test(n) || n.indexOf('size') >= 0) {
      var sz = parseSize(val);
      S.scale = sz.scale;
      S.sizeW = sz.w;
      S.sizeH = sz.h;
      S.label = val;
    } else if (/fram|mount|style|finish|print|frame/.test(n) || n.indexOf('frame') >= 0) {
      S.frameKey = parseFrameKey(val);
    }
  }
  function applyPicker() {
    var p = readPicker();
    Object.keys(p).forEach(function (k) { applyOption(k, p[k]); });
    return p;
  }
  function applyVariant(v) {
    if (!v || !productData) return;
    var opts = productData.options || [];
    [v.option1, v.option2, v.option3].forEach(function (val, i) {
      if (opts[i] && val) applyOption(opts[i], val);
    });
  }
  function applyState(evV) {
    var picker = readPicker();
    var v = evV || currentVariant();
    if (v) applyVariant(v);
    Object.keys(picker).forEach(function (k) { applyOption(k, picker[k]); });
    return v;
  }

  function setLoading(on) {
    S.loading = !!on;
    if (E.loader) E.loader.hidden = !on;
  }

  function activeBuf() { return activeIdx >= 0 ? bufs[activeIdx] : null; }
  function loadImg(src) {
    var full = norm(src) || IMG;
    if (!full) return;
    if (imgKey(full) === imgKey(imgSrc) && activeBuf() && activeBuf().naturalWidth) {
      setLoading(false);
      drawGalleryCanvas();
      if (S.roomMode) drawInlineRoom();
      return;
    }
    setLoading(true);
    var id = ++pendingId;
    var buf = bufs[activeIdx < 0 ? 0 : 1 - activeIdx];
    buf.onload = function () {
      if (id !== pendingId) return;
      if (buf.naturalWidth) {
        imgRatio = buf.naturalHeight / buf.naturalWidth;
        activeIdx = bufs.indexOf(buf);
        imgSrc = full;
      }
      setLoading(false);
      drawGalleryCanvas();
      if (S.roomMode) drawInlineRoom();
    };
    buf.onerror = function () {
      if (id !== pendingId) return;
      setLoading(false);
      if (activeBuf()) drawGalleryCanvas();
    };
    buf.src = shopifyW(full, 2400);
    if (buf.complete && buf.naturalWidth) buf.onload();
  }

  function drawImageFill(ctx, img, x, y, w, h) {
    if (!img || !img.naturalWidth) return;
    try { ctx.drawImage(img, x, y, w, h); } catch (e) {}
  }
  function drawShadow(ctx, ox, oy, w, h, tiltY, strength) {
    strength = strength || 1;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,' + (0.22 * strength) + ')';
    ctx.shadowBlur = Math.round(24 * strength);
    ctx.shadowOffsetX = Math.round(10 - (tiltY || 0) * 0.65);
    ctx.shadowOffsetY = Math.round(16);
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    ctx.fillRect(ox, oy, w, h);
    ctx.restore();
  }

  var SCALE_MIN = 0.54;
  var SCALE_MAX = 1.22;
  var OUTER_FILL = 0.62;

  function artFillFromScale(scaleF) {
    var t = (scaleF - SCALE_MIN) / (SCALE_MAX - SCALE_MIN);
    t = Math.max(0, Math.min(1, t));
    return 0.38 + t * 0.55;
  }

  function floatGapPx(totW) {
    return Math.max(14, Math.round(totW * 0.052));
  }

  function frameBorderPx(outerW, fc) {
    if (!fc.frame) return 0;
    if (fc.float) return Math.max(14, Math.round(outerW * 0.034));
    if (S.frameKey === 'white') {
      return Math.max(10, Math.round(outerW * 0.024));
    }
    if (fc.metallic || (fc.frame && !fc.mat)) {
      return Math.max(7, Math.round(outerW * 0.019));
    }
    return Math.max(11, Math.round(outerW * 0.026));
  }

  function frameDepthPx(outerW, fc) {
    if (fc.canvas) return Math.max(16, Math.round(outerW * 0.048));
    if (!fc.frame && !fc.mat) return 0;
    if (fc.float) return Math.max(26, Math.round(outerW * 0.058));
    if (fc.metallic || (fc.frame && !fc.mat)) return Math.max(12, Math.round(outerW * 0.028));
    return Math.max(28, Math.round(outerW * 0.072));
  }

  function fixedOuterSize(availW, availH, r, landscape, framePx, fill) {
    fill = fill != null ? fill : OUTER_FILL;
    framePx = framePx || 11;
    var totW, totH, innerW, innerH;

    if (landscape) {
      totW = Math.round(availW * fill);
      innerW = totW - 2 * framePx;
      innerH = Math.round(innerW * r);
      totH = innerH + 2 * framePx;
    } else {
      totH = Math.round(availH * fill);
      innerH = totH - 2 * framePx;
      innerW = Math.round(innerH / r);
      totW = innerW + 2 * framePx;
    }

    if (totH > availH) {
      totH = Math.round(availH);
      innerH = totH - 2 * framePx;
      innerW = Math.round(innerH / r);
      totW = innerW + 2 * framePx;
    }
    if (totW > availW) {
      totW = Math.round(availW);
      innerW = totW - 2 * framePx;
      innerH = Math.round(innerW * r);
      totH = innerH + 2 * framePx;
    }

    return { totW: totW, totH: totH, innerW: innerW, innerH: innerH };
  }

  function innerArtSize(innerW, innerH, scaleF) {
    var fill = artFillFromScale(scaleF);
    var m = Math.round(Math.min(innerW, innerH) * (1 - fill) / 2);
    var artW = innerW - 2 * m;
    var artH = innerH - 2 * m;
    return {
      artW: Math.max(12, artW),
      artH: Math.max(12, artH),
      matM: Math.max(0, m)
    };
  }

  function drawWoodFace(ctx, ox, oy, w, h, color) {
    var grad = ctx.createLinearGradient(ox, oy, ox + w, oy + h);
    grad.addColorStop(0, shade(color, 18));
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, shade(color, -22));
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, w, h);
    ctx.globalAlpha = 0.1;
    for (var x = ox + 2; x < ox + w; x += 4) {
      ctx.fillStyle = shade(color, ((x - ox) % 8) - 4);
      ctx.fillRect(x, oy, 1, h);
    }
    ctx.globalAlpha = 1;
  }

  function showWhiteMat(fc) {
    return fc.frame && !fc.float && !fc.canvas;
  }

  function drawFloatFrameFront(ctx, ox, oy, w, h, framePx) {
    var grad = ctx.createLinearGradient(ox, oy, ox + w, oy + h);
    grad.addColorStop(0, '#2a2a2a');
    grad.addColorStop(0.25, '#141414');
    grad.addColorStop(0.75, '#0a0a0a');
    grad.addColorStop(1, '#1f1f1f');
    ctx.fillStyle = grad;
    ctx.fillRect(ox, oy, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(ox, oy, w, framePx);
    ctx.fillRect(ox, oy, framePx, h);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(ox + framePx, oy + framePx, w - framePx * 2, Math.max(3, Math.round(framePx * 0.45)));
    ctx.fillRect(ox + framePx, oy + framePx, Math.max(3, Math.round(framePx * 0.45)), h - framePx * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(ox + w - framePx, oy + framePx, framePx, h - framePx * 2);
    ctx.fillRect(ox + framePx, oy + h - framePx, w - framePx * 2, framePx);
  }

  function drawFloatPieceShadow(ctx, x, y, w, h) {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.42)';
    ctx.shadowBlur = Math.round(Math.max(12, w * 0.038));
    ctx.shadowOffsetX = Math.round(Math.max(3, w * 0.016));
    ctx.shadowOffsetY = Math.round(Math.max(4, h * 0.022));
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }

  function drawFrameFront(ctx, ox, oy, w, h, framePx, fc, flat3d) {
    var color = fc.color;
    if (fc.float) {
      drawFloatFrameFront(ctx, ox, oy, w, h, framePx);
      return;
    }
    if (S.frameKey === 'white') {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox, oy, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 1;
      ctx.strokeRect(ox + 0.5, oy + 0.5, w - 1, h - 1);
      if (flat3d) {
        ctx.fillStyle = 'rgba(0,0,0,0.04)';
        ctx.fillRect(ox + framePx, oy + framePx, w - framePx * 2, 1);
        ctx.fillRect(ox + framePx, oy + framePx, 1, h - framePx * 2);
      }
      return;
    }
    if (fc.metallic && color) {
      var grad = ctx.createLinearGradient(ox, oy, ox + w, oy + h);
      grad.addColorStop(0, shade(color, 36));
      grad.addColorStop(0.35, color);
      grad.addColorStop(0.7, shade(color, -8));
      grad.addColorStop(1, shade(color, -28));
      ctx.fillStyle = grad;
      ctx.fillRect(ox, oy, w, h);
    } else if (S.frameKey === 'wood' || S.frameKey === 'walnut' || S.frameKey === 'maple') {
      drawWoodFace(ctx, ox, oy, w, h, color);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(ox, oy, w, h);
    }
    if (flat3d) {
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      ctx.fillRect(ox + framePx, oy + framePx, w - framePx * 2, 1);
      ctx.fillRect(ox + framePx, oy + framePx, 1, h - framePx * 2);
      return;
    }
    ctx.fillStyle = shade(color, -20);
    ctx.fillRect(ox, oy, w, framePx);
    ctx.fillRect(ox, oy, framePx, h);
    ctx.fillStyle = shade(color, 12);
    ctx.fillRect(ox, oy + h - framePx, w, framePx);
    ctx.fillRect(ox + w - framePx, oy, framePx, h);
    if (fc.mat) {
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.fillRect(ox + framePx, oy + framePx, w - framePx * 2, 1);
      ctx.fillRect(ox + framePx, oy + framePx, 1, h - framePx * 2);
    }
  }

  function drawCanvasWrap(ctx, img, ox, oy, artW, artH) {
    try { drawImageFill(ctx, img, ox, oy, artW, artH); } catch (e) {}
  }

  function drawFramedArt(ctx, img, fc, ox, oy, artW, artH, opts) {
    opts = opts || {};
    var tiltY = opts.tiltY || 0;
    var totW = opts.totW;
    var totH = opts.totH;
    var borders = opts.borders || {};

    if (fc.canvas) {
      if (!totW) { totW = artW; totH = artH; }
      drawCanvasWrap(ctx, img, ox, oy, artW, artH);
      return { totW: totW, totH: totH, depth: borders.depthPx || frameDepthPx(totW, fc) };
    }

    if (!fc.frame && !fc.mat) {
      if (!totW) { totW = artW; totH = artH; }
      drawShadow(ctx, ox, oy, totW, totH, tiltY, 0.85);
      var ux = ox + Math.round((totW - artW) / 2);
      var uy = oy + Math.round((totH - artH) / 2);
      try { drawImageFill(ctx, img, ux, uy, artW, artH); } catch (e) {}
      return { totW: totW, totH: totH };
    }

    var framePx = borders.framePx || frameBorderPx(totW, fc);
    var gapPx = borders.gapPx || (fc.float ? floatGapPx(totW) : 0);
    var depth3d = borders.depthPx || frameDepthPx(totW, fc);
    var use3d = depth3d > 0;

    if (!use3d) drawShadow(ctx, ox, oy, totW, totH, tiltY, fc.float ? 1.2 : 1);

    if (fc.frame && fc.color) {
      drawFrameFront(ctx, ox, oy, totW, totH, framePx, fc, use3d);
    }

    var innerX = ox + framePx;
    var innerY = oy + framePx;
    var innerW = totW - framePx * 2;
    var innerH = totH - framePx * 2;

    if (fc.float && gapPx > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(innerX, innerY, innerW, innerH);
      innerX += gapPx;
      innerY += gapPx;
      innerW -= gapPx * 2;
      innerH -= gapPx * 2;
    }

    if (showWhiteMat(fc)) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(innerX, innerY, innerW, innerH);
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(innerX + 1, innerY + 1, innerW - 2, 2);
      ctx.fillRect(innerX + 1, innerY + 1, 2, innerH - 2);
      ctx.fillStyle = 'rgba(0,0,0,0.04)';
      ctx.fillRect(innerX + innerW - 3, innerY + 1, 2, innerH - 2);
      ctx.fillRect(innerX + 1, innerY + innerH - 3, innerW - 2, 2);
    }

    var imgX = innerX + Math.round((innerW - artW) / 2);
    var imgY = innerY + Math.round((innerH - artH) / 2);
    if (fc.float) drawFloatPieceShadow(ctx, imgX, imgY, artW, artH);
    try { drawImageFill(ctx, img, imgX, imgY, artW, artH); } catch (e) {}

    return { totW: totW, totH: totH, depth: depth3d };
  }

  function calcGalleryFrame(stageW, stageH, opts) {
    opts = opts || {};
    var fc = FRAMES[S.frameKey] || FRAMES.wood;
    var r = getRatio();
    var pad = opts.wallMode ? 0 : Math.max(28, Math.min(stageW, stageH) * 0.08);
    var availW = stageW - pad * 2;
    var availH = stageH - pad * 2;
    var scaleF = S.scale || 1.0;
    var landscape = isLandscapeImg();
    var outerFill = opts.wallMode
      ? Math.min(0.40, 0.28 + (scaleF - SCALE_MIN) / (SCALE_MAX - SCALE_MIN) * 0.12)
      : OUTER_FILL;
    var outer, totW, totH, artW, artH, borders;

    if (fc.canvas) {
      var fill = (opts.wallMode ? 0.32 : 0.58) * scaleF;
      if (landscape) {
        artW = Math.round(availW * fill);
        artH = Math.round(artW * r);
      } else {
        artH = Math.round(availH * fill);
        artW = Math.round(artH / r);
      }
      if (artH > availH) {
        artH = Math.round(availH);
        artW = Math.round(artH / r);
      }
      if (artW > availW) {
        artW = Math.round(availW);
        artH = Math.round(artW * r);
      }
      totW = artW;
      totH = artH;
      borders = { depthPx: frameDepthPx(totW, fc) };
      return { fc: fc, artW: artW, artH: artH, totW: totW, totH: totH, depth: borders.depthPx, borders: borders };
    }

    outer = fixedOuterSize(availW, availH, r, landscape, frameBorderPx(Math.round(Math.min(availW, availH) * outerFill), fc), outerFill);
    for (var i = 0; i < 3; i++) {
      var fp = frameBorderPx(outer.totW, fc);
      outer = fixedOuterSize(availW, availH, r, landscape, fp, outerFill);
    }
    totW = outer.totW;
    totH = outer.totH;

    var framePx = frameBorderPx(totW, fc);
    var gapPx = fc.float ? floatGapPx(totW) : 0;
    var innerW = outer.innerW - gapPx * 2;
    var innerH = outer.innerH - gapPx * 2;
    var art = innerArtSize(innerW, innerH, scaleF);
    artW = art.artW;
    artH = art.artH;

    borders = {
      gapPx: gapPx,
      framePx: framePx,
      depthPx: frameDepthPx(totW, fc)
    };

    return {
      fc: fc,
      artW: artW,
      artH: artH,
      totW: totW,
      totH: totH,
      depth: borders.depthPx,
      borders: borders
    };
  }

  function syncFrame3D(fc) {
    var wrap = E.wrap;
    var canvas = E.canvas;
    if (!wrap || !canvas) return;

    var box = document.getElementById('ps-frame-box');
    wrap.classList.remove('ps-frame-3d');
    wrap.classList.toggle('ps-gallery-canvas', !!fc.canvas);
    if (box) {
      if (E.loader && wrap.contains(E.loader)) {
        wrap.insertBefore(canvas, E.loader.nextSibling);
      } else {
        wrap.insertBefore(canvas, box);
      }
      box.remove();
    }
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

    var flatBorders = {
      gapPx: layout.borders.gapPx,
      framePx: layout.borders.framePx,
      depthPx: 0
    };

    drawFramedArt(ctx, img, layout.fc, 0, 0, layout.artW, layout.artH, {
      tiltY: S.zoomed ? 0 : S.tiltY,
      totW: layout.totW,
      totH: layout.totH,
      borders: flatBorders
    });

    syncFrame3D(layout.fc);

    if (E.sizeLabel) E.sizeLabel.hidden = true;
  }

  function baseTiltY() { return 0; }

  function baseTiltX() { return 0; }

  function applyTilt(skipDraw) {
    if (!E.tilt) return;
    if (S.roomMode) {
      S.tiltX = 0;
      S.tiltY = 0;
      E.tilt.style.transform = 'none';
      if (E.stage) E.stage.classList.remove('ps-zoomed');
      return;
    }
    var sc = S.zoomed ? 1.65 : 1;
    var ry = S.zoomed ? 0 : S.tiltY;
    var rx = S.zoomed ? 0 : S.tiltX;
    var tiltMag = Math.max(Math.abs(S.tiltY), Math.abs(S.tiltX));
    var tz = S.zoomed ? 0 : (tiltMag > 0.5 ? 9 + Math.min(24, tiltMag * 0.42) : 0);
    var ox = S.tiltOriginX != null ? S.tiltOriginX : 50;
    var oy = S.tiltOriginY != null ? S.tiltOriginY : 50;
    E.tilt.style.transformOrigin = ox + '% ' + oy + '%';
    E.tilt.style.transform =
      'translateZ(' + tz + 'px) rotateY(' + ry + 'deg) rotateX(' + rx + 'deg) scale(' + sc + ')';
    if (E.stage) E.stage.classList.toggle('ps-zoomed', S.zoomed);
    if (E.tilt) {
      E.tilt.classList.toggle('ps-canvas-tilt', S.frameKey === 'canvas');
      E.tilt.classList.toggle('ps-tilting', tiltMag > 1 && !S.zoomed);
      E.tilt.classList.toggle('ps-float-tilt', S.frameKey === 'float');
      E.tilt.classList.toggle('ps-framed-3d', S.frameKey !== 'none' && S.frameKey !== 'canvas');
    }
    if (!skipDraw) drawGalleryCanvas();
  }

  function bindGalleryTilt(el) {
    var stage = E.stage || el;
    if (!stage) return;
    function setTilt(cx, cy) {
      if (S.zoomed || S.loading || S.roomMode) return;
      var b = stage.getBoundingClientRect();
      if (b.width < 4) return;
      var nx = Math.max(0, Math.min(1, (cx - b.left) / b.width));
      var ny = Math.max(0, Math.min(1, (cy - b.top) / b.height));
      var edgeX = Math.abs(nx - 0.5) * 2;
      S.tiltY = (0.5 - nx) * 46 * (0.4 + edgeX * 0.6);
      S.tiltX = (ny - 0.5) * -11 * (0.4 + Math.abs(ny - 0.5) * 2 * 0.6);
      S.tiltOriginX = 50 + (0.5 - nx) * 27;
      S.tiltOriginY = 50 + (ny - 0.5) * 11;
      applyTilt(true);
    }
    function rst() {
      S.tiltX = 0;
      S.tiltY = 0;
      S.tiltOriginX = 50;
      S.tiltOriginY = 50;
      applyTilt(true);
    }
    stage.addEventListener('mousemove', function (e) { setTilt(e.clientX, e.clientY); });
    stage.addEventListener('mouseleave', rst);
    stage.addEventListener('touchmove', function (e) {
      if (e.touches[0]) setTilt(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    stage.addEventListener('touchend', rst);
  }

  /* ── Inline room view (inside gallery canvas) ─────────────────────────── */
  function loadRoomBg(url, cb) {
    if (url === roomLoadedUrl && roomReady) { if (cb) cb(); return; }
    roomLoadedUrl = url;
    roomReady = false;
    roomImg.onload = function () { roomReady = true; if (S.roomMode) drawInlineRoom(); if (cb) cb(); };
    roomImg.onerror = function () { if (cb) cb(); };
    roomImg.src = url;
    if (roomImg.complete && roomImg.naturalWidth) { roomReady = true; if (S.roomMode) drawInlineRoom(); if (cb) cb(); }
  }

  function resizeInlineRoom() {
    var canvas = E.roomInline;
    var stage = E.stage;
    if (!canvas || !stage) return;
    var r = stage.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    canvas.style.width = r.width + 'px';
    canvas.style.height = r.height + 'px';
    roomInlineCtx = canvas.getContext('2d');
    roomInlineCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    roomInlineCtx.imageSmoothingEnabled = true;
    roomInlineCtx.imageSmoothingQuality = 'high';
    drawInlineRoom();
  }

  function drawRoomBackground(ctx, vw, vh) {
    if (roomReady && roomImg.naturalWidth) {
      var iw = roomImg.naturalWidth, ih = roomImg.naturalHeight;
      var ir = iw / ih, cr = vw / vh;
      var sx = 0, sy = 0, sw = iw, sh = ih;
      if (ir > cr) { sw = ih * cr; sx = (iw - sw) / 2; }
      else { sh = iw / cr; sy = (ih - sh) / 2; }
      ctx.drawImage(roomImg, sx, sy, sw, sh, 0, 0, vw, vh);
    } else {
      ctx.fillStyle = '#e5e2dc';
      ctx.fillRect(0, 0, vw, vh);
    }
  }

  function drawInlineRoom() {
    var canvas = E.roomInline;
    var stage = E.stage;
    if (!canvas || !stage || !S.roomMode) return;
    var img = activeBuf();
    if (!img || !img.naturalWidth) return;

    if (!roomInlineCtx) resizeInlineRoom();
    if (!roomInlineCtx) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vw = canvas.width / dpr;
    var vh = canvas.height / dpr;
    var ctx = roomInlineCtx;
    ctx.clearRect(0, 0, vw, vh);
    drawRoomBackground(ctx, vw, vh);

    var fc = FRAMES[S.frameKey] || FRAMES.wood;
    var layout = calcGalleryFrame(vw, vh, { wallMode: true });
    var ox = Math.round(WALL_ART_X * vw - layout.totW / 2);
    var oy = Math.round(WALL_ART_Y * vh - layout.totH / 2);

    drawFramedArt(ctx, img, fc, ox, oy, layout.artW, layout.artH, {
      totW: layout.totW,
      totH: layout.totH,
      borders: { gapPx: layout.borders.gapPx, framePx: layout.borders.framePx, depthPx: 0 }
    });
  }

  function setRoomMode(on) {
    S.roomMode = !!on;
    var btn = document.getElementById('ps-vir-btn');
    if (btn) btn.textContent = S.roomMode ? 'View close up' : 'View in a room';
    if (E.stage) E.stage.classList.toggle('ps-room-active', S.roomMode);
    var viewer = document.getElementById('ps-viewer');
    if (viewer) viewer.classList.toggle('ps-room-active', S.roomMode);
    if (S.roomMode) {
      S.zoomed = false;
      S.tiltX = 0;
      S.tiltY = 0;
      applyTilt(true);
      loadRoomBg(ROOMS[S.roomIdx].url, function () {
        requestAnimationFrame(resizeInlineRoom);
      });
    } else {
      applyTilt(true);
      drawGalleryCanvas();
    }
  }

  function toggleRoomView() {
    setRoomMode(!S.roomMode);
  }

  function sync(evV) {
    var prevFrameKey = S.frameKey;
    var prevScale = S.scale;
    var v = applyState(evV);

    var src = v ? varImgSrc(v) : IMG;
    var needsNewImg = v && imgKey(src) !== imgKey(imgSrc);
    var frameChanged = S.frameKey !== prevFrameKey || S.scale !== prevScale;

    if (needsNewImg) {
      setLoading(true);
      applyTilt(true);
      loadImg(src);
      return;
    }

    if (frameChanged) {
      setLoading(true);
      requestAnimationFrame(function () {
        applyTilt();
        if (S.roomMode) drawInlineRoom();
        requestAnimationFrame(function () { setLoading(false); });
      });
      return;
    }

    applyTilt();
    if (S.roomMode) drawInlineRoom();
  }
  function scheduleSync(evV) {
    if (syncTimer) clearTimeout(syncTimer);
    sync(evV);
    syncTimer = setTimeout(function () { sync(); ensureViewer(); }, 50);
    setTimeout(function () { sync(); ensureViewer(); }, 180);
    setTimeout(function () { sync(); ensureViewer(); }, 400);
  }

  function onViewerResize() {
    drawGalleryCanvas();
    if (S.roomMode) resizeInlineRoom();
  }

  function restoreRoomUi() {
    if (!S.roomMode) return;
    if (E.stage) E.stage.classList.add('ps-room-active');
    var viewer = document.getElementById('ps-viewer');
    if (viewer) viewer.classList.add('ps-room-active');
    var btn = document.getElementById('ps-vir-btn');
    if (btn) btn.textContent = 'View close up';
    resizeInlineRoom();
  }

  function ensureVirButton() {
    var viewer = document.getElementById('ps-viewer');
    if (!viewer) return;

    var wrap = document.getElementById('ps-vir-wrap');
    var btn = document.getElementById('ps-vir-btn');

    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'ps-vir-wrap';
      wrap.className = 'ps-vir-wrap';
      viewer.appendChild(wrap);
    } else if (!viewer.contains(wrap)) {
      viewer.appendChild(wrap);
    }

    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'ps-vir-btn';
      btn.type = 'button';
      wrap.appendChild(btn);
    } else if (btn.parentElement !== wrap) {
      wrap.appendChild(btn);
    }

    if (!btn.dataset.psBound) {
      btn.dataset.psBound = '1';
      btn.addEventListener('click', toggleRoomView);
    }
    btn.textContent = S.roomMode ? 'View close up' : 'View in a room';
  }

  var HOST_SEL = [
    '[data-testid="product-information-media"]',
    '.product-information__media',
    '.product__media-wrapper',
    '.product__media'
  ];
  function findMediaHost() {
    for (var i = 0; i < HOST_SEL.length; i++) {
      var el = document.querySelector(HOST_SEL[i]);
      if (el) return el;
    }
    return findGallery();
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
  function hideNativeMedia(container) {
    if (!container) return;
    document.body.classList.add('ps-active');
    Array.from(container.children).forEach(function (el) {
      if (el.id === 'ps-viewer' || el.id === 'ps-media-slot') return;
      el.setAttribute('data-ps-hidden', '1');
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
    container.querySelectorAll(
      'media-gallery, product-media-gallery, slideshow-component, slideshow-slide, ' +
      'deferred-media, product-media, .product-media, .product-media-container, ' +
      '.product__media-item, .product-media-modal, img, video'
    ).forEach(function (el) {
      if (el.id === 'ps-viewer' || el.id === 'ps-media-slot' || el.closest('#ps-viewer') || el.closest('#ps-media-slot')) return;
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
  }

  function viewerHtml() {
    return [
      '<div id="ps-stage">',
        '<canvas id="ps-room-inline" aria-hidden="true"></canvas>',
        '<div id="ps-gallery-layer">',
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
            '<div id="ps-canvas-wrap">',
              '<div id="ps-loader" hidden><div class="ps-spinner"></div></div>',
              '<canvas id="ps-canvas" aria-label="' + TITLE + ' preview"></canvas>',
            '</div>',
          '</div>',
        '</div>',
      '</div>',
      '<div id="ps-vir-wrap" class="ps-vir-wrap">',
        '<button type="button" id="ps-vir-btn">View in a room</button>',
      '</div>'
    ].join('');
  }

  function bindViewerRefs() {
    E.stage        = document.getElementById('ps-stage');
    E.galleryLayer = document.getElementById('ps-gallery-layer');
    E.roomInline   = document.getElementById('ps-room-inline');
    E.tilt         = document.getElementById('ps-tilt');
    E.wrap         = document.getElementById('ps-canvas-wrap');
    E.canvas       = document.getElementById('ps-canvas');
    E.sizeLabel    = document.getElementById('ps-size-lbl');
    E.loader       = document.getElementById('ps-loader');
  }

  function createViewer(host) {
    var viewer = document.createElement('div');
    viewer.id = 'ps-viewer';
    viewer.innerHTML = viewerHtml();
    host.insertBefore(viewer, host.firstChild);
    bindViewerRefs();
    return viewer;
  }

  function ensureMediaSlot(host) {
    if (!host) return null;
    var slot = document.getElementById('ps-media-slot');
    if (!slot || !host.contains(slot)) {
      if (slot && slot.parentElement) slot.parentElement.removeChild(slot);
      slot = document.createElement('div');
      slot.id = 'ps-media-slot';
      host.insertBefore(slot, host.firstChild);
    }
    return slot;
  }

  function bindControls() {
    var zBtn = document.getElementById('ps-zoom-btn');
    if (zBtn && !zBtn.dataset.psBound) {
      zBtn.dataset.psBound = '1';
      var zi = document.getElementById('ps-zi'), zo = document.getElementById('ps-zo');
      zBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        S.zoomed = !S.zoomed;
        if (S.zoomed) { S.tiltX = 0; S.tiltY = 0; S.tiltOriginX = 50; S.tiltOriginY = 50; }
        applyTilt();
        zBtn.setAttribute('aria-pressed', S.zoomed ? 'true' : 'false');
        zBtn.setAttribute('aria-label', S.zoomed ? 'Zoom out' : 'Zoom in');
        if (zi) zi.hidden = S.zoomed;
        if (zo) zo.hidden = !S.zoomed;
      });
    }
    if (E.stage && !E.stage.dataset.psBound) {
      E.stage.dataset.psBound = '1';
      bindGalleryTilt(E.stage);
    }
  }

  function ensureViewer() {
    var host = mediaHost || findMediaHost();
    if (!host) return false;
    mediaHost = host;
    host.classList.add('ps-gallery-host');
    hideNativeMedia(host);

    var slot = ensureMediaSlot(host);
    if (!slot) return false;

    var viewer = document.getElementById('ps-viewer');
    if (!viewer || !slot.contains(viewer)) {
      if (viewer && viewer.parentElement) viewer.parentElement.removeChild(viewer);
      createViewer(slot);
      bindControls();
      if (activeBuf() && activeBuf().naturalWidth) {
        applyTilt(true);
        drawGalleryCanvas();
        restoreRoomUi();
      }
    } else {
      bindViewerRefs();
    }
    return true;
  }

  function bindVariantListeners() {
    if (mounted) return;
    mounted = true;

    ['variant:update', 'variant:change', 'product:variant-change', 'variant:selected'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        var d = e && e.detail;
        var v = d && (d.variant || d.resource || d.selectedVariant);
        ensureViewer();
        scheduleSync(v);
      });
    });
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('variant-picker') || t.closest('variant-selects') || t.closest('product-form') ||
          t.name === 'id' || (t.name && t.name.indexOf('options') === 0) ||
          t.closest('.variant-option') || t.closest('.product-form__input')) {
        ensureViewer();
        scheduleSync();
      }
    }, true);
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      if (e.target.closest('.variant-option__button-label') || e.target.closest('fieldset.variant-option') ||
          e.target.closest('.variant-option') || e.target.closest('variant-picker') ||
          e.target.closest('variant-selects') || e.target.closest('.product-form__input--pill') ||
          e.target.closest('.product-form__input') || e.target.closest('label[for^="option"]') ||
          (e.target.matches && e.target.matches('input[type="radio"][name^="options"]'))) {
        ensureViewer();
        scheduleSync();
      }
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
          ensureViewer();
          scheduleSync();
        }
      }, 120);
    }

    if (watchId) clearInterval(watchId);
    watchId = setInterval(function () {
      var slot = document.getElementById('ps-media-slot');
      var viewer = document.getElementById('ps-viewer');
      if (!slot || !viewer || !document.getElementById('ps-canvas')) {
        ensureViewer();
        scheduleSync();
      } else {
        hideNativeMedia(mediaHost);
        ensureVirButton();
        if (activeBuf() && activeBuf().naturalWidth && E.canvas) {
          drawGalleryCanvas();
          if (S.roomMode) drawInlineRoom();
        }
      }
    }, 350);
  }

  function mount(host) {
    mediaHost = host || findMediaHost();
    if (!mediaHost) return;
    ensureViewer();

    var viewer = document.getElementById('ps-viewer');
    if (!viewer) return;

    new MutationObserver(function () {
      ensureViewer();
      hideNativeMedia(mediaHost);
    }).observe(mediaHost, { childList: true, subtree: true });

    if (window.ResizeObserver) {
      new ResizeObserver(onViewerResize).observe(viewer);
      if (E.stage) new ResizeObserver(onViewerResize).observe(E.stage);
    }
    window.addEventListener('resize', onViewerResize);

    bindControls();
    ensureVirButton();
    loadRoomBg(ROOMS[S.roomIdx].url);

    bindVariantListeners();
    scheduleSync(currentVariant());
    loadImg(varImgSrc(currentVariant()));
    applyTilt();
  }

  var tries = 0;
  function init() {
    ensureVirButton();
    var host = findMediaHost();
    if (!host) { if (++tries < 30) setTimeout(init, 250); return; }
    mount(host);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})();
