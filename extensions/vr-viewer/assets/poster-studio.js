(function () {
  'use strict';

  var configEl = document.getElementById('ps-root');
  if (!configEl) return;

  var TITLE     = configEl.dataset.title || 'Product';
  var IMG       = configEl.dataset.img || '';
  var IMG_W     = parseFloat(configEl.dataset.imgW || '0');
  var IMG_H     = parseFloat(configEl.dataset.imgH || '0');
  var WIDTH_CM  = parseFloat(configEl.dataset.width || '60');
  var HEIGHT_CM = parseFloat(configEl.dataset.height || '40');

  if (IMG.indexOf('//') === 0) IMG = 'https:' + IMG;

  var productData = null;
  try {
    var jsonEl = document.getElementById('ps-product-data');
    if (jsonEl) productData = JSON.parse(jsonEl.textContent);
  } catch (e) {
    console.warn('[Poster Studio] Could not parse product JSON');
  }

  var TILT_MAX_Y = 14;
  var TILT_MAX_X = 10;
  var imageReady = false;
  var loadedImageUrl = '';
  var lastVariantId = '';
  var pickerWatchId = null;

  var SIZE_SCALE_MAP = {
    '10x15': 0.55,
    '11x14': 0.72,
    '16x20': 0.88,
    '16x24': 0.82,
    '18x24': 0.98,
    '20x30': 1.0,
    '24x36': 1.18,
    '8x10': 0.52
  };

  var state = {
    sizeScale: 1,
    sizeLabel: '',
    frameType: 'frame',
    frameColor: '#6b4c35',
    matting: false,
    floatShadow: false,
    hoverTiltX: 0,
    hoverTiltY: 0
  };

  var els = {};
  var productRatio = null;
  var productImage = new Image();

  function getProductRatio() {
    if (productRatio && productRatio > 0) return productRatio;
    if (IMG_W > 0 && IMG_H > 0) return IMG_H / IMG_W;
    if (HEIGHT_CM > 0 && WIDTH_CM > 0) return HEIGHT_CM / WIDTH_CM;
    return 1.25;
  }

  function normalizeSrc(src) {
    if (!src || typeof src !== 'string') return '';
    var s = src.trim();
    if (!s || s === 'undefined' || s === 'null') return '';
    if (s.indexOf('//') === 0) return 'https:' + s;
    return s;
  }

  function sizeKeyFromString(str) {
    if (!str) return null;
    var m = String(str).match(/(\d+(?:\.\d+)?)\s*[*x×]\s*(\d+(?:\.\d+)?)/i);
    if (!m) return null;
    return parseFloat(m[1]) + 'x' + parseFloat(m[2]);
  }

  function scaleFromSize(str) {
    var key = sizeKeyFromString(str);
    if (key && SIZE_SCALE_MAP[key]) return SIZE_SCALE_MAP[key];
    if (key) {
      var p = key.split('x');
      var area = parseFloat(p[0]) * parseFloat(p[1]);
      return Math.min(1.35, Math.max(0.45, Math.sqrt(area / 864) * 1.12));
    }
    return 1;
  }

  function frameFromOption(str) {
    var s = String(str || '').toLowerCase().trim();
    if (!s || /unfram/i.test(s)) {
      return { type: 'none', color: null, matting: false, floatShadow: false };
    }
    if (/float/i.test(s)) {
      return { type: 'float', color: null, matting: false, floatShadow: true };
    }
    if (s === 'canvas' || /^canvas\s*print/i.test(s)) {
      return { type: 'canvas', color: null, matting: false, floatShadow: false };
    }
    if (/wood/i.test(s)) return { type: 'frame', color: '#6b4c35', matting: true, floatShadow: false };
    if (/white/i.test(s)) return { type: 'frame', color: '#f5f5f0', matting: true, floatShadow: false };
    if (/black/i.test(s)) return { type: 'frame', color: '#1a1a1a', matting: true, floatShadow: false };
    if (/gold/i.test(s)) return { type: 'frame', color: '#c9a84c', matting: true, floatShadow: false };
    if (/silver/i.test(s)) return { type: 'frame', color: '#9a9a9a', matting: true, floatShadow: false };
    return { type: 'frame', color: '#6b4c35', matting: true, floatShadow: false };
  }

  function isSizeOption(name) {
    return /size|dimension/i.test(name || '');
  }

  function isFrameOption(name) {
    return /fram|mount|style|finish/i.test(name || '');
  }

  function applyOptionByName(optionName, value) {
    if (!value) return;
    if (isSizeOption(optionName)) {
      state.sizeScale = scaleFromSize(value);
      state.sizeLabel = value;
      return;
    }
    if (isFrameOption(optionName)) {
      var f = frameFromOption(value);
      state.frameType = f.type;
      state.frameColor = f.color;
      state.matting = f.matting;
      state.floatShadow = f.floatShadow;
    }
  }

  function getVariantIdInput() {
    return document.querySelector('form[action*="/cart/add"] input[name="id"]') ||
      document.querySelector('input[name="id"]');
  }

  function getCurrentVariant() {
    if (!productData || !productData.variants) return null;
    var input = getVariantIdInput();
    var id = input ? String(input.value) : '';
    for (var i = 0; i < productData.variants.length; i++) {
      if (String(productData.variants[i].id) === id) return productData.variants[i];
    }
    return productData.variants[0] || null;
  }

  function getPickerSelections() {
    var out = {};

    document.querySelectorAll('variant-picker fieldset.variant-option').forEach(function (fs) {
      var legend = fs.querySelector('legend');
      var name = legend ? legend.textContent.trim() : '';
      var checked = fs.querySelector('input:checked, input[checked]');
      if (name && checked) out[name] = checked.value;
    });

    document.querySelectorAll('variant-picker select').forEach(function (sel) {
      var wrap = sel.closest('fieldset.variant-option, .variant-option, .product-form__input');
      var name = '';
      if (wrap) {
        var leg = wrap.querySelector('legend, label');
        if (leg) name = leg.textContent.trim();
      }
      if (!name && sel.name) {
        name = sel.name.replace(/^options\[|\]$/g, '');
      }
      if (name && sel.value) out[name] = sel.value;
    });

    document.querySelectorAll('select[name^="options["]').forEach(function (sel) {
      var name = sel.name.replace(/^options\[|\]$/g, '');
      if (name && sel.value) out[name] = sel.value;
    });

    return out;
  }

  function applyFromPickerSelections() {
    var picked = getPickerSelections();
    Object.keys(picked).forEach(function (name) {
      applyOptionByName(name, picked[name]);
    });
  }

  function applyFromVariantObject(variant) {
    if (!variant || !productData) return;
    var options = productData.options || [];
    var vals = [variant.option1, variant.option2, variant.option3];
    for (var i = 0; i < options.length; i++) {
      applyOptionByName(options[i], vals[i]);
    }
  }

  function variantImageUrl(variant) {
    if (!variant) return IMG;
    if (variant.featured_image && variant.featured_image.src) {
      return normalizeSrc(variant.featured_image.src);
    }
    if (variant.featured_media && variant.featured_media.preview_image && variant.featured_media.preview_image.src) {
      return normalizeSrc(variant.featured_media.preview_image.src);
    }
    return IMG;
  }

  function syncCanvasFromVariants() {
    applyFromPickerSelections();

    var variant = getCurrentVariant();
    if (variant) {
      applyFromVariantObject(variant);
    }

    renderPreview();

    if (variant) {
      var nextUrl = variantImageUrl(variant);
      if (nextUrl && nextUrl !== loadedImageUrl) {
        loadProductImage(nextUrl);
      }
    }
  }

  function onImageReady() {
    if (productImage.naturalWidth > 0) {
      productRatio = productImage.naturalHeight / productImage.naturalWidth;
      imageReady = true;
    }
    drawCanvas();
  }

  function loadProductImage(src) {
    var full = normalizeSrc(src) || IMG;
    if (!full) return;

    if (full === loadedImageUrl && imageReady && productImage.complete) {
      drawCanvas();
      return;
    }

    loadedImageUrl = full;
    productImage.onload = onImageReady;
    productImage.onerror = function () {
      if (full !== IMG) {
        loadProductImage(IMG);
      }
    };
    productImage.src = full;

    if (productImage.complete && productImage.naturalWidth) {
      onImageReady();
    }
  }

  function drawCanvas() {
    if (!els.canvas || !els.canvasStage) return;
    if (!imageReady || !productImage.naturalWidth) return;

    var rect = els.canvasStage.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = rect.width;
    var ch = rect.height;

    els.canvas.width = Math.round(cw * dpr);
    els.canvas.height = Math.round(ch * dpr);
    els.canvas.style.width = cw + 'px';
    els.canvas.style.height = ch + 'px';

    var ctx = els.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);

    var ratio = getProductRatio();
    var posterW = cw * 0.72 * (state.sizeScale || 1);
    var posterH = posterW * ratio;

    if (posterH > ch * 0.82) {
      posterH = ch * 0.82;
      posterW = posterH / ratio;
    }
    if (posterW > cw * 0.88) {
      posterW = cw * 0.88;
      posterH = posterW * ratio;
    }

    var hasFrame = state.frameType === 'frame' && state.frameColor;
    var matPx = state.matting ? Math.max(10, posterW * 0.06) : 0;
    var framePx = hasFrame ? Math.max(5, posterW * 0.02) : 0;
    var totalW = posterW + (matPx + framePx) * 2;
    var totalH = posterH + (matPx + framePx) * 2;
    var x = (cw - totalW) / 2;
    var y = (ch - totalH) / 2;

    if (state.floatShadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.32)';
      ctx.shadowBlur = 22;
      ctx.shadowOffsetY = 10;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, totalW, totalH);
      ctx.restore();
    }

    if (matPx > 0) {
      ctx.fillStyle = '#f8f6f0';
      ctx.fillRect(x, y, totalW, totalH);
    }
    if (hasFrame) {
      ctx.fillStyle = state.frameColor;
      ctx.fillRect(x, y, totalW, totalH);
    }

    try {
      ctx.drawImage(productImage, x + matPx + framePx, y + matPx + framePx, posterW, posterH);
    } catch (err) {
      console.warn('[Poster Studio] drawImage failed', err);
    }

    if (els.sizeLabel) {
      els.sizeLabel.textContent = state.sizeLabel || '';
      els.sizeLabel.hidden = !state.sizeLabel;
    }
  }

  function renderPreview() {
    drawCanvas();
    if (els.canvasTilt) {
      els.canvasTilt.style.transform =
        'perspective(900px) rotateY(' + state.hoverTiltY + 'deg) rotateX(' + state.hoverTiltX + 'deg)';
    }
  }

  function onThemeVariantEvent(e) {
    var variant = e && e.detail && e.detail.variant;
    if (variant) {
      applyFromVariantObject(variant);
      var nextUrl = variantImageUrl(variant);
      if (nextUrl && nextUrl !== loadedImageUrl) {
        loadProductImage(nextUrl);
      }
    }
    applyFromPickerSelections();
    renderPreview();
  }

  function scheduleSync() {
    syncCanvasFromVariants();
    window.setTimeout(syncCanvasFromVariants, 0);
    window.setTimeout(syncCanvasFromVariants, 60);
    window.setTimeout(syncCanvasFromVariants, 180);
  }

  function bindHoverTilt(stage) {
    if (!stage) return;

    function setTilt(clientX, clientY) {
      var rect = stage.getBoundingClientRect();
      var x = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      var y = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
      state.hoverTiltY = (x - 0.5) * TILT_MAX_Y * 2;
      state.hoverTiltX = (0.5 - y) * TILT_MAX_X * 2;
      renderPreview();
    }

    function resetTilt() {
      state.hoverTiltX = 0;
      state.hoverTiltY = 0;
      renderPreview();
    }

    stage.addEventListener('mousemove', function (e) { setTilt(e.clientX, e.clientY); });
    stage.addEventListener('mouseleave', resetTilt);
    stage.addEventListener('touchmove', function (e) {
      if (e.touches.length) setTilt(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    stage.addEventListener('touchend', resetTilt);
  }

  function findGallery() {
    return document.querySelector('[data-testid="product-information-media"] media-gallery') ||
      document.querySelector('.product-information__media media-gallery') ||
      document.querySelector('.product-information__media');
  }

  function bindVariantInputs() {
    document.querySelectorAll('variant-picker input, variant-picker select').forEach(function (el) {
      if (el.dataset.psBound) return;
      el.dataset.psBound = '1';
      el.addEventListener('change', scheduleSync);
      el.addEventListener('input', scheduleSync);
      el.addEventListener('click', scheduleSync);
    });
  }

  function watchVariantIdInput() {
    var idInput = getVariantIdInput();
    if (!idInput) return;

    lastVariantId = idInput.value;
    idInput.addEventListener('change', scheduleSync);
    idInput.addEventListener('input', scheduleSync);

    if (pickerWatchId) window.clearInterval(pickerWatchId);
    pickerWatchId = window.setInterval(function () {
      if (idInput.value !== lastVariantId) {
        lastVariantId = idInput.value;
        syncCanvasFromVariants();
      }
    }, 150);
  }

  function observePickers() {
    document.querySelectorAll('variant-picker').forEach(function (picker) {
      new MutationObserver(function () {
        bindVariantInputs();
        scheduleSync();
      }).observe(picker, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['checked', 'class', 'value']
      });
    });
  }

  function bindVariantPicker() {
    document.addEventListener('variant:update', onThemeVariantEvent);
    document.addEventListener('variant:change', onThemeVariantEvent);

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('variant-picker') ||
          t.name === 'id' ||
          (t.name && t.name.indexOf('options') === 0) ||
          t.closest('.variant-option') ||
          t.closest('variant-selects')) {
        scheduleSync();
      }
    }, true);

    document.addEventListener('click', function (e) {
      if (e.target.closest('.variant-option__button-label') ||
          e.target.closest('fieldset.variant-option label') ||
          e.target.closest('.variant-option') ||
          e.target.closest('variant-picker')) {
        scheduleSync();
      }
    }, true);

    bindVariantInputs();
    observePickers();
    watchVariantIdInput();
  }

  function mountCanvasOnGallery(gallery) {
    var mediaCol = gallery.closest('.product-information__media') ||
      document.querySelector('[data-testid="product-information-media"]');
    if (mediaCol) mediaCol.classList.add('ps-enhanced');
    gallery.classList.add('ps-enhanced');

    var overlay = document.createElement('div');
    overlay.className = 'ps-gallery-overlay';
    overlay.innerHTML =
      '<div class="ps-canvas-stage" id="ps-canvas-stage">' +
        '<div class="ps-canvas-tilt" id="ps-canvas-tilt">' +
          '<span class="ps-preview-size-label" id="ps-size-label" hidden></span>' +
          '<canvas id="ps-product-canvas" aria-label="' + TITLE + ' preview"></canvas>' +
        '</div>' +
      '</div>';

    gallery.insertBefore(overlay, gallery.firstChild);

    els.canvasStage = document.getElementById('ps-canvas-stage');
    els.canvasTilt  = document.getElementById('ps-canvas-tilt');
    els.canvas      = document.getElementById('ps-product-canvas');
    els.sizeLabel   = document.getElementById('ps-size-label');

    bindHoverTilt(els.canvasStage);

    if (window.ResizeObserver) {
      new ResizeObserver(function () { drawCanvas(); }).observe(els.canvasStage);
    }

    bindVariantPicker();
    syncCanvasFromVariants();

    var variant = getCurrentVariant();
    loadProductImage(variantImageUrl(variant));
  }

  function init() {
    var gallery = findGallery();
    if (!gallery) {
      window.setTimeout(init, 200);
      return;
    }
    mountCanvasOnGallery(gallery);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
