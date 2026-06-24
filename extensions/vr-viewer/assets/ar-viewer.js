(function () {
  'use strict';

  var root = document.getElementById('ar-root');
  if (!root) return;

  function removeArViewerDom() {
    root.remove();
    ['ar-rooms-data', 'ar-fab', 'ar-room', 'ar-splash'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function getAppProxyBase() {
    var base = (root.dataset.backend || '').replace(/\/$/, '');
    return base || '/apps/ar-preview';
  }

  var backendPreview = getAppProxyBase();
  var productId = root.dataset.productId || '';
  var arImageSettings = {
    imageMode: 'default',
    imageAlt: '',
    imageUrl: '',
    imageThumb: ''
  };

  function continueInit() {

    var TITLE = root.dataset.title || 'Product';
    var IMG = root.dataset.img || '';
    var IMG_THUMB = root.dataset.imgThumb || '';
    var IMG_W = parseFloat(root.dataset.imgW || '0');
    var IMG_H = parseFloat(root.dataset.imgH || '0');
    var BACKEND = getAppProxyBase();
    var WIDTH_CM = parseFloat(root.dataset.width || '60');
    var HEIGHT_CM = parseFloat(root.dataset.height || '40');
    var PAGE_URL = window.location.href;
    var LIVE_PREVIEW_ICON = root.dataset.livePreviewIcon || '';
    var AR_REOPEN_KEY = 'ar-preview-reopen-modal';

    function livePreviewIconHtml(cls) {
      if (!LIVE_PREVIEW_ICON) return '';
      return '<img class="' + (cls || 'ar-fab-icon') + '" src="' + LIVE_PREVIEW_ICON + '" alt="" width="22" height="22" aria-hidden="true"/>';
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
    var PRODUCT_ONLY_PREVIEW = true;

    var ua = navigator.userAgent || '';
    var isIOS = /iphone|ipad|ipod/i.test(ua);
    var isAndroid = /android/i.test(ua);
    var isMobile = isIOS || isAndroid;

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

    var SIZE_PRESETS_FALLBACK = [
      { label: 'A4', w: 21, h: 30, value: 'A4: 21x30 cm' },
      { label: 'A3', w: 30, h: 42, value: 'A3: 30x42 cm' },
      { label: 'A2', w: 42, h: 60, value: 'A2: 42x60 cm' },
      { label: 'A1', w: 60, h: 84, value: 'A1: 60x84 cm' },
      { label: 'B1', w: 70, h: 100, value: 'B1: 70x100 cm' },
      { label: 'A0', w: 84, h: 119, value: 'A0: 84x119 cm' },
      { label: 'B0', w: 100, h: 141, value: 'B0: 100x141 cm' }
    ];

    var FRAME_COLORS_FALLBACK = [
      { id: 'none', color: 'transparent', label: 'None', value: 'None' },
      { id: 'natural-timber', color: '#c4a574', label: 'Natural Timber', value: 'Natural Timber' },
      { id: 'white', color: '#f5f5f0', label: 'White Frame', value: 'White Frame' },
      { id: 'black', color: '#1a1a1a', label: 'Black Frame', value: 'Black Frame' }
    ];

    var BORDER_OPTIONS_FALLBACK = [
      { mat: 'none', label: 'NO BORDER', value: 'No Border' },
      { mat: '1', label: 'WITH WHITE BORDER', value: 'With White Border' }
    ];

    var FRAME_MOCKUPS = {
      'natural-timber': {
        portrait: {
          src: 'https://stylemywall.com.au/cdn/shop/files/A_oak_thin_frame_1_400x500.png?v=1767117668',
          width: 360,
          height: 500,
          window: { top: 0.018, left: 0.0278, right: 0.0278, bottom: 0.02 },
          matInOverlay: false,
          matPct: 0.052
        },
        landscape: {
          src: 'https://stylemywall.com.au/cdn/shop/files/FINAL_PDP_frame_mockup_-_landscape_A_natural_-_Copy_400x500.png?v=1767118551',
          width: 400,
          height: 291,
          window: { top: 0.0378, left: 0.0275, right: 0.0275, bottom: 0.0412 },
          matInOverlay: false,
          matPct: 0.052
        }
      },
      white: {
        portrait: {
          src: 'https://stylemywall.com.au/cdn/shop/files/Group_5_400x500.png?v=1720160668',
          width: 355,
          height: 500,
          window: { top: 0.018, left: 0.0254, right: 0.0254, bottom: 0.018 },
          matInOverlay: true,
          matPct: 0.045
        },
        landscape: {
          src: 'https://stylemywall.com.au/cdn/shop/files/Group_11_400x500.png?v=1720164024',
          width: 400,
          height: 284,
          window: { top: 0.0246, left: 0.0175, right: 0.0175, bottom: 0.0246 },
          matInOverlay: true,
          matPct: 0.045
        }
      },
      black: {
        portrait: {
          src: 'https://stylemywall.com.au/cdn/shop/files/Group_6_400x500.png?v=1720160746',
          width: 355,
          height: 500,
          window: { top: 0.018, left: 0.0254, right: 0.0254, bottom: 0.018 },
          matInOverlay: true,
          matPct: 0.045
        },
        landscape: {
          src: 'https://stylemywall.com.au/cdn/shop/files/Group_12_400x500.png?v=1720163955',
          width: 400,
          height: 284,
          window: { top: 0.0246, left: 0.0175, right: 0.0175, bottom: 0.0246 },
          matInOverlay: true,
          matPct: 0.045
        }
      }
    };

    var frameMockupCache = {};

    function preloadFrameMockups() {
      Object.keys(FRAME_MOCKUPS).forEach(function (frameId) {
        ['portrait', 'landscape'].forEach(function (key) {
          var mockup = FRAME_MOCKUPS[frameId][key];
          if (!mockup || frameMockupCache[mockup.src]) return;
          var img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = function () { frameMockupCache[mockup.src] = img; };
          img.onerror = function () { };
          img.src = mockup.src;
        });
      });
    }
    preloadFrameMockups();

    function productOrientation() {
      return getProductRatio() >= 1 ? 'portrait' : 'landscape';
    }

    function usesFrameMockup() {
      return !!(FRAME_MOCKUPS[state.frameId]);
    }

    function getFrameMockupConfig() {
      if (!usesFrameMockup()) return null;
      var set = FRAME_MOCKUPS[state.frameId];
      return set[productOrientation()] || set.portrait;
    }

    function mockupMatPadding(mockup, hasMat, winW, winH) {
      if (!hasMat || !mockup) return 0;
      var pct = mockup.matPct || (mockup.matInOverlay ? 0.045 : 0.052);
      return Math.max(6, Math.round(Math.min(winW, winH) * pct));
    }

    function frameMockupAspect(mockup) {
      return mockup.width / mockup.height;
    }

    var productData = null;
    var PRODUCT_SIZES = null;
    var PRODUCT_FRAMES = null;
    var PRODUCT_BORDERS = null;
    var VARIANT_META = { size: null, frame: null, border: null };
    var SIZE_MIN = 0.5;
    var SIZE_MAX = 1.5;

    function getSizePresets() {
      return PRODUCT_SIZES || SIZE_PRESETS_FALLBACK;
    }

    function getFrameOptions() {
      return PRODUCT_FRAMES || FRAME_COLORS_FALLBACK;
    }

    function getBorderOptions() {
      return PRODUCT_BORDERS || BORDER_OPTIONS_FALLBACK;
    }

    function normOptName(name) {
      return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    function legendOptionName(text) {
      var t = String(text || '').trim().replace(/:$/, '');
      var colon = t.indexOf(':');
      if (colon > 0) t = t.substring(0, colon).trim();
      return normOptName(t);
    }

    function optionNamesMatch(a, b) {
      return legendOptionName(a) === legendOptionName(b);
    }

    function resolveOptionName(raw) {
      if (!raw) return '';
      var trimmed = String(raw).trim().replace(/:$/, '');
      var colon = trimmed.indexOf(':');
      if (colon > 0) trimmed = trimmed.substring(0, colon).trim();
      if (productData && productData.options) {
        var norm = normOptName(trimmed);
        for (var i = 0; i < productData.options.length; i++) {
          if (normOptName(productData.options[i]) === norm) return productData.options[i];
        }
      }
      return trimmed;
    }

    function escapeHtml(str) {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function parseSizeValue(str) {
      var s = String(str || '').trim();
      var dimMatch = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
      var codeMatch = s.match(/^([A-Za-z0-9]+)/);
      var w = dimMatch ? parseFloat(dimMatch[1]) : WIDTH_CM;
      var h = dimMatch ? parseFloat(dimMatch[2]) : HEIGHT_CM;
      var label = codeMatch ? codeMatch[1] : s;
      return { label: label, value: s, display: s, w: w, h: h };
    }

    function parseFrameId(str) {
      var s = String(str || '').toLowerCase().trim();
      if (!s || /unfram|no frame|^none|tube|rolled|canvas/i.test(s)) return 'none';
      if (/natural|timber|wood|oak/i.test(s)) return 'natural-timber';
      if (/white/i.test(s)) return 'white';
      if (/black/i.test(s)) return 'black';
      return 'natural-timber';
    }

    function frameColorForId(id) {
      var frames = getFrameOptions();
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].id === id) return frames[i].color || 'transparent';
      }
      return 'transparent';
    }

    function parseBorderMat(str) {
      var s = String(str || '').toLowerCase();
      if (/no border|noborder|without border|without white/i.test(s)) return 'none';
      if (/white border|with white|with border/i.test(s)) return '1';
      return 'none';
    }

    function borderLabelForMat(mat) {
      var opts = getBorderOptions();
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].mat === mat) return opts[i].label;
      }
      return mat === '1' ? 'WITH WHITE BORDER' : 'NO BORDER';
    }

    function uniqueOptionValues(optionIndex) {
      var seen = {};
      var vals = [];
      if (!productData || !productData.variants) return vals;
      productData.variants.forEach(function (v) {
        var val = [v.option1, v.option2, v.option3][optionIndex];
        if (val && !seen[val]) {
          seen[val] = true;
          vals.push(val);
        }
      });
      return vals;
    }

    function identifyVariantOptions() {
      VARIANT_META = { size: null, frame: null, border: null };
      if (!productData || !productData.options) return;
      productData.options.forEach(function (name, idx) {
        var n = normOptName(name);
        if (/size|dimension|format/.test(n)) {
          VARIANT_META.size = { index: idx, name: name };
        } else if (/border/.test(n)) {
          VARIANT_META.border = { index: idx, name: name };
        } else if (/frame|mount|style|finish|print/.test(n)) {
          VARIANT_META.frame = { index: idx, name: name };
        }
      });
    }

    function findOptionFieldset(optionName) {
      if (!optionName) return null;
      var nodes = document.querySelectorAll(
        'fieldset, .product-form__input, variant-picker fieldset, variant-selects fieldset, ' +
        '.variant-input-wrap, .variant-wrapper, .product-form__item'
      );
      var i, node, leg;
      for (i = 0; i < nodes.length; i++) {
        node = nodes[i];
        leg = node.querySelector('legend, .form__label, label.form__label, .variant-form__label');
        if (leg && optionNamesMatch(leg.textContent, optionName)) return node;
        if (node.dataset.optionName && optionNamesMatch(node.dataset.optionName, optionName)) return node;
      }
      if (productData && productData.options) {
        for (i = 0; i < productData.options.length; i++) {
          if (!optionNamesMatch(productData.options[i], optionName)) continue;
          var byIdx = document.querySelector(
            '.variant-input-wrap[data-index="' + i + '"], .variant-wrapper[data-index="' + i + '"], ' +
            '.product-form__item[data-index="' + i + '"]'
          );
          if (byIdx) return byIdx;
        }
      }
      return null;
    }

    function pickValue(el) {
      if (!el) return '';
      if (el.value) return el.value;
      if (el.dataset.value) return el.dataset.value;
      if (el.dataset.optionValue) return el.dataset.optionValue;
      return (el.textContent || '').trim();
    }

    function enrichFramesFromDom(frames) {
      if (!VARIANT_META.frame) return frames;
      var fs = findOptionFieldset(VARIANT_META.frame.name);
      if (!fs) return frames;
      return frames.map(function (f) {
        var copy = Object.assign({}, f);
        var input = fs.querySelector('input[value="' + f.value.replace(/"/g, '\\"') + '"]');
        if (!input) {
          fs.querySelectorAll('input[type="radio"], input').forEach(function (inp) {
            if (inp.value === f.value) input = inp;
          });
        }
        if (!input) return copy;
        var label = input.closest('label') || fs.querySelector('label[for="' + input.id + '"]');
        if (label) {
          var img = label.querySelector('img');
          if (img && img.src) copy.image = img.src;
        }
        return copy;
      });
    }

    function valuesForOption(meta) {
      if (!meta || !productData) return null;
      var vals = null;
      if (productData.options_with_values) {
        productData.options_with_values.forEach(function (ow) {
          if (optionNamesMatch(ow.name, meta.name) && ow.values && ow.values.length) {
            vals = ow.values;
          }
        });
      }
      if (!vals || !vals.length) vals = uniqueOptionValues(meta.index);
      return vals && vals.length ? vals : null;
    }

    function buildProductVariantOptions() {
      identifyVariantOptions();

      if (VARIANT_META.size) {
        var sizeVals = valuesForOption(VARIANT_META.size);
        if (sizeVals) PRODUCT_SIZES = sizeVals.map(parseSizeValue);
      }
      if (!PRODUCT_SIZES || !PRODUCT_SIZES.length) PRODUCT_SIZES = null;

      if (VARIANT_META.frame) {
        var frameVals = valuesForOption(VARIANT_META.frame);
        if (frameVals) {
          PRODUCT_FRAMES = frameVals.map(function (val) {
            var id = parseFrameId(val);
            return {
              id: id,
              color: frameColorForId(id) !== 'transparent' ? frameColorForId(id) : (
                id === 'white' ? '#f5f5f0' : id === 'black' ? '#1a1a1a' : id === 'none' ? 'transparent' : '#c4a574'
              ),
              label: val,
              value: val
            };
          });
          PRODUCT_FRAMES = enrichFramesFromDom(PRODUCT_FRAMES);
        }
      }
      if (!PRODUCT_FRAMES || !PRODUCT_FRAMES.length) PRODUCT_FRAMES = null;

      if (VARIANT_META.border) {
        var borderVals = valuesForOption(VARIANT_META.border);
        if (borderVals) {
          PRODUCT_BORDERS = borderVals.map(function (val) {
            return {
              mat: parseBorderMat(val),
              label: String(val).toUpperCase(),
              value: val
            };
          });
        }
      }
      if (!PRODUCT_BORDERS || !PRODUCT_BORDERS.length) PRODUCT_BORDERS = null;

      refreshSizeBounds();
    }

    function initProductVariants() {
      var el = document.getElementById('ar-product-data');
      if (!el) return;
      try {
        productData = JSON.parse(el.textContent);
      } catch (e) {
        productData = null;
        return;
      }
      buildProductVariantOptions();
    }

    function varIdInput() {
      return document.querySelector('product-form input[name="id"]') ||
        document.querySelector('product-form select[name="id"]') ||
        document.querySelector('form[action*="/cart/add"] input[name="id"]') ||
        document.querySelector('form[action*="/cart/add"] select[name="id"]') ||
        document.querySelector('input.product-variant-id[name="id"]') ||
        document.querySelector('input[name="id"]') ||
        document.querySelector('select[name="id"]');
    }

    function productJsonSelectedVariantId() {
      var scripts = document.querySelectorAll(
        'script[id^="ProductJson-"], script[type="application/json"][data-product-json]'
      );
      var i, node, data;
      for (i = 0; i < scripts.length; i++) {
        node = scripts[i];
        try {
          data = JSON.parse(node.textContent);
        } catch (e) {
          continue;
        }
        if (data && data.selected_or_first_available_variant && data.selected_or_first_available_variant.id) {
          return String(data.selected_or_first_available_variant.id);
        }
      }
      return '';
    }

    function currentVariantId() {
      var inp = varIdInput();
      if (inp && inp.value) return String(inp.value);
      return productJsonSelectedVariantId();
    }

    function findVariantByPicker(picker) {
      if (!productData || !productData.variants || !picker) return null;
      var opts = productData.options || [];
      var keys = Object.keys(picker);
      if (!keys.length) return null;

      var best = null;
      var bestScore = -1;
      productData.variants.forEach(function (v) {
        var score = 0;
        opts.forEach(function (name, i) {
          var picked = picker[name];
          var val = [v.option1, v.option2, v.option3][i];
          if (!picked || !val) return;
          if (normOptVal(picked) === normOptVal(val)) score++;
        });
        if (score > bestScore) {
          bestScore = score;
          best = v;
        }
      });
      return bestScore > 0 ? best : null;
    }

    function resolveCurrentVariant() {
      if (!productData || !productData.variants) return null;
      var id = currentVariantId();
      var i;
      if (id) {
        for (i = 0; i < productData.variants.length; i++) {
          if (String(productData.variants[i].id) === id) return productData.variants[i];
        }
      }
      var picker = readPicker();
      var fromPicker = findVariantByPicker(picker);
      if (fromPicker) return fromPicker;
      return productData.variants[0] || null;
    }

    function currentVariant() {
      return resolveCurrentVariant();
    }

    function normOptVal(s) {
      return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/×/g, 'x');
    }

    function readPicker() {
      var out = {};

      document.querySelectorAll('input[type="radio"][name^="options["]:checked').forEach(function (inp) {
        var name = resolveOptionName(inp.name.replace(/^options\[|\]$/g, ''));
        if (name && inp.value) out[name] = inp.value;
      });

      document.querySelectorAll(
        'variant-picker fieldset, variant-selects fieldset, fieldset.variant-option, ' +
        '.product-form__input--pill, .product-form__input, .variant-input-wrap'
      ).forEach(function (fs) {
        var leg = fs.querySelector('legend, .form__label, label.form__label, .variant-form__label');
        var name = leg ? resolveOptionName(leg.textContent) : '';
        if (!name && fs.dataset.optionName) name = resolveOptionName(fs.dataset.optionName);
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
        '.variant-input-wrap[data-index], .variant-wrapper[data-index], .product-form__item[data-index]'
      ).forEach(function (wrap) {
        var idx = parseInt(wrap.dataset.index, 10);
        if (isNaN(idx) || !productData || !productData.options || !productData.options[idx]) return;
        var optName = productData.options[idx];
        if (out[optName]) return;

        var chk = wrap.querySelector('input[type="radio"]:checked, input:checked');
        if (chk && chk.value) { out[optName] = chk.value; return; }

        var selected = wrap.querySelector(
          '.variant-input--selected, .variant-input.selected, label.active, ' +
          '.variant-button-wrap--selected, [data-selected="true"], .variant-input-wrap--selected'
        );
        if (selected) {
          var inp = selected.tagName === 'INPUT' ? selected : selected.querySelector('input[type="radio"], input');
          if (inp && inp.value) { out[optName] = inp.value; return; }
          var dv = selected.dataset.value || selected.dataset.optionValue;
          if (dv) { out[optName] = dv; }
        }
      });

      document.querySelectorAll(
        'select.single-option-selector, select[name^="options["], .product-form__input select'
      ).forEach(function (sel) {
        if (!sel.value) return;
        var name = '';
        if (sel.name) name = resolveOptionName(sel.name.replace(/^options\[|\]$/g, ''));
        if (!name) {
          var wrap = sel.closest('.variant-input-wrap, .product-form__item, .variant-wrapper, .product-form__input');
          if (wrap && wrap.dataset.index != null && productData && productData.options) {
            name = productData.options[parseInt(wrap.dataset.index, 10)] || '';
          }
        }
        if (!name || out[name]) return;
        var opt = sel.options[sel.selectedIndex];
        out[name] = opt ? (opt.text || opt.value).trim() : sel.value;
      });

      if (productData && productData.options) {
        productData.options.forEach(function (optName, i) {
          if (out[optName]) return;
          var chk = document.querySelector('input[name="options[' + i + ']"]:checked');
          if (chk && chk.value) { out[optName] = chk.value; return; }
          var selByIdx = document.querySelector('select[name="options[' + i + ']"]');
          if (selByIdx && selByIdx.value) {
            var optIdx = selByIdx.options[selByIdx.selectedIndex];
            out[optName] = optIdx ? (optIdx.text || selByIdx.value).trim() : selByIdx.value;
          }
        });
      }

      document.querySelectorAll('.variant-input input[type="radio"]:checked').forEach(function (inp) {
        var wrap = inp.closest('.variant-input-wrap[data-index], .variant-wrapper[data-index], .product-form__item[data-index]');
        if (!wrap || !productData || !productData.options) return;
        var idx = parseInt(wrap.dataset.index, 10);
        var optName = productData.options[idx];
        if (optName && inp.value) out[optName] = inp.value;
      });

      return out;
    }

    function pickerSig() {
      return JSON.stringify(readPicker()) + '|' + currentVariantId();
    }

    function findSizeIndexByValue(val) {
      var presets = getSizePresets();
      var norm = normOptVal(val);
      var i;
      for (i = 0; i < presets.length; i++) {
        if (presets[i].value === val) return i;
        if (normOptVal(presets[i].value) === norm) return i;
        if (normOptVal(presets[i].display) === norm) return i;
        if (normOptVal(presets[i].label) === norm) return i;
      }
      var parsed = parseSizeValue(val);
      var best = 0;
      var bestDiff = Infinity;
      for (i = 0; i < presets.length; i++) {
        var d = Math.abs(presets[i].w - parsed.w);
        if (d < bestDiff) { bestDiff = d; best = i; }
      }
      return best;
    }

    function applyOptionToState(name, val) {
      if (!val) return;
      var n = normOptName(name);
      if (VARIANT_META.size && optionNamesMatch(name, VARIANT_META.size.name)) {
        state.sizeIndex = findSizeIndexByValue(val);
        state.sizeScale = presetScale(getSizePresets()[state.sizeIndex]);
        state.spaceWidth = cmToDisplayUnit(getSizePresets()[state.sizeIndex].w, state.unit);
        return;
      }
      if (VARIANT_META.border && optionNamesMatch(name, VARIANT_META.border.name)) {
        state.borderValue = val;
        state.matting = parseBorderMat(val);
        if (state.frameId === 'none') state.matting = 'none';
        return;
      }
      if (VARIANT_META.frame && optionNamesMatch(name, VARIANT_META.frame.name)) {
        state.frameValue = val;
        state.frameId = parseFrameId(val);
        if (state.frameId === 'none') state.matting = 'none';
        return;
      }
      if (/size|dimension|format/.test(n)) {
        state.sizeIndex = findSizeIndexByValue(val);
        state.sizeScale = presetScale(getSizePresets()[state.sizeIndex]);
        state.spaceWidth = cmToDisplayUnit(getSizePresets()[state.sizeIndex].w, state.unit);
      } else if (/border/.test(n)) {
        state.borderValue = val;
        state.matting = parseBorderMat(val);
        if (state.frameId === 'none') state.matting = 'none';
      } else if (/frame|mount|style|finish|print/.test(n)) {
        state.frameValue = val;
        state.frameId = parseFrameId(val);
        if (state.frameId === 'none') state.matting = 'none';
      }
    }

    function findProductImageByAlt(alt) {
      if (!alt || !productData || !productData.images || !productData.images.length) return null;
      var target = String(alt).trim().toLowerCase();
      for (var i = 0; i < productData.images.length; i++) {
        var image = productData.images[i];
        if (String(image.alt || '').trim().toLowerCase() === target) return image;
      }
      return null;
    }

    function refreshArImageFromSettings() {
      if (
        !arImageSettings ||
        arImageSettings.imageMode !== 'specific' ||
        !String(arImageSettings.imageAlt || '').trim()
      ) {
        return false;
      }

      var matched = findProductImageByAlt(arImageSettings.imageAlt);
      var url = '';
      var thumb = '';
      var width = 0;
      var height = 0;

      if (matched) {
        url = matched.src || '';
        thumb = matched.thumb || matched.src || '';
        width = matched.width || 0;
        height = matched.height || 0;
      } else if (arImageSettings.imageUrl) {
        url = arImageSettings.imageUrl;
        thumb = arImageSettings.imageThumb || arImageSettings.imageUrl;
      }

      url = toSecureUrl(url);
      if (!url) return false;

      IMG = url;
      IMG_THUMB = toSecureUrl(thumb || url);
      if (width > 0) IMG_W = width;
      if (height > 0) IMG_H = height;
      if (IMG_W > 0 && IMG_H > 0) productRatio = IMG_H / IMG_W;
      return true;
    }

    function applyVariantImage(variant) {
      if (refreshArImageFromSettings()) return;
      if (!variant || !variant.featured_image || !variant.featured_image.src) return;
      var src = variant.featured_image.src;
      if (src.indexOf('//') === 0) src = 'https:' + src;
      IMG = src;
      if (variant.featured_image.width) IMG_W = variant.featured_image.width;
      if (variant.featured_image.height) IMG_H = variant.featured_image.height;
      if (IMG_W > 0 && IMG_H > 0) productRatio = IMG_H / IMG_W;
    }

    function applyVariantToState(variant) {
      if (!variant || !productData) return;
      var opts = productData.options || [];
      [variant.option1, variant.option2, variant.option3].forEach(function (val, i) {
        if (opts[i] && val) applyOptionToState(opts[i], val);
      });
      applyVariantImage(variant);
    }

    function syncFromProductPage() {
      buildProductVariantOptions();
      var variant = resolveCurrentVariant();
      if (variant) applyVariantToState(variant);
      var picker = readPicker();
      Object.keys(picker).forEach(function (k) {
        applyOptionToState(k, picker[k]);
      });
      if (!variant && picker && Object.keys(picker).length) {
        var matched = findVariantByPicker(picker);
        if (matched) applyVariantToState(matched);
      }
      refreshArImageFromSettings();
    }

    function applySyncedPreviewToModal() {
      syncFromProductPage();
      var img = document.getElementById('ar-product-img');
      if (img && IMG) {
        if (img.getAttribute('src') !== IMG) img.setAttribute('src', IMG);
      }
      var panel = document.getElementById('ar-customize-panel');
      if (panel) {
        panel.innerHTML = buildCustomizePanelHtml();
        bindCustomizePanelEvents();
      }
      var sizeEl = document.getElementById('ar-size');
      if (sizeEl) sizeEl.value = String(state.sizeIndex);
      syncCustomizeFrameUI();
      renderViewport();
    }

    function refreshCustomizePanel() {
      var panel = document.getElementById('ar-customize-panel');
      if (!panel) return;
      syncFromProductPage();
      panel.innerHTML = buildCustomizePanelHtml();
      bindCustomizePanelEvents();
      var img = document.getElementById('ar-product-img');
      if (img && IMG) img.src = IMG;
      syncPanelUI();
      renderViewport();
    }

    function refreshCustomizePanelUI() {
      var sizeEl = document.getElementById('ar-size');
      if (sizeEl) sizeEl.value = String(state.sizeIndex);
      syncCustomizeFrameUI();
      var img = document.getElementById('ar-product-img');
      if (img && IMG) img.src = IMG;
    }

    function presetScale(p) {
      return WIDTH_CM > 0 ? p.w / WIDTH_CM : 1;
    }

    function defaultSizeIndex() {
      var presets = getSizePresets();
      var best = 0;
      var bestDiff = Infinity;
      presets.forEach(function (p, i) {
        var d = Math.abs(p.w - WIDTH_CM);
        if (d < bestDiff) { bestDiff = d; best = i; }
      });
      return best;
    }

    function refreshSizeBounds() {
      var presets = getSizePresets();
      if (!presets.length) return;
      SIZE_MIN = presetScale(presets[0]);
      SIZE_MAX = presetScale(presets[presets.length - 1]);
    }

    initProductVariants();
    refreshArImageFromSettings();
    var DEFAULT_SIZE_INDEX = defaultSizeIndex();

    function activePresetRatio() {
      var p = getSizePresets()[state.sizeIndex] || getSizePresets()[DEFAULT_SIZE_INDEX];
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
      sizeScale: presetScale(getSizePresets()[DEFAULT_SIZE_INDEX]),
      angle: 0,
      level: 0,
      pitch: 0,
      spaceWidth: cmToDisplayUnit(getSizePresets()[DEFAULT_SIZE_INDEX].w, 'feet'),
      unit: 'feet',
      showFullBg: false,
      frameId: 'none',
      frameValue: '',
      matting: 'none',
      borderValue: '',
      wallTint: null,
      activePanel: null,
      fullWidth: false,
      paintId: DEFAULT_PAINT_ID,
      customPaintColor: null
    };

    function imgUrl(base, extra) {
      return base + (base.indexOf('?') >= 0 ? '&' : '?') + extra;
    }

    // ── Inject Live Preview CTA directly under main product image ────────────────
    function findMainPhotosNode() {
      var stickyCol = document.querySelector(
        '.product-single__sticky.grid__item, .grid__item.product-single__sticky, .product-single__sticky'
      );
      if (stickyCol) {
        var inSticky = stickyCol.querySelector('.product__main-photos, [data-product-single-media-group]');
        if (inSticky) return inSticky;
      }
      return document.querySelector('.product__main-photos, [data-product-single-media-group]');
    }

    function findProductMediaMountPoint() {
      var mainPhotos = findMainPhotosNode();
      if (mainPhotos) return { node: mainPhotos, mode: 'append' };

      var infoMedia = document.querySelector('.product-information__media');
      if (infoMedia) {
        var infoMain = infoMedia.querySelector(
          '.product__main-photos, [data-product-single-media-group], media-gallery, [data-product-media-gallery]'
        );
        if (infoMain) return { node: infoMain, mode: 'append' };
      }

      return findProductMediaMountFallback();
    }

    function findProductMediaMountFallback() {
      var mainPhotos = findMainPhotosNode();
      if (mainPhotos) return { node: mainPhotos, mode: 'append' };

      var slideshow = document.querySelector(
        '[data-product-photos].product-slideshow, .product-slideshow[id^="ProductPhotos"]'
      );
      if (slideshow) {
        var mainWrap = slideshow.closest('.product__main-photos, [data-product-single-media-group]');
        if (mainWrap) return { node: mainWrap, mode: 'append' };
        return { node: slideshow.parentNode || slideshow, mode: 'append' };
      }

      var selectors = [
        '[data-product-images]',
        '.product__photos',
        'media-gallery',
        'product-media-gallery',
        '.product__media-wrapper',
        '.product-media-container',
        '[data-product-media-gallery]',
        '.product__media-list',
        '.product-single__media',
        '.product-gallery',
        '.product-media-gallery'
      ];
      var i, el;
      for (i = 0; i < selectors.length; i++) {
        el = document.querySelector(selectors[i]);
        if (el) return { node: el, mode: 'append' };
      }

      var img = document.querySelector(
        '.product-main-slide img, .product-image-main img, .photoswipe__image, ' +
        '.product__media img, .product-media img, [data-product-media-type] img, ' +
        '.product-single__photo img, .product__modal-opener img, #ProductPhotoImg'
      );
      if (!img) return null;

      var slide = img.closest('.product__main-photos, .product-main-slide, .product-image-main');
      if (slide) {
        var photoColumn = slide.closest('.product__main-photos, [data-product-single-media-group]');
        if (photoColumn) return { node: photoColumn, mode: 'append' };
        return { node: slide, mode: 'after' };
      }

      var wrap = img.closest(
        '.product__media, .product-media, [data-product-media-type], ' +
        '.product-single__photo, .product__modal-opener, .product__media-item'
      );
      if (!wrap) return null;

      var gallery = wrap.closest(
        'media-gallery, .product__media-list, .product-gallery, .product__photos, [data-product-images]'
      );
      if (gallery) return { node: gallery, mode: 'append' };
      if (wrap.parentNode) return { node: wrap.parentNode, mode: 'append' };
      return null;
    }

    function findAddToCartForm() {
      var selectors = [
        'form[data-type="add-to-cart-form"]',
        'form.shopify-product-form',
        'form.product-single__form',
        'form[action*="/cart/add"]'
      ];
      var i, el;
      for (i = 0; i < selectors.length; i++) {
        el = document.querySelector(selectors[i]);
        if (el) return el;
      }
      return null;
    }

    var fabHtml =
      '<button id="ar-fab" class="ar-fab-inline ar-fab-under-media" aria-label="Live Preview">' +
      livePreviewIconHtml('ar-fab-icon') +
      '<span class="ar-fab-text">Live Preview</span>' +
      '</button>';

    var fabMountedInline = false;

    function bindFabClick() {
      var f = document.getElementById('ar-fab');
      if (!f || f.dataset.arBound) return;
      f.dataset.arBound = '1';
      f.addEventListener('click', openRoom);
    }

    function getOrCreateFabWrap() {
      var existing = document.querySelector('.ar-product-cta-under-media');
      if (existing && existing.querySelector('#ar-fab')) return existing;
      if (existing) existing.remove();

      var wrap = document.createElement('div');
      wrap.className = 'ar-product-cta ar-product-cta-under-media';
      wrap.innerHTML = fabHtml;
      return wrap;
    }

    function appendFabToNode(node, fabWrap) {
      if (!node || !fabWrap) return false;
      if (fabWrap.parentNode !== node) node.appendChild(fabWrap);
      return true;
    }

    function insertFabAfterNode(node, fabWrap) {
      if (!node || !fabWrap || !node.parentNode) return false;
      if (fabWrap.parentNode === node.parentNode && fabWrap.previousSibling === node) return true;
      if (node.nextSibling) {
        node.parentNode.insertBefore(fabWrap, node.nextSibling);
      } else {
        node.parentNode.appendChild(fabWrap);
      }
      return true;
    }

    function tryMountLivePreview() {
      var fabWrap = getOrCreateFabWrap();
      var mount = findProductMediaMountPoint();
      var ok = false;
      if (mount && mount.node) {
        ok = mount.mode === 'append'
          ? appendFabToNode(mount.node, fabWrap)
          : insertFabAfterNode(mount.node, fabWrap);
      }
      if (ok) bindFabClick();
      return ok;
    }

    function mountLivePreviewFallback() {
      if (findMainPhotosNode()) {
        tryMountLivePreview();
        return;
      }
      if (document.getElementById('ar-fab')) return;
      var addForm = findAddToCartForm();
      if (addForm && addForm.parentNode) {
        var fabWrapForm = document.createElement('div');
        fabWrapForm.className = 'ar-product-cta';
        fabWrapForm.innerHTML = fabHtml;
        addForm.parentNode.insertBefore(fabWrapForm, addForm);
        bindFabClick();
        return;
      }
      document.body.insertAdjacentHTML('beforeend',
        '<button id="ar-fab" aria-label="Live Preview">' + livePreviewIconHtml('ar-fab-icon') +
        '<span class="ar-fab-text">Live Preview</span></button>'
      );
      bindFabClick();
    }

    function ensureLivePreviewButton() {
      var mount = findProductMediaMountPoint();
      var fabWrap = getOrCreateFabWrap();

      if (mount && mount.node) {
        if (mount.mode === 'append') {
          appendFabToNode(mount.node, fabWrap);
        } else {
          insertFabAfterNode(mount.node, fabWrap);
        }
        bindFabClick();
        return;
      }

      if (!document.getElementById('ar-fab')) tryMountLivePreview();
    }

    function isVariantInteractionTarget(t) {
      if (!t || !t.closest) return false;
      return !!(t.closest(
        'variant-picker, variant-selects, product-form, .product-form, .variant-input-wrap, ' +
        '.variant-wrapper, .variant-option, .product-form__input, .product-form__item, ' +
        '.variant-input, label[for^="option"], .single-option-selector'
      ) || t.name === 'id' || (t.name && t.name.indexOf('options') === 0));
    }

    function bindProductPageWatchers() {
      if (window.__arProductWatchersBound) return;
      window.__arProductWatchersBound = true;

      ['variant:change', 'variant:update', 'product:variant-change', 'variant:selected'].forEach(function (ev) {
        document.addEventListener(ev, function () {
          setTimeout(ensureLivePreviewButton, 0);
          setTimeout(ensureLivePreviewButton, 200);
        });
      });

      document.addEventListener('change', function (e) {
        if (isVariantInteractionTarget(e.target)) {
          setTimeout(ensureLivePreviewButton, 0);
          setTimeout(ensureLivePreviewButton, 250);
        }
      }, true);

      document.addEventListener('click', function (e) {
        if (isVariantInteractionTarget(e.target)) {
          setTimeout(ensureLivePreviewButton, 0);
          setTimeout(ensureLivePreviewButton, 300);
        }
      }, true);

      var lastFabSig = '';
      setInterval(function () {
        ensureLivePreviewButton();
        var sig = pickerSig();
        if (sig !== lastFabSig) {
          lastFabSig = sig;
          var openRoomEl = document.getElementById('ar-room');
          if (openRoomEl && openRoomEl.classList.contains('ar-open')) applySyncedPreviewToModal();
        }
      }, 400);

      var watchRoot = document.querySelector(
        '.product-single__sticky, .product__photos, .product-information, .product-section'
      );
      if (watchRoot && window.MutationObserver) {
        new MutationObserver(function () {
          ensureLivePreviewButton();
        }).observe(watchRoot, { childList: true, subtree: true });
      }
    }

    function setupLivePreviewButton() {
      if (tryMountLivePreview()) {
        fabMountedInline = true;
        bindProductPageWatchers();
        return;
      }
      var attempts = 0;
      var timer = setInterval(function () {
        if (tryMountLivePreview()) {
          fabMountedInline = true;
          bindProductPageWatchers();
          clearInterval(timer);
        } else if (++attempts >= 60) {
          clearInterval(timer);
          mountLivePreviewFallback();
          bindProductPageWatchers();
        }
      }, 200);
    }

    setupLivePreviewButton();

    document.body.insertAdjacentHTML('beforeend',
      '<div id="ar-splash" aria-hidden="true">' +
      '<div class="ar-splash-backdrop"></div>' +
      '<div class="ar-splash-top">' +
      '<button type="button" class="ar-splash-icon-btn" id="ar-splash-fullscreen" aria-label="Full screen">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>' +
      '</svg>' +
      '</button>' +
      '<button type="button" class="ar-splash-icon-btn ar-exit-btn" id="ar-splash-close" aria-label="Exit">' +
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

    var fab = document.getElementById('ar-fab');
    var splashEl = document.getElementById('ar-splash');
    var roomEl = document.getElementById('ar-room');
    var els = {};
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
      getSizePresets().forEach(function (p, i) {
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
      var scale = state.sizeScale || presetScale(getSizePresets()[state.sizeIndex]);
      var mockup = getFrameMockupConfig();
      var w, h;

      if (PRODUCT_ONLY_PREVIEW) {
        var fit = Math.min(vpW, vpH) || 300;
        var base = fit * 0.78;
        if (mockup) {
          var frameAspect = frameMockupAspect(mockup);
          base = base * scale;
          if (frameAspect >= 1) {
            w = base;
            h = w / frameAspect;
          } else {
            h = base;
            w = h * frameAspect;
          }
        } else if (ratio >= 1) {
          h = base * scale;
          w = h / ratio;
        } else {
          w = base * scale;
          h = w * ratio;
        }
        var maxW = vpW * 0.94;
        var maxH = vpH * 0.92;
        if (w > maxW) { w = maxW; h = mockup ? w / frameMockupAspect(mockup) : w * ratio; }
        if (h > maxH) { h = maxH; w = mockup ? h * frameMockupAspect(mockup) : h / ratio; }
        return { w: Math.round(Math.max(24, w)), h: Math.round(Math.max(24, h)) };
      }

      if (mockup) {
        var fAspect = frameMockupAspect(mockup);
        if (fAspect >= 1) {
          w = Math.min(vpW * 0.52, 320) * scale;
          h = w / fAspect;
        } else {
          h = Math.min(vpH * 0.62, 280) * scale;
          w = h * fAspect;
        }
        return { w: Math.round(w), h: Math.round(h) };
      }

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
      els.wallTint.style.top = wall.top + '%';
      els.wallTint.style.left = wall.left + '%';
      els.wallTint.style.width = wall.width + '%';
      els.wallTint.style.height = wall.height + '%';
      if (state.wallTint) {
        els.wallTint.style.background = state.wallTint;
        els.wallTint.hidden = false;
      } else {
        els.wallTint.hidden = true;
      }
    }

    function buildCustomizePanelHtml() {
      var sizeLabel = (VARIANT_META.size && VARIANT_META.size.name) || 'Size';
      var frameLabelText = (VARIANT_META.frame && VARIANT_META.frame.name) || 'Frame';
      var borderLabelText = (VARIANT_META.border && VARIANT_META.border.name) || 'Border Options';

      var sizeOpts = getSizePresets().map(function (s, i) {
        var text = s.display || (s.label + ': ' + s.w + 'x' + s.h + ' cm');
        return '<option value="' + i + '"' + (i === state.sizeIndex ? ' selected' : '') + '>' +
          escapeHtml(text) + '</option>';
      }).join('');

      var frameSwatches = getFrameOptions().map(function (f) {
        var isActive = state.frameValue
          ? state.frameValue === f.value
          : state.frameId === f.id;
        var extraCls = f.id === 'none' ? ' ar-swatch-none' : '';
        var imgCls = f.image ? ' ar-swatch-img' : '';
        var style = '';
        if (f.image) {
          style = 'background-image:url(' + JSON.stringify(f.image) + ');background-size:cover;background-position:center;';
        } else if (f.id !== 'none' && f.color) {
          style = 'background:' + f.color;
        }
        return '<button type="button" class="ar-swatch' + extraCls + imgCls + (isActive ? ' ar-active' : '') + '"' +
          ' data-frame="' + f.id + '" data-frame-value="' + escapeHtml(f.value || f.label) + '"' +
          ' title="' + escapeHtml(f.label) + '"' +
          (style ? ' style="' + style + '"' : '') + '></button>';
      }).join('');

      var borderBtns = getBorderOptions().map(function (b) {
        var isActive = state.borderValue
          ? state.borderValue === b.value
          : state.matting === b.mat;
        return '<button type="button" class="ar-mat-btn' + (isActive ? ' ar-active' : '') + '"' +
          ' data-mat="' + b.mat + '" data-border-value="' + escapeHtml(b.value) + '">' +
          escapeHtml(b.label) + '</button>';
      }).join('');

      return '<label class="ar-field ar-field-size"><span class="ar-field-label ar-field-label-upper">' +
        escapeHtml(sizeLabel) + '</span><select id="ar-size">' + sizeOpts + '</select></label>' +
        '<div class="ar-field ar-field-frame"><span class="ar-field-label ar-field-label-upper" id="ar-frame-label">' +
        escapeHtml(frameLabelText) + ': <strong>' + escapeHtml(frameDisplayLabel()) + '</strong></span>' +
        '<div class="ar-swatches">' + frameSwatches + '</div></div>' +
        '<div class="ar-field' + (state.frameId === 'none' ? ' ar-matting-disabled' : '') + '" id="ar-matting-field">' +
        '<span class="ar-field-label ar-field-label-upper">' + escapeHtml(borderLabelText) + '</span>' +
        '<div class="ar-matting-btns">' + borderBtns + '</div></div>';
    }

    // ── Build room UI ────────────────────────────────────────────────────────────
    function buildRoomUI() {
      var thumbs = buildThumbsHtml();
      var canvasCls = 'ar-viewport-canvas' + (PRODUCT_ONLY_PREVIEW ? ' ar-product-only' : '');

      var actionButtonsHtml =
        '<div class="ar-popover-anchor ar-popover-anchor-customize">' +
        '<button type="button" class="ar-action-btn' + (state.activePanel === 'customize' ? ' ar-active' : '') + '" id="ar-btn-customize" aria-label="Customise">' +
        '<span class="ar-action-label">Customise</span>' +
        '<svg class="ar-chevron" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>' +
        '</button>' +
        '<div class="ar-popover ar-customize-popover' + (state.activePanel === 'customize' ? ' ar-open' : '') + '" id="ar-customize-panel">' +
        buildCustomizePanelHtml() +
        '</div>' +
        '</div>' +
        '<div class="ar-popover-anchor ar-popover-anchor-ar">' +
        '<button type="button" class="ar-action-btn ar-action-ar ar-action-live' + (state.activePanel === 'ar' ? ' ar-active' : '') + '" id="ar-btn-vr" aria-label="Live Preview">' +
        livePreviewIconHtml('ar-action-icon') +
        '<span class="ar-action-label">Live Preview</span>' +
        '<span class="ar-save-icon-slot" aria-hidden="true">' +
        '<span class="ar-save-spinner ar-ar-spinner" aria-hidden="true"></span>' +
        '</span>' +
        '</button>' +
        '<div class="ar-popover ar-qr-popover' + (state.activePanel === 'ar' ? ' ar-open' : '') + '" id="ar-qr-popover">' +
        '<button type="button" class="ar-qr-close" id="ar-qr-close" aria-label="Close">&times;</button>' +
        '<h3>Preview on your wall</h3>' +
        '<p>To view this in your room, start by scanning the QR code below.</p>' +
        '<div class="ar-qr-img" id="ar-qr-img"></div>' +
        '</div>' +
        '</div>';

      var bottomChromeHtml = PRODUCT_ONLY_PREVIEW ? '' :
        '<div class="ar-room-bottom-chrome">' +
        '<div class="ar-room-bottom-right">' +
        '<div class="ar-toolbar ar-toolbar-right ar-toolbar-actions-row">' + actionButtonsHtml + '</div>' +
        '</div>' +
        '</div>';

      var productActionsHtml = PRODUCT_ONLY_PREVIEW
        ? '<div class="ar-product-actions">' + actionButtonsHtml + '</div>'
        : '';

      var viewportHtml =
        '<div class="ar-room-viewport" id="ar-viewport">' +
        '<div class="ar-room-preview-wrap">' +
        '<div class="' + canvasCls + '" id="ar-viewport-canvas">' +
        (PRODUCT_ONLY_PREVIEW
          ? '<img class="ar-room-bg" id="ar-bg" alt="" hidden aria-hidden="true"/>'
          : '<img class="ar-room-bg" id="ar-bg" src="' + currentBgUrl() + '" alt="" draggable="false" loading="eager"/>') +
        '<div class="ar-wall-tint" id="ar-wall-tint"' + (PRODUCT_ONLY_PREVIEW ? ' hidden' : '') + '></div>' +
        '<div class="ar-product-wrap" id="ar-product-wrap">' +
        '<div class="ar-product-frame" id="ar-product-frame">' +
        '<div class="ar-frame-mockup-window" id="ar-frame-mockup-window">' +
        '<div class="ar-product-mat" id="ar-product-mat">' +
        '<img id="ar-product-img" src="' + IMG + '" alt="' + TITLE + '" loading="eager"/>' +
        '</div>' +
        '</div>' +
        '<img class="ar-frame-mockup-overlay" id="ar-frame-mockup-overlay" alt="" decoding="async" style="display:none"/>' +
        '</div>' +
        '</div>' +
        '</div>' +
        (PRODUCT_ONLY_PREVIEW ? '' :
          '<div class="ar-ui-layer">' +
          '<div class="ar-thumb-strip">' + thumbs + '</div>' +
          '</div>') +
        '</div>' +
        '<div class="ar-loading-overlay" id="ar-loading" hidden>' +
        '<div class="ar-spinner"></div>' +
        '<p class="ar-loading-text" id="ar-loading-text">Preparing AR model…</p>' +
        '</div>' +
        '</div>';

      roomEl.innerHTML =
        '<div class="ar-room-chrome">' +
        '<div class="ar-room-top">' +
        '<button type="button" class="ar-splash-icon-btn ar-exit-btn" id="ar-room-close" aria-label="Exit">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
        '</div>' +
        bottomChromeHtml +
        '</div>' +
        '<div class="ar-room-dialog ar-show-ui">' +
        '<div class="ar-room-stage">' +
        (PRODUCT_ONLY_PREVIEW
          ? '<div class="ar-product-only-layout">' + viewportHtml + productActionsHtml + '</div>'
          : viewportHtml) +
        '</div>' +
        '</div>';

      cacheEls();
      bindRoomEvents();
      viewportResizeBound = false;

      var prodImg = document.getElementById('ar-product-img');
      if (prodImg) {
        prodImg.addEventListener('load', function () { onProductImgLoad(prodImg); });
        if (prodImg.complete) onProductImgLoad(prodImg);
      }

      if (els.bg && !PRODUCT_ONLY_PREVIEW) {
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
      }
      if (!PRODUCT_ONLY_PREVIEW && els.bg) {
        els.bg.addEventListener('load', function () {
          fitCanvasToBackground(els.bg);
          renderViewport();
        });
        if (els.bg.complete && els.bg.naturalWidth > 0) {
          fitCanvasToBackground(els.bg);
        }
      }

      if (PRODUCT_ONLY_PREVIEW) roomEl.classList.add('ar-product-only', 'ar-show-ui');

      renderViewport();
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
      els.dialog = roomEl.querySelector('.ar-room-dialog');
      els.stage = roomEl.querySelector('.ar-room-stage');
      els.bg = document.getElementById('ar-bg');
      els.wallTint = document.getElementById('ar-wall-tint');
      els.productWrap = document.getElementById('ar-product-wrap');
      els.productMat = document.getElementById('ar-product-mat');
      els.productFrame = document.getElementById('ar-product-frame');
      els.mockupWindow = document.getElementById('ar-frame-mockup-window');
      els.mockupOverlay = document.getElementById('ar-frame-mockup-overlay');
      els.viewport = document.getElementById('ar-viewport');
      els.canvas = document.getElementById('ar-viewport-canvas');
      els.qrPopover = document.getElementById('ar-qr-popover');
      els.qrImg = document.getElementById('ar-qr-img');
      els.loading = document.getElementById('ar-loading');
      els.bgUpload = document.getElementById('ar-bg-upload');
      els.sizeTrack = document.getElementById('ar-size-track');
      els.sizeThumb = document.getElementById('ar-size-thumb');
      els.sizeFill = document.getElementById('ar-size-fill');
    }

    function sceneEl() {
      return els.canvas || els.viewport;
    }

    function fitProductOnlyCanvas() {
      if (!els.canvas) return;
      els.canvas.classList.add('ar-product-only');
      els.canvas.style.aspectRatio = '';
      els.canvas.style.width = '100%';
      els.canvas.style.minHeight = 'min(68vh, 560px)';
      els.canvas.style.height = 'min(68vh, 560px)';
      els.canvas.style.background = 'transparent';
      if (els.bg) {
        els.bg.hidden = true;
        els.bg.removeAttribute('src');
      }
      if (els.wallTint) els.wallTint.hidden = true;
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

    function hideMockupOverlay() {
      var el = els.mockupOverlay || document.getElementById('ar-frame-mockup-overlay');
      if (!el) return;
      el.hidden = true;
      el.style.display = 'none';
      el.removeAttribute('src');
    }

    function showMockupOverlay(src) {
      var el = els.mockupOverlay || document.getElementById('ar-frame-mockup-overlay');
      if (!el || !src) return;
      if (el.getAttribute('src') !== src) el.setAttribute('src', src);
      el.hidden = false;
      el.style.display = 'block';
    }

    function fillMockupWindowFull(winEl) {
      if (!winEl) return;
      winEl.style.display = 'block';
      winEl.style.top = '0';
      winEl.style.left = '0';
      winEl.style.right = '0';
      winEl.style.bottom = '0';
    }

    function applyMockupWindowInsets(winEl, win) {
      if (!winEl || !win) return;
      winEl.style.display = 'block';
      winEl.style.top = (win.top * 100) + '%';
      winEl.style.left = (win.left * 100) + '%';
      winEl.style.right = (win.right * 100) + '%';
      winEl.style.bottom = (win.bottom * 100) + '%';
    }

    function coverDimensions(imgRatio, boxW, boxH) {
      var boxRatio = boxW / boxH;
      var drawW, drawH;
      if (imgRatio > boxRatio) {
        drawW = boxW;
        drawH = drawW * imgRatio;
      } else {
        drawH = boxH;
        drawW = drawH / imgRatio;
      }
      return {
        drawW: drawW,
        drawH: drawH,
        offsetX: (boxW - drawW) / 2,
        offsetY: (boxH - drawH) / 2
      };
    }

    function containDimensions(imgRatio, boxW, boxH) {
      var boxRatio = boxW / boxH;
      var drawW, drawH;
      if (imgRatio > boxRatio) {
        drawH = boxH;
        drawW = drawH / imgRatio;
      } else {
        drawW = boxW;
        drawH = drawW * imgRatio;
      }
      return {
        drawW: drawW,
        drawH: drawH,
        offsetX: (boxW - drawW) / 2,
        offsetY: (boxH - drawH) / 2
      };
    }

    function applyProductImgFit(img, mode) {
      if (!img) return;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectPosition = 'center';
      img.style.borderRadius = '0';
      img.style.objectFit = mode === 'cover' ? 'cover' : 'contain';
      img.classList.toggle('ar-img-cover', mode === 'cover');
      img.classList.toggle('ar-img-contain', mode !== 'cover');
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
      if (!els.canvas || !els.productWrap) return;

      if (PRODUCT_ONLY_PREVIEW) {
        fitProductOnlyCanvas();
        state.posX = 50;
        state.posY = 50;
      } else {
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
      }

      var size = productScale();
      var outerCm = outerSizeCm();
      var mockup = getFrameMockupConfig();

      els.productWrap.style.left = state.posX + '%';
      els.productWrap.style.top = state.posY + '%';
      els.productWrap.style.width = size.w + 'px';
      els.productWrap.style.height = size.h + 'px';

      if (mockup && els.mockupWindow && els.mockupOverlay) {
        var win = mockup.window;
        var hasMat = state.matting === '1';
        els.productFrame.classList.add('ar-frame-mockup', 'ar-framed');
        els.productFrame.classList.remove('ar-blend');
        els.productWrap.classList.add('ar-wall-piece');
        els.productFrame.style.border = 'none';
        els.productFrame.style.borderWidth = '0';
        els.productFrame.style.background = 'transparent';

        applyMockupWindowInsets(els.mockupWindow, win);

        var winW = size.w * (1 - win.left - win.right);
        var winH = size.h * (1 - win.top - win.bottom);
        var matPad = mockupMatPadding(mockup, hasMat, winW, winH);

        els.mockupWindow.style.background = 'transparent';
        els.productMat.style.boxSizing = 'border-box';
        els.productMat.style.padding = matPad > 0
          ? matPad + 'px ' + matPad + 'px ' + matPad + 'px ' + matPad + 'px'
          : '0';
        els.productMat.style.background = matPad > 0 ? MAT_COLOR : 'transparent';
        els.productMat.style.width = '100%';
        els.productMat.style.height = '100%';
        els.productMat.classList.toggle('ar-matted', matPad > 0);

        showMockupOverlay(mockup.src);
        applyProductImgFit(
          document.getElementById('ar-product-img'),
          hasMat ? 'contain' : 'cover'
        );
      } else {
        hideMockupOverlay();
        fillMockupWindowFull(els.mockupWindow);
        if (els.mockupWindow) els.mockupWindow.style.background = 'transparent';

        var isUnframed = state.frameId === 'none';
        var frame = frameById(state.frameId);
        var framePx = frameBorderPx(size.w, outerCm.w);
        var framePy = frameBorderPx(size.h, outerCm.h);
        var matPx = matPaddingPx(size.w, outerCm.w);
        var matPy = matPaddingPx(size.h, outerCm.h);

        els.productFrame.classList.remove('ar-frame-mockup');
        els.productFrame.style.boxSizing = 'border-box';
        els.productFrame.style.borderRadius = '0';
        els.productFrame.style.borderWidth = isUnframed ? '0' : (framePy + 'px ' + framePx + 'px');
        els.productFrame.style.borderColor = frame.color;
        els.productFrame.style.borderStyle = isUnframed ? 'none' : 'solid';
        els.productFrame.style.width = '100%';
        els.productFrame.style.height = '100%';

        els.productMat.style.boxSizing = 'border-box';
        els.productMat.style.borderRadius = '0';
        els.productMat.style.padding = '0';
        els.productMat.style.background = 'transparent';
        els.productMat.style.width = '100%';
        els.productMat.style.height = '100%';
        els.productMat.classList.remove('ar-matted');
        els.productFrame.classList.toggle('ar-framed', !isUnframed);
        els.productWrap.classList.toggle('ar-wall-piece', !isUnframed);
        els.productFrame.classList.toggle('ar-blend', isUnframed);

        applyProductImgFit(document.getElementById('ar-product-img'), 'contain');
      }

      els.productWrap.style.transform = productTiltTransform();
      syncCustomizeFrameUI();
      syncSizeSliderUI();
      syncSpaceWidthFields(true);
      syncPaintButton();
    }

    function syncCustomizeFrameUI() {
      var frameLabel = document.getElementById('ar-frame-label');
      if (frameLabel) {
        var frameTitle = (VARIANT_META.frame && VARIANT_META.frame.name) || 'Frame';
        frameLabel.innerHTML = escapeHtml(frameTitle) + ': <strong>' + escapeHtml(frameDisplayLabel()) + '</strong>';
      }
      var matField = document.getElementById('ar-matting-field');
      if (matField) {
        matField.classList.toggle('ar-matting-disabled', state.frameId === 'none');
      }
      if (state.frameId === 'none' && state.matting !== 'none') {
        state.matting = 'none';
      }
      roomEl.querySelectorAll('.ar-swatch').forEach(function (btn) {
        var active = state.frameValue
          ? btn.dataset.frameValue === state.frameValue
          : btn.dataset.frame === state.frameId;
        btn.classList.toggle('ar-active', active);
      });
      roomEl.querySelectorAll('.ar-mat-btn').forEach(function (btn) {
        btn.disabled = state.frameId === 'none';
        var active = state.borderValue
          ? btn.dataset.borderValue === state.borderValue
          : btn.dataset.mat === state.matting;
        btn.classList.toggle('ar-active', active);
      });
    }

    function syncPanelUI() {
      var p = state.activePanel;
      var map = [
        ['ar-customize-panel', 'customize', 'ar-btn-customize'],
        ['ar-qr-popover', 'ar', 'ar-btn-vr']
      ];
      map.forEach(function (item) {
        var panel = document.getElementById(item[0]);
        var btn = document.getElementById(item[2]);
        if (panel) panel.classList.toggle('ar-open', p === item[1]);
        if (btn) btn.classList.toggle('ar-active', p === item[1]);
      });
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
      state.sizeScale = presetScale(getSizePresets()[DEFAULT_SIZE_INDEX]);
      state.sizeIndex = DEFAULT_SIZE_INDEX;
      state.unit = 'feet';
      state.spaceWidth = cmToDisplayUnit(getSizePresets()[DEFAULT_SIZE_INDEX].w, 'feet');

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
      var opening = state.activePanel !== name;
      state.activePanel = opening ? name : null;
      if (opening && name === 'customize') refreshCustomizePanel();
      else syncPanelUI();
    }

    function closePopovers() {
      state.activePanel = null;
      syncPanelUI();
    }

    // ── Drag product on room background ───────────────────────────────────────────
    function enableDrag() {
      if (PRODUCT_ONLY_PREVIEW) return;
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
        state.posX = Math.max(wall.left + 5, Math.min(wall.left + wall.width - 5, origX + dx));
        state.posY = Math.max(wall.top + 5, Math.min(wall.top + wall.height - 5, origY + dy));
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
      var frames = getFrameOptions();
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].id === id) return frames[i];
      }
      return frames[0] || FRAME_COLORS_FALLBACK[0];
    }

    function frameDisplayLabel() {
      return state.frameValue || frameById(state.frameId).label;
    }

    function paintFramedArt(ctx, outerW, outerH, prodImg, scaleX, scaleY) {
      var mockup = getFrameMockupConfig();
      if (mockup) {
        return paintFramedArtMockup(ctx, outerW, outerH, prodImg, scaleX, scaleY, mockup);
      }

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

    function paintFramedArtMockup(ctx, outerW, outerH, prodImg, scaleX, scaleY, mockup) {
      var totalW = outerW * scaleX;
      var totalH = outerH * scaleY;
      var win = mockup.window;
      var wl = win.left * totalW;
      var wt = win.top * totalH;
      var wr = win.right * totalW;
      var wb = win.bottom * totalH;
      var winW = totalW - wl - wr;
      var winH = totalH - wt - wb;
      var hasMat = state.matting === '1';
      var matPad = mockupMatPadding(mockup, hasMat, winW, winH);

      if (matPad > 0) {
        ctx.fillStyle = MAT_COLOR;
        ctx.fillRect(-totalW / 2 + wl, -totalH / 2 + wt, winW, winH);
      }

      var boxW = winW - matPad * 2;
      var boxH = winH - matPad * 2;
      var boxX = -totalW / 2 + wl + matPad;
      var boxY = -totalH / 2 + wt + matPad;

      if (boxW > 0 && boxH > 0 && prodImg && prodImg.naturalWidth) {
        var imgRatio = getProductRatio();
        var dims = hasMat
          ? containDimensions(imgRatio, boxW, boxH)
          : coverDimensions(imgRatio, boxW, boxH);
        ctx.drawImage(
          prodImg,
          boxX + dims.offsetX,
          boxY + dims.offsetY,
          dims.drawW,
          dims.drawH
        );
      }

      var frameImg = frameMockupCache[mockup.src];
      if (frameImg && frameImg.naturalWidth) {
        ctx.drawImage(frameImg, -totalW / 2, -totalH / 2, totalW, totalH);
      }

      return { totalW: totalW, totalH: totalH, matPx: matPad, framePx: 0 };
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

    function ensureFrameMockupLoaded() {
      var mockup = getFrameMockupConfig();
      if (!mockup) return Promise.resolve();
      var cached = frameMockupCache[mockup.src];
      if (cached && cached.naturalWidth) return Promise.resolve();
      return new Promise(function (resolve) {
        var img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function () {
          frameMockupCache[mockup.src] = img;
          resolve();
        };
        img.onerror = function () { resolve(); };
        img.src = mockup.src;
      });
    }

    function buildARProductImage() {
      var dims = getARDimensions();
      var frame = frameById(state.frameId);
      if (!toSecureUrl(IMG)) {
        return Promise.reject(new Error('Product image is missing'));
      }
      return ensureFrameMockupLoaded().then(function () {
        return loadProductImageForCanvas().then(function (prodImg) {
          return {
            image: renderARCompositeDataUrl(prodImg),
            frameColor: frame.id === 'none' ? '' : frame.color,
            dims: dims
          };
        });
      });
    }

    var QL_POSTER =
      'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

    function setARButtonLoading(on) {
      arInProgress = on;
      var btn = document.getElementById('ar-btn-vr');
      if (btn) {
        btn.disabled = on;
        btn.classList.toggle('ar-loading', on);
        btn.setAttribute('aria-busy', on ? 'true' : 'false');
      }
      if (els.loading) {
        if (on && isMobile) {
          els.loading.hidden = false;
        } else if (!on) {
          els.loading.hidden = true;
        }
      }
    }

    function resolveModelUrl(pathOrUrl) {
      if (!pathOrUrl) return '';
      var path = extractModelPath(pathOrUrl);
      if (!path && String(pathOrUrl).charAt(0) === '/') path = String(pathOrUrl);
      if (path) {
        var prefix = (BACKEND || '/apps/ar-preview').replace(/\/$/, '');
        try {
          return new URL(prefix + path, window.location.href).href;
        } catch (e) {
          return prefix + path;
        }
      }
      return toSecureUrl(pathOrUrl);
    }

    function loadModelViewerScript() {
      if (window.customElements && window.customElements.get('model-viewer')) {
        return Promise.resolve();
      }
      return new Promise(function (resolve, reject) {
        var existing = document.querySelector('script[data-ar-model-viewer]');
        if (existing) {
          var waited = 0;
          var poll = setInterval(function () {
            if (window.customElements && window.customElements.get('model-viewer')) {
              clearInterval(poll);
              resolve();
              return;
            }
            waited += 100;
            if (waited >= 12000) {
              clearInterval(poll);
              reject(new Error('model-viewer failed to load'));
            }
          }, 100);
          return;
        }
        var script = document.createElement('script');
        script.type = 'module';
        script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js';
        script.setAttribute('data-ar-model-viewer', '1');
        script.onload = function () {
          var boot = setInterval(function () {
            if (window.customElements && window.customElements.get('model-viewer')) {
              clearInterval(boot);
              resolve();
            }
          }, 50);
          setTimeout(function () {
            clearInterval(boot);
            if (window.customElements && window.customElements.get('model-viewer')) resolve();
            else reject(new Error('model-viewer failed to initialize'));
          }, 12000);
        };
        script.onerror = function () { reject(new Error('model-viewer failed to load')); };
        document.head.appendChild(script);
      });
    }

    function promiseWithTimeout(promise, ms, message) {
      return new Promise(function (resolve, reject) {
        var settled = false;
        var timer = setTimeout(function () {
          if (settled) return;
          settled = true;
          reject(new Error(message || 'Timed out'));
        }, ms);
        promise.then(function (value) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }, function (err) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(err);
        });
      });
    }

    function fetchHeadWithTimeout(url, ms) {
      var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      var timer = setTimeout(function () {
        if (controller) controller.abort();
      }, ms);
      return fetch(url, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        clearTimeout(timer);
        return res;
      }, function (err) {
        clearTimeout(timer);
        throw err;
      });
    }

    function getDirectQuickLookLink() {
      var link = document.getElementById('ar-direct-ql');
      if (link) return link;
      link = document.createElement('a');
      link.id = 'ar-direct-ql';
      link.rel = 'ar';
      link.className = 'ar-direct-ar-hidden';
      link.setAttribute('aria-hidden', 'true');
      link.innerHTML = '<img src="' + QL_POSTER + '" alt="" width="1" height="1"/>';
      document.body.appendChild(link);
      return link;
    }

    function finishDirectARSession() {
      arInProgress = false;
      setARButtonLoading(false);
    }

    function launchIOSQuickLook(usdzUrl) {
      return fetchHeadWithTimeout(usdzUrl, 5000)
        .then(function (res) {
          if (!res.ok && res.status !== 405) {
            throw new Error('Model not found (HTTP ' + res.status + ')');
          }
        })
        .catch(function () {
          /* HEAD can fail on some proxies — still try Quick Look */
        })
        .then(function () {
          var link = getDirectQuickLookLink();
          link.href = usdzUrl;
          link.click();
          finishDirectARSession();
        });
    }

    function launchAndroidWebXR(glbUrl) {
      return loadModelViewerScript().then(function () {
        var host = document.getElementById('ar-direct-mv-host');
        if (!host) {
          host = document.createElement('div');
          host.id = 'ar-direct-mv-host';
          host.className = 'ar-direct-mv-stage';
          document.body.appendChild(host);
        }
        host.innerHTML = '';

        var mv = document.createElement('model-viewer');
        mv.id = 'ar-direct-mv';
        mv.setAttribute('ar', '');
        mv.setAttribute('ar-modes', 'webxr');
        mv.setAttribute('ar-placement', 'wall');
        mv.setAttribute('ar-scale', 'fixed');
        mv.setAttribute('camera-orbit', '0deg 90deg auto');
        mv.setAttribute('min-camera-orbit', 'auto 90deg auto');
        mv.setAttribute('max-camera-orbit', 'auto 90deg auto');
        mv.setAttribute('interaction-prompt', 'none');
        mv.setAttribute('shadow-intensity', '0');
        mv.setAttribute('crossorigin', 'anonymous');
        host.appendChild(mv);

        return promiseWithTimeout(new Promise(function (resolve, reject) {
          var settled = false;
          function done(err) {
            if (settled) return;
            settled = true;
            if (err) reject(err);
            else resolve();
          }

          function onArStatus(e) {
            var st = e.detail && e.detail.status;
            if (st === 'session-started') {
              host.classList.add('ar-direct-mv-active');
              finishDirectARSession();
              done();
            } else if (st === 'failed') {
              host.classList.remove('ar-direct-mv-active');
              finishDirectARSession();
              done(new Error('AR failed to start. Update Chrome and Google Play Services for AR.'));
            } else if (st === 'not-presenting') {
              host.classList.remove('ar-direct-mv-active');
              finishDirectARSession();
              done();
            }
          }

          mv.addEventListener('ar-status', onArStatus);
          mv.addEventListener('load', function onLoad() {
            mv.removeEventListener('load', onLoad);
            if (!mv.canActivateAR) {
              finishDirectARSession();
              done(new Error('AR not available on this device'));
              return;
            }
            finishDirectARSession();
            host.classList.add('ar-direct-mv-active');
            mv.activateAR();
          }, { once: true });
          mv.addEventListener('error', function () {
            finishDirectARSession();
            done(new Error('Could not load 3D model'));
          }, { once: true });
          mv.src = glbUrl;
        }), 25000, 'AR took too long to open. Check your connection and try again.');
      });
    }

    function launchDirectAR(data) {
      var glbUrl = resolveModelUrl(data.glbPath || data.glb);
      var usdzUrl = resolveModelUrl(data.usdzPath || data.usdz);

      if (isIOS) {
        if (!usdzUrl) return Promise.reject(new Error('AR model not available for iOS'));
        return promiseWithTimeout(
          launchIOSQuickLook(usdzUrl),
          12000,
          'AR took too long to open. Try again.'
        );
      }
      if (!glbUrl) return Promise.reject(new Error('No GLB model path returned'));
      return launchAndroidWebXR(glbUrl);
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
            if (bgImg && !PRODUCT_ONLY_PREVIEW) {
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
            if (!bgImg || PRODUCT_ONLY_PREVIEW) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, exportW, exportH);
            }
            if (state.wallTint && !PRODUCT_ONLY_PREVIEW) {
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

    function setARLoadingMessage(msg) {
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
      setARButtonLoading(true);
      setARLoadingMessage('Preparing your product…');

      buildARProductImage()
        .then(function (payload) {
          if (!payload.image) {
            throw new Error('Could not prepare product image for AR');
          }
          setARLoadingMessage('Building 3D model…');
          return fetch(BACKEND + '/api/ar-model', {
            method: 'POST',
            mode: 'cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              image: payload.image,
              frameColor: payload.frameColor || '',
              w: payload.dims.w,
              h: payload.dims.h,
              frame: 'none',
              matting: 'none',
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
          setARLoadingMessage('Opening AR…');
          return launchDirectAR(data);
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
        syncFromProductPage();
        applySyncedPreviewToModal();
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
    function bindCustomizePanelEvents() {
      var sizeEl = document.getElementById('ar-size');
      if (sizeEl) sizeEl.addEventListener('change', function (e) {
        state.sizeIndex = parseInt(e.target.value, 10);
        state.sizeScale = presetScale(getSizePresets()[state.sizeIndex]);
        syncSpaceWidthFields(false);
        syncSizeSliderUI();
        renderViewport();
      });

      roomEl.querySelectorAll('#ar-customize-panel .ar-swatch').forEach(function (btn) {
        btn.addEventListener('click', function () {
          state.frameId = btn.dataset.frame;
          state.frameValue = btn.dataset.frameValue || '';
          if (state.frameId === 'none') state.matting = 'none';
          roomEl.querySelectorAll('#ar-customize-panel .ar-swatch').forEach(function (b) {
            b.classList.remove('ar-active');
          });
          btn.classList.add('ar-active');
          syncCustomizeFrameUI();
          renderViewport();
        });
      });

      roomEl.querySelectorAll('#ar-customize-panel .ar-mat-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (state.frameId === 'none') return;
          state.matting = btn.dataset.mat;
          state.borderValue = btn.dataset.borderValue || '';
          roomEl.querySelectorAll('#ar-customize-panel .ar-mat-btn').forEach(function (b) {
            b.classList.remove('ar-active');
          });
          btn.classList.add('ar-active');
          renderViewport();
        });
      });
    }

    function bindRoomEvents() {
      document.getElementById('ar-room-close').addEventListener('click', closeRoom);
      var fsBtn = document.getElementById('ar-room-fullscreen');
      if (fsBtn) fsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleRoomFullWidth();
      });
      roomEl.addEventListener('click', function (e) {
        if (Date.now() < blockBackdropCloseUntil) return;
        if (e.target === roomEl) closeRoom();
      });

      var customizeBtn = document.getElementById('ar-btn-customize');
      if (customizeBtn) customizeBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePanel('customize');
      });
      bindCustomizePanelEvents();

      bindThumbEvents();

      var vrBtn = document.getElementById('ar-btn-vr');
      if (vrBtn) vrBtn.addEventListener('click', function (e) {
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
        if (state.activePanel === 'customize' || state.activePanel === 'ar') closePopovers();
      });

      enableDrag();
      enablePinchZoom();
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
      var prodImg = document.getElementById('ar-product-img');
      if (PRODUCT_ONLY_PREVIEW) {
        return waitForImgElement(prodImg);
      }

      var bgUrl = currentBgUrl();
      var root = document.getElementById('ar-root');
      var room = getRoom(state.roomIndex);
      var builtinIndex = state.roomIndex - SESSION_ROOMS.length;
      var fallbackUrl = (room && !room.uploaded && builtinIndex >= 0 && root)
        ? root.getAttribute('data-room-' + builtinIndex)
        : null;

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
          applySyncedPreviewToModal();
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
        doc.requestFullscreen().catch(function () { });
      } else if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () { });
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
      state.posY = 50;
      state.wallTint = null;
      openGeneration++;
      var gen = openGeneration;

      syncFromProductPage();
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

    bindFabClick();

    try {
      if (sessionStorage.getItem(AR_REOPEN_KEY)) {
        sessionStorage.removeItem(AR_REOPEN_KEY);
        requestAnimationFrame(function () { openRoom(); });
      }
    } catch (e) { }

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

  }

  if (productId && backendPreview) {
    fetch(
      backendPreview + '/api/settings?product_id=' + encodeURIComponent(productId),
      { credentials: 'same-origin' }
    )
      .then(function (res) { return res.ok ? res.json() : { enabled: true }; })
      .then(function (data) {
        if (data && data.enabled === false) {
          removeArViewerDom();
          return;
        }
        arImageSettings = {
          imageMode: (data && data.imageMode) || 'default',
          imageAlt: (data && data.imageAlt) || '',
          imageUrl: (data && data.imageUrl) || '',
          imageThumb: (data && data.imageThumb) || ''
        };
        if (data && data.width != null) root.dataset.width = String(data.width);
        if (data && data.height != null) root.dataset.height = String(data.height);
        if (data && data.imageUrl) {
          root.dataset.img = data.imageUrl;
          root.dataset.imgThumb = data.imageThumb || data.imageUrl;
        }
        continueInit();
      })
      .catch(function () { continueInit(); });
  } else {
    continueInit();
  }

})();
