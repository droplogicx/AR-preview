/* Poster Studio – interactive 3D framed-poster preview for the product page.
 *
 * This version overlays ONE 3D viewer directly on top of the product's main
 * gallery image, mounted full-bleed (inset:0) inside the image's own media
 * cell. No absolute-rect maths, no scroll/resize repositioning, no duplicate
 * viewer instances. The 3D engine (poster-studio-3d-viewer.js) is unchanged.
 */
(function () {
  'use strict';

  var root = document.getElementById('ps-root');
  if (!root) return;

  /* ---------------------------------------------------------------- config */
  var viewerSrc     = root.dataset.viewerSrc || '';
  var productTitle  = root.dataset.title || 'Product artwork';
  var productId     = root.dataset.productId || '';
  var backendBase   = (root.dataset.backend || '/apps/ar-preview').replace(/\/+$/, '');

  var FRAME_COLORS = {
    none: 'transparent',
    'natural-timber': '#caa375',
    white: '#e9e4d8',
    black: '#1a1a1a'
  };
  var FRAME_REFERENCES = {
    'natural-timber': {
      portrait:  root.dataset.swatchNatural || '',
      landscape: root.dataset.swatchNaturalLandscape || root.dataset.swatchNatural || ''
    },
    white: {
      portrait:  root.dataset.swatchWhite || '',
      landscape: root.dataset.swatchWhiteLandscape || root.dataset.swatchWhite || ''
    },
    black: {
      portrait:  root.dataset.swatchBlack || '',
      landscape: root.dataset.swatchBlackLandscape || root.dataset.swatchBlack || ''
    }
  };

  /* Where the theme keeps its product media. Ordered from most- to
   * least-specific; the first host that yields a usable image wins. */
  var HOST_SELECTORS = [
    '[data-testid="product-information-media"]',
    '.product-information__media',
    'product-media-gallery',
    'media-gallery',
    'slideshow-component',
    '.product__media-wrapper',
    '.product__media-list',
    '.product-gallery',
    '.product__photos',
    '[data-product-media-gallery]',
    '[data-product-images]',
    '.product__media'
  ];
  /* The tight cell that wraps a single media item. */
  var MEDIA_CELL_SELECTORS =
    '.product__media, .product__media-item, .product-media-container, ' +
    '.product-gallery__media, slideshow-slide, .slideshow__slide, ' +
    '.slider__slide, .media, [data-media-id]';

  /* ---------------------------------------------------------------- state  */
  var productData      = null;
  var VARIANT_META     = { size: null, frame: null, border: null };
  var enabled          = true;

  var primaryImage     = null;   // the theme <img> we are covering
  var mediaCell        = null;   // its tight positioned wrapper
  var cellPrevPosition = null;

  var overlay          = null;   // our injected container
  var canvasHost       = null;   // the 3D mount point
  var loadingEl        = null;
  var errorEl          = null;
  var hintEl           = null;
  var idleHintEl       = null;   // the "you can drag this" hand icon

  var viewer           = null;   // the single 3D viewer instance
  var engineLoading    = false;
  var engineReady      = false;
  var viewerBuilding   = false;
  var lastSignature    = '';
  var loadTimer        = null;
  var pollTimer        = null;
  var observer         = null;

  /* ================================================================ utils */
  function toSecureUrl(url) {
    if (!url) return '';
    url = String(url).trim();
    if (url.indexOf('//') === 0) url = 'https:' + url;
    if (url.indexOf('http://') === 0) url = 'https://' + url.slice(7);
    return url;
  }

  function hasWebGL() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function imageSrc(img) {
    if (!img) return '';
    return toSecureUrl(img.currentSrc || img.src ||
      img.getAttribute('src') || img.getAttribute('data-src') || '');
  }

  function isVisible(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      var s = getComputedStyle(node);
      if (s.display === 'none') return false;
      if (node.classList && node.classList.contains('ps-img-hidden')) {
        node = node.parentElement; continue;               // our own hide flag
      }
      if (s.visibility === 'hidden' || parseFloat(s.opacity || '1') === 0) return false;
      node = node.parentElement;
    }
    return true;
  }

  /* ================================================= product / variant data */
  function loadProductData() {
    var el = document.getElementById('ps-product-data');
    if (!el) return;
    try { productData = JSON.parse(el.textContent); }
    catch (e) { productData = null; }
    identifyVariantOptions();
  }

  function normOptName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function identifyVariantOptions() {
    VARIANT_META = { size: null, frame: null, border: null };
    if (!productData || !productData.options) return;
    productData.options.forEach(function (name, index) {
      var n = normOptName(name);
      if (/size|dimension|format/.test(n))       VARIANT_META.size   = { name: name, index: index };
      else if (/border|mat/.test(n))             VARIANT_META.border = { name: name, index: index };
      else if (/frame|mount|style|finish|print/.test(n)) VARIANT_META.frame = { name: name, index: index };
    });
  }

  /* Standard ISO 216 "A" paper sizes in cm — used as a fallback when the
     variant's size label is a plain code like "A4" with no embedded WxH
     text. Without this, printWidthCm/printHeightCm stayed 0 for every size
     except the ones that spell out dimensions (e.g. "B0: 100x141 cm"),
     silently disabling the frame-aspect fix for most sizes. */
  var STANDARD_SIZES_CM = {
    a0: { w: 84.1,  h: 118.9 },
    a1: { w: 59.4,  h: 84.1  },
    a2: { w: 42.0,  h: 59.4  },
    a3: { w: 29.7,  h: 42.0  },
    a4: { w: 21.0,  h: 29.7  },
    a5: { w: 14.8,  h: 21.0  }
  };

  function parseSizeValue(str) {
    var s = String(str || '').trim();
    var m = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (m) return { value: s, w: parseFloat(m[1]), h: parseFloat(m[2]) };
    var km = s.match(/\b(a[0-5])\b/i);
    if (km) {
      var known = STANDARD_SIZES_CM[km[1].toLowerCase()];
      if (known) return { value: s, w: known.w, h: known.h };
    }
    return null;
  }

  function parseFrameId(str) {
    var s = String(str || '').toLowerCase().trim();
    if (!s || /unfram|no frame|^none|tube|rolled|canvas/i.test(s)) return 'none';
    if (/natural|timber|wood|oak/i.test(s)) return 'natural-timber';
    if (/white/i.test(s)) return 'white';
    if (/black/i.test(s)) return 'black';
    return 'natural-timber';
  }

  function parseBorderMat(str) {
    var s = String(str || '').toLowerCase();
    if (/no border|noborder|without border|without white/i.test(s)) return 'none';
    if (/with white|with border|white border|border/i.test(s)) return '1';
    return 'none';
  }

  function selectedVariantId() {
    var input =
      document.querySelector('product-form input[name="id"]') ||
      document.querySelector('product-form select[name="id"]') ||
      document.querySelector('form[action*="/cart/add"] [name="id"]') ||
      document.querySelector('[name="id"]');
    if (input && input.value) return String(input.value);
    try { return new URL(window.location.href).searchParams.get('variant') || ''; }
    catch (e) { return ''; }
  }

  function selectedVariant() {
    if (!productData || !productData.variants || !productData.variants.length) return null;
    var id = selectedVariantId();
    if (!id) return productData.variants[0];
    for (var i = 0; i < productData.variants.length; i++) {
      if (String(productData.variants[i].id) === id) return productData.variants[i];
    }
    return productData.variants[0];
  }

  function variantValue(variant, meta) {
    if (!variant || !meta || !variant.options) return '';
    return variant.options[meta.index] || '';
  }

  function orientation(w, h) { return (w && h && w > h) ? 'landscape' : 'portrait'; }

  function framePayload() {
    var variant = selectedVariant();
    var size    = parseSizeValue(variantValue(variant, VARIANT_META.size));
    var frameId = parseFrameId(variantValue(variant, VARIANT_META.frame));
    var matting = frameId === 'none' ? 'none'
                : parseBorderMat(variantValue(variant, VARIANT_META.border));
    var refs    = FRAME_REFERENCES[frameId] || FRAME_REFERENCES['natural-timber'] || {};
    var ori     = orientation(size ? size.w : 0, size ? size.h : 0);

    return {
      frameId: frameId,
      frameColor: FRAME_COLORS[frameId] || 'transparent',
      frameTextureUrl: refs[ori] || refs.portrait || '',
      naturalFramePortraitUrl:  refs.portrait  || '',
      naturalFrameLandscapeUrl: refs.landscape || refs.portrait || '',
      matting: matting,
      printWidthCm:  size ? size.w : 0,
      printHeightCm: size ? size.h : 0
    };
  }

  /* Best image for the current variant/state, wrapped with frame settings. */
  function currentPayload() {
    var url, w, h, alt;

    // Prefer the image the theme is actually showing (WYSIWYG); fall back to
    // the selected variant image, then the product featured image.
    if (primaryImage && imageSrc(primaryImage)) {
      var rect = primaryImage.getBoundingClientRect();
      url = imageSrc(primaryImage);
      w   = primaryImage.naturalWidth  || Math.round(rect.width)  || 1;
      h   = primaryImage.naturalHeight || Math.round(rect.height) || 1;
      alt = primaryImage.alt;
    } else {
      var variant = selectedVariant();
      if (variant && variant.featured_image && variant.featured_image.src) {
        url = variant.featured_image.src;
        w   = variant.featured_image.width;
        h   = variant.featured_image.height;
      } else {
        url = root.dataset.img || '';
        w   = parseInt(root.dataset.imgW || '0', 10) || 1;
        h   = parseInt(root.dataset.imgH || '0', 10) || 1;
      }
    }

    url = toSecureUrl(url);
    if (!url) return null;

    var payload = {
      url: url, width: w || 1, height: h || 1, alt: alt || productTitle
    };
    var fp = framePayload();
    for (var k in fp) if (fp.hasOwnProperty(k)) payload[k] = fp[k];
    return payload;
  }

  function signatureOf(p) {
    if (!p) return '';
    return [p.url, p.frameId, p.frameColor, p.frameTextureUrl,
            p.naturalFramePortraitUrl, p.naturalFrameLandscapeUrl,
            p.matting, p.printWidthCm, p.printHeightCm].join('|');
  }

  /* ================================================= image / cell discovery */
  function isProductImage(img, host) {
    if (!img || !host || !host.contains(img)) return false;
    if (img.closest('#ps-root, script, template, .ps-overlay')) return false;
    if (!isVisible(img)) return false;
    var r = img.getBoundingClientRect();
    if (r.width < 150 || r.height < 150) return false;
    var src = imageSrc(img);
    if (!src || /sprite|icon|logo|placeholder|transparent|blank/i.test(src)) return false;
    return true;
  }

  function findPrimaryImage() {
    var best = null, bestArea = 0, bestTop = Infinity;
    for (var i = 0; i < HOST_SELECTORS.length; i++) {
      var hosts = document.querySelectorAll(HOST_SELECTORS[i]);
      for (var h = 0; h < hosts.length; h++) {
        var imgs = hosts[h].querySelectorAll('img');
        for (var j = 0; j < imgs.length; j++) {
          var img = imgs[j];
          if (!isProductImage(img, hosts[h])) continue;
          var r = img.getBoundingClientRect();
          var area = r.width * r.height;
          /* prefer the largest; break ties by whichever sits highest */
          if (area > bestArea + 2000 ||
             (Math.abs(area - bestArea) <= 2000 && r.top < bestTop - 8)) {
            best = img; bestArea = area; bestTop = r.top;
          }
        }
      }
      if (best) break;            // stop at the most specific host that had images
    }
    return best;
  }

  /* The tightest positioned wrapper around the image (so the overlay lines up
   * with the artwork, not the whole gallery column). */
  function findMediaCell(img) {
    var preferred = img.closest(MEDIA_CELL_SELECTORS);
    var ir = img.getBoundingClientRect();
    var node = preferred || img.parentElement;
    while (node && node !== document.body) {
      var r = node.getBoundingClientRect();
      if (r.width  >= ir.width  * 0.9 && r.width  <= ir.width  * 1.6 &&
          r.height >= ir.height * 0.9 && r.height <= ir.height * 1.6) {
        return node;
      }
      if (preferred) break;
      node = node.parentElement;
    }
    return preferred || img.parentElement;
  }

  /* ================================================= overlay construction */
  function buildOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'ps-overlay';
    overlay.innerHTML =
      '<div class="ps-canvas" role="img" aria-label="' +
        String(productTitle).replace(/"/g, '&quot;') +
        ' as an interactive 3D preview"></div>' +
      '<div class="ps-idle-hint" aria-hidden="true">' +
        '<div class="ps-idle-hint-badge">' +
          '<svg viewBox="-20 -20 456 424" width="34" height="34">' +
            '<path fill="#FFFFFF" opacity="1" stroke="none" d="' +
              'M161.585052,326.599548 C160.758926,321.115021 159.304916,316.171722 155.266434,312.886200 C142.674576,302.642151 135.004639,288.774414 126.726105,275.293274 C116.179260,258.118317 105.451935,241.054031 94.767708,223.963730 C89.989128,216.320023 89.700195,210.358276 93.958908,204.452087 C98.363541,198.343521 106.196655,195.560516 113.948601,197.382523 C122.170418,199.314957 128.873199,203.867676 134.701843,209.764084 C139.837265,214.959229 144.782074,220.342789 150.052628,225.897751 C151.290207,223.901932 150.787689,221.893723 150.789474,220.032639 C150.824982,183.040604 150.785187,146.048447 150.840073,109.056442 C150.853134,100.250854 153.403519,92.543343 161.693863,88.003181 C175.019241,80.705612 190.129959,87.968407 192.351990,103.006516 C193.988235,114.080063 192.816284,125.300468 193.016510,136.453186 C193.156387,144.245102 193.043472,152.041565 193.043472,160.675003 C207.559906,155.291321 218.266632,158.943771 225.417191,171.984863 C232.357376,169.367645 239.085770,168.381210 245.887131,171.773026 C250.431061,174.039062 252.484573,179.000305 256.217438,181.573624 C259.824249,184.060059 265.339630,181.109940 270.032074,183.458527 C277.617798,187.255264 282.255646,193.346375 283.006775,201.263626 C285.716125,229.821030 286.833466,258.412689 279.778931,286.628296 C277.543976,295.567078 274.256866,304.204041 269.064240,311.793915 C263.821503,319.457001 261.840729,327.535004 262.169586,336.727264 C262.640442,349.888336 262.318451,349.904694 248.926590,349.908112 C222.765488,349.914764 196.604370,349.933502 170.443298,349.908539 C161.651703,349.900146 160.689148,348.647522 161.428101,340.023071 C161.796707,335.720886 161.572662,331.367920 161.585052,326.599548 ' +
              'M257.315125,197.099701 C257.281982,201.596466 257.347687,206.096954 257.178040,210.588562 C257.078979,213.212067 255.662247,215.054749 252.865677,215.166092 C250.321411,215.267380 248.850159,213.621964 248.303391,211.333710 C247.922348,209.739044 247.906296,208.036713 247.884308,206.380386 C247.806946,200.550827 248.019196,194.708221 247.700546,188.893631 C247.374451,182.943054 242.288300,178.889832 235.997375,179.068863 C229.943634,179.241135 226.417526,182.958649 226.313843,189.365479 C226.249146,193.362549 226.347733,197.362991 226.240295,201.358353 C226.164230,204.186218 224.912613,206.233658 221.777527,206.279984 C218.680923,206.325760 217.360565,204.300079 216.998947,201.547211 C216.804901,200.069977 216.877548,198.554840 216.869370,197.056595 C216.835693,190.893219 216.896820,184.728073 216.767059,178.566879 C216.668961,173.909348 214.036942,170.811600 210.007462,168.865463 C205.736160,166.802521 201.633316,167.223526 197.779678,170.048584 C193.940033,172.863327 192.567688,176.864716 192.454147,181.369476 C192.319855,186.697372 192.392975,192.030365 192.364594,197.361084 C192.347549,200.563141 192.641388,204.406662 188.164856,204.447647 C183.400513,204.491272 183.645599,200.516129 183.638123,197.120468 C183.635559,195.954346 183.636032,194.788208 183.635880,193.622086 C183.632339,165.801682 183.630005,137.981277 183.622467,110.160873 C183.622055,108.662193 183.702728,107.149269 183.533051,105.667328 C182.814529,99.392044 177.747742,94.570679 171.994934,94.593140 C165.858276,94.617088 160.932724,99.488670 160.405655,106.122490 C160.287216,107.613358 160.350739,109.119614 160.350418,110.618790 C160.341263,152.765884 160.341324,194.912994 160.312408,237.060074 C160.310516,239.820129 160.939987,242.958099 157.414154,244.304810 C153.723465,245.714493 151.941223,242.956894 149.976562,240.725082 C143.703857,233.599365 137.569916,226.347305 131.158295,219.349350 C125.822823,213.525970 119.813232,208.508865 111.858749,206.590042 C107.752518,205.599503 104.276733,206.713348 101.682602,210.161880 C99.100815,213.594040 101.106941,216.398285 102.904732,219.270218 C111.918159,233.668777 120.887657,248.094864 129.910355,262.487579 C140.048920,278.660309 148.592697,295.964752 163.895065,308.398041 C167.976196,311.714020 169.266663,317.044586 170.379547,322.176758 C171.655350,328.060303 171.050980,334.024445 171.012177,339.679138 C172.986710,340.975494 174.704422,340.582855 176.323532,340.584625 C199.812561,340.610535 223.302628,340.481323 246.789917,340.682098 C251.416977,340.721680 253.049484,339.316681 252.738297,334.704163 C252.078949,324.930267 254.363403,315.995880 260.369904,307.951599 C263.019470,304.403168 264.785156,300.127319 266.576813,296.018097 C272.730774,281.903687 274.477753,266.881775 275.293823,251.702301 C276.171356,235.379837 275.578705,219.093369 273.821136,202.850876 C273.302094,198.054367 270.873932,194.410385 266.496948,192.227386 C262.129456,190.049088 259.221069,191.353546 257.315125,197.099701 z"/>' +
            '<path fill="#FFFFFF" opacity="1" stroke="none" d="M220.065689,62.967758 C214.003998,69.180046 208.178589,75.117149 202.365265,81.066048 C199.960953,83.526436 197.221909,85.411499 194.215302,82.423256 C191.295731,79.521530 192.842010,76.661606 195.314926,74.181152 C201.073212,68.405350 206.820709,62.618771 212.585709,56.849674 C214.674088,54.759800 217.108704,53.750530 219.704575,55.711800 C222.308762,57.679371 222.209686,60.184906 220.065689,62.967758 z"/>' +
            '<path fill="#FFFFFF" opacity="1" stroke="none" d="M167.653091,62.895256 C167.657013,55.082836 167.706482,47.755230 167.644577,40.428558 C167.617630,37.239040 168.417160,34.512146 172.045486,34.419697 C175.797241,34.324097 177.216782,37.003719 177.240524,40.399719 C177.303391,49.391701 177.296921,58.384418 177.266418,67.376663 C177.254913,70.770378 176.004517,73.415215 172.140808,73.345276 C168.361282,73.276863 167.740295,70.431297 167.672882,67.376953 C167.643494,66.045288 167.658569,64.712646 167.653091,62.895256 z"/>' +
            '<path fill="#FFFFFF" opacity="1" stroke="none" d="M123.392570,57.624168 C125.972099,53.446854 129.001312,53.745090 131.817200,56.539669 C137.962296,62.638222 143.945480,68.902748 149.896332,75.192642 C151.960800,77.374733 152.504333,80.109642 150.101929,82.279732 C147.980804,84.195755 145.335770,83.789101 143.333298,81.807213 C137.060349,75.598747 130.878174,69.297951 124.707451,62.987324 C123.375351,61.625023 122.649521,59.954353 123.392570,57.624168 z"/>' +
            '<path fill="#FFFFFF" opacity="1" stroke="none" d="M136.489960,99.803802 C140.018646,100.533150 141.667694,102.436287 141.012451,105.577896 C140.394592,108.540260 137.951920,109.224731 135.245193,109.222397 C126.930061,109.215240 118.614799,109.192520 110.299850,109.231171 C106.860680,109.247169 104.096954,108.076393 104.170662,104.311890 C104.246735,100.426834 107.309067,99.728973 110.598747,99.742332 C119.079971,99.776764 127.561409,99.760773 136.489960,99.803802 z"/>' +
            '<path fill="#FFFFFF" opacity="1" stroke="none" d="M204.078461,101.863174 C205.737701,99.785416 207.734177,99.727112 209.752579,99.726006 C217.719391,99.721642 225.686264,99.729645 233.652985,99.701035 C237.169617,99.688400 240.239807,100.540047 240.094086,104.749817 C239.956863,108.713608 236.824707,109.237595 233.613052,109.236916 C225.480255,109.235191 217.346130,109.325409 209.215134,109.204590 C204.258560,109.130951 203.062225,107.410164 204.078461,101.863174 z"/>' +
          '</svg>' +
        '</div>' +
      '</div>' +
      '<div class="ps-loading" hidden><div class="ps-loader-bar" aria-hidden="true"></div></div>' +
      '<div class="ps-error" hidden>3D preview could not load for this image.</div>';

    canvasHost = overlay.querySelector('.ps-canvas');
    loadingEl  = overlay.querySelector('.ps-loading');
    errorEl    = overlay.querySelector('.ps-error');
    hintEl     = overlay.querySelector('.ps-hint');
    idleHintEl = overlay.querySelector('.ps-idle-hint');

    var toolbar = overlay.querySelector('.ps-toolbar');
    toolbar.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    overlay.querySelector('.ps-reset').addEventListener('click', function (e) {
      e.stopPropagation();
      if (viewer && typeof viewer.reset === 'function') viewer.reset(false);
      if (viewer) { viewer.__ps_curX = 0; viewer.__ps_curY = 0; }   // else applyHoverTilt undoes this next frame
      clearIdleCycle();
      tiltState.targetX = 0; tiltState.targetY = 0;
      tiltState.dragging = false;
      if (!tiltState.hovering) scheduleIdleCheck();
      if (hintEl) hintEl.classList.remove('is-hidden');   // show the hint again
    });

    var hideHint = function () { if (hintEl) hintEl.classList.add('is-hidden'); };
    canvasHost.addEventListener('pointerdown', hideHint);
    canvasHost.addEventListener('mouseenter', hideHint);
    return overlay;
  }

  function showLoading(on) {
    if (loadingEl) loadingEl.hidden = !on;
    if (on && errorEl) errorEl.hidden = true;
  }
  function showError(msg) {
    if (!errorEl) return;
    errorEl.textContent = msg || '3D preview could not load for this image.';
    errorEl.hidden = !msg;
    if (msg) showLoading(false);
  }

  /* Mount / re-mount the overlay onto the current image's cell. */
  function attachOverlay() {
    var img = findPrimaryImage();
    if (!img) return false;

    var cell = findMediaCell(img);
    if (!cell) return false;

    buildOverlay();

    if (mediaCell !== cell) {
      // restore the previous cell we borrowed
      if (mediaCell && cellPrevPosition !== null) {
        mediaCell.style.position = cellPrevPosition;
      }
      cellPrevPosition = cell.style.position || '';
      if (getComputedStyle(cell).position === 'static') cell.style.position = 'relative';
      cell.appendChild(overlay);
      mediaCell = cell;
    } else if (overlay.parentElement !== cell) {
      cell.appendChild(overlay);           // theme re-rendered – re-insert
    }

    // hide the real image, un-hide any previous one
    if (primaryImage && primaryImage !== img) primaryImage.classList.remove('ps-img-hidden');
    primaryImage = img;
    primaryImage.classList.add('ps-img-hidden');
    return true;
  }

  /* ================================================= engine loading */
  function loadEngine(done, fail) {
    if (engineReady && window.PosterStudio3D) { done(); return; }
    if (!viewerSrc) { fail(new Error('viewer asset missing')); return; }

    var existing = document.querySelector('script[data-ps-3d-engine]');
    if (existing) {
      if (window.PosterStudio3D) { done(); return; }
      existing.addEventListener('load', done);
      existing.addEventListener('error', fail);
      return;
    }
    var s = document.createElement('script');
    s.src = viewerSrc;
    s.defer = true;
    s.dataset.ps3dEngine = '1';
    s.onload  = function () { engineReady = true; done(); };
    s.onerror = fail;
    document.head.appendChild(s);
  }

  var HOVER_LIMIT_DEG = 10;
  var DRAG_LIMIT_DEG = 35;
  var HOVER_LIMIT_RAD = HOVER_LIMIT_DEG * Math.PI / 180;
  var DRAG_LIMIT_RAD = DRAG_LIMIT_DEG * Math.PI / 180;

  /* Two features, one consistent mechanism, matching the FrameFox reference:
   *   1. Hover: moving the pointer over the canvas (no button pressed) gives
   *      a subtle tilt toward the cursor, capped at ±10°.
   *   2. Grab + drag: pressing and moving turns that into the full tilt,
   *      capped at ±35°, and keeps working even if the drag briefly leaves
   *      the canvas bounds (pointer capture).
   *   3. Leave: when the pointer exits the canvas and isn't dragging, the
   *      frame eases back to its resting/neutral pose.
   * Both are smoothed with the same exponential easing (no jitter, no
   * sudden acceleration), and it never moves on its own.
   *
   * The engine shipped two separate, competing rotation systems — native
   * OrbitControls drag handling, plus its own internal "hover-tilt" loop fed
   * by a window-level pointermove listener. Layering our own logic on top of
   * either of those caused the runaway/continuous spin reported earlier. So
   * instead we fully disable both of the engine's systems and drive the
   * camera ourselves, directly and predictably, reusing the engine's own
   * per-frame hook (applyHoverTilt) so nothing extra needs to run. Frame
   * geometry, materials, lighting, shadows, and zoom are untouched. */

  var tiltState = { targetX: 0, targetY: 0, dragging: false, hovering: false, lastX: 0, lastY: 0 };
  var tiltListenersBound = false;

  /* Idle "this is draggable" affordance: if the pose hasn't been touched for
   * a few seconds, gently tilt it ~10° left then right and show a small
   * hand-drag icon, purely as a hint. Any real hover/drag cancels it
   * immediately and it doesn't come back until the person leaves it alone
   * again. Reuses the same tiltState + easing the pointer interactions use,
   * so the motion is identically smooth — no separate animation system. */
  var IDLE_DELAY_MS = 3000;
  var HINT_TILT_DEG = 10;
  var HINT_TILT_RAD = HINT_TILT_DEG * Math.PI / 180;
  var HINT_STEP_MS = 700;
  var idleTimeoutId = null;
  var idleCycleTimeouts = [];

  function clearIdleCycle() {
    clearTimeout(idleTimeoutId);
    idleCycleTimeouts.forEach(clearTimeout);
    idleCycleTimeouts = [];
    if (idleHintEl) idleHintEl.classList.remove('is-active', 'is-left', 'is-right');
  }
  function scheduleIdleCheck() {
    clearTimeout(idleTimeoutId);
    idleTimeoutId = setTimeout(function () {
      if (!tiltState.hovering && !tiltState.dragging) runIdleHintCycle();
    }, IDLE_DELAY_MS);
  }
  function runIdleHintCycle() {
    if (tiltState.hovering || tiltState.dragging) return;
    if (idleHintEl) idleHintEl.classList.add('is-active', 'is-left');
    tiltState.targetY = -HINT_TILT_RAD;
    idleCycleTimeouts.push(setTimeout(function () {
      if (tiltState.hovering || tiltState.dragging) return;
      if (idleHintEl) idleHintEl.classList.replace('is-left', 'is-right');
      tiltState.targetY = HINT_TILT_RAD;
      idleCycleTimeouts.push(setTimeout(function () {
        if (tiltState.hovering || tiltState.dragging) return;
        tiltState.targetY = 0;
        if (idleHintEl) idleHintEl.classList.remove('is-active', 'is-left', 'is-right');
        idleCycleTimeouts.push(setTimeout(function () {
          if (!tiltState.hovering && !tiltState.dragging) runIdleHintCycle();   // repeat
        }, IDLE_DELAY_MS));
      }, HINT_STEP_MS));
    }, HINT_STEP_MS));
  }

  function bindTiltPointerHandlers() {
    if (tiltListenersBound || !canvasHost) return;
    tiltListenersBound = true;

    function updateTargetFromClient(clientX, clientY, limit) {
      var r = canvasHost.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var nx = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1));
      var ny = Math.max(-1, Math.min(1, ((clientY - r.top) / r.height) * 2 - 1));
      tiltState.targetY = nx * limit;
      tiltState.targetX = -ny * limit;
    }
    function isOverCanvas(clientX, clientY) {
      var r = canvasHost.getBoundingClientRect();
      return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    }
    function endDrag(e) {
      if (!tiltState.dragging) return;
      tiltState.dragging = false;
      canvasHost.style.cursor = 'grab';
      var cx = e && typeof e.clientX === 'number' ? e.clientX : tiltState.lastX;
      var cy = e && typeof e.clientY === 'number' ? e.clientY : tiltState.lastY;
      if (isOverCanvas(cx, cy)) { tiltState.hovering = true; updateTargetFromClient(cx, cy, HOVER_LIMIT_RAD); }
      else { tiltState.hovering = false; tiltState.targetX = 0; tiltState.targetY = 0; scheduleIdleCheck(); }
    }

    canvasHost.style.cursor = 'grab';
    canvasHost.addEventListener('pointerenter', function (e) {
      clearIdleCycle();
      tiltState.hovering = true;
      tiltState.lastX = e.clientX; tiltState.lastY = e.clientY;
      if (!tiltState.dragging) updateTargetFromClient(e.clientX, e.clientY, HOVER_LIMIT_RAD);
    });
    canvasHost.addEventListener('pointermove', function (e) {
      tiltState.lastX = e.clientX; tiltState.lastY = e.clientY;
      if (tiltState.dragging) updateTargetFromClient(e.clientX, e.clientY, DRAG_LIMIT_RAD);
      else if (tiltState.hovering) updateTargetFromClient(e.clientX, e.clientY, HOVER_LIMIT_RAD);
    });
    canvasHost.addEventListener('pointerleave', function () {
      tiltState.hovering = false;
      if (!tiltState.dragging) { tiltState.targetX = 0; tiltState.targetY = 0; scheduleIdleCheck(); }   // back to normal
    });
    canvasHost.addEventListener('pointerdown', function (e) {
      clearIdleCycle();
      tiltState.dragging = true;
      tiltState.hovering = true;
      canvasHost.style.cursor = 'grabbing';
      try { canvasHost.setPointerCapture(e.pointerId); } catch (err) {}
      updateTargetFromClient(e.clientX, e.clientY, DRAG_LIMIT_RAD);
    });
    canvasHost.addEventListener('pointerup', endDrag);
    canvasHost.addEventListener('pointercancel', endDrag);

    scheduleIdleCheck();   // arm the very first idle hint after initial load
  }

  function configureTiltRotate(v) {
    if (!v) return;
    bindTiltPointerHandlers();          // one-time; canvasHost outlives any single viewer
    if (v.__ps_tiltConfigured) return;
    v.__ps_tiltConfigured = true;

    // CRITICAL: the engine's own hover-tilt system attaches pointer listeners
    // directly to the inner <canvas> (v.renderer.domElement) AND to this
    // same container (v.container === canvasHost), and its pointermove/
    // pointerdown handlers call stopPropagation(). Left in place, those
    // listeners fire first (registered first, during the engine's own
    // construction) and silently swallow the event before it can bubble up
    // to our own listeners below — which is exactly why hover only updated
    // once on entry, and why drag never started at all. Unbind them all.
    var engineHost = v.renderer && v.renderer.domElement;
    var engineEls = [engineHost, v.container].filter(Boolean);
    var offEl = function (el, type, fn) { if (el && fn) { try { el.removeEventListener(type, fn); } catch (e) {} } };
    var offWin = function (type, fn) { if (fn) { try { window.removeEventListener(type, fn); } catch (e) {} } };
    engineEls.forEach(function (el) {
      offEl(el, 'pointermove', v.onPointerMove);
      offEl(el, 'pointerenter', v.onPointerEnter);
      offEl(el, 'pointerleave', v.onPointerLeave);
      offEl(el, 'pointerdown', v.onPointerDown);
      offEl(el, 'pointerup', v.onPointerUp);
      offEl(el, 'pointercancel', v.onPointerCancel);
      offEl(el, 'mousemove', v.onPointerMove);
      offEl(el, 'mouseenter', v.onPointerEnter);
      offEl(el, 'mouseleave', v.onPointerLeave);
    });
    offWin('pointermove', v.onWindowPointerMove);
    offWin('pointerup', v.onWindowPointerUp);
    offWin('pointercancel', v.onWindowPointerUp);
    offWin('pointerup', v.onPointerUp);
    offWin('pointercancel', v.onPointerCancel);

    // Fully retire the engine's own rotation systems for this instance so
    // nothing competes with our single pointer-driven tilt.
    if (v.hoverOrbit) { v.hoverOrbit.active = false; v.hoverOrbit.dragging = false; }
    v.clampCameraOrbit = function () {};
    if (v.controls) {
      v.controls.enableRotate = false;   // we drive the camera directly below
      v.controls.enablePan = false;
      v.controls.autoRotate = false;
      // zoom left exactly as configured previously — not part of this fix
    }

    v.__ps_curX = 0;
    v.__ps_curY = 0;
    v.__ps_orbitRadius = (v.camera && v.controls && v.controls.target)
      ? v.camera.position.distanceTo(v.controls.target) : null;

    // Reuses the engine's existing per-frame hook — no extra animation loop.
    v.applyHoverTilt = function (dt) {
      var cam = this.camera, target = this.controls && this.controls.target;
      if (!cam || !target) return;
      var ease = 1 - Math.exp(-12 * Math.max(dt || 0.016, 0.001));   // smooth, frame-rate independent
      this.__ps_curY += (tiltState.targetY - this.__ps_curY) * ease;
      this.__ps_curX += (tiltState.targetX - this.__ps_curX) * ease;
      var R = this.__ps_orbitRadius || cam.position.distanceTo(target) || 1;
      var theta = this.__ps_curY, phi = Math.PI / 2 - this.__ps_curX;
      var sinPhi = Math.sin(phi);
      cam.position.set(
        target.x + R * sinPhi * Math.sin(theta),
        target.y + R * Math.cos(phi),
        target.z + R * sinPhi * Math.cos(theta)
      );
      cam.lookAt(target);
    };
  }

  /* Build the viewer once, then only updateImage() afterwards. */
  function ensureViewer() {
    if (viewerBuilding) return;
    var payload = currentPayload();
    if (!payload) { showError('No image available yet.'); return; }

    // already built → hand off to a full rebuild instead of patching in place
    if (viewer) { rebuildViewer(payload); return; }

    if (!hasWebGL()) { showError('Your browser does not support this 3D preview.'); return; }

    viewerBuilding = true;
    showError('');
    showLoading(true);

    clearTimeout(loadTimer);
    loadTimer = setTimeout(function () {
      if (!viewerBuilding) return;
      viewerBuilding = false;
      showError('3D preview timed out. Please refresh the page.');
    }, 20000);

    engineLoading = true;
    loadEngine(function () {
      engineLoading = false;
      try {
        viewer = window.PosterStudio3D.createViewer(canvasHost, {
          imageUrl: payload.url,
          imageWidth: payload.width,
          imageHeight: payload.height,
          frameId: payload.frameId,
          frameColor: payload.frameColor,
          frameTextureUrl: payload.frameTextureUrl,
          naturalFramePortraitUrl: payload.naturalFramePortraitUrl,
          naturalFrameLandscapeUrl: payload.naturalFrameLandscapeUrl,
          matting: payload.matting,
          printWidthCm: payload.printWidthCm,
          printHeightCm: payload.printHeightCm,
          title: payload.alt,
          enableHover: true,
          enableTilt: true,
          frameRoughness: 0.8,
          frameMetalness: 0.1,
          onReady: function () {
            viewerBuilding = false;
            clearTimeout(loadTimer);
            showLoading(false);
            if (viewer && typeof viewer.resize === 'function') viewer.resize();
            configureTiltRotate(viewer);   // hover + grab-drag tilt, clamped ±35°, resets on leave
          }
        });
        lastSignature = signatureOf(payload);
        // safety: if onReady never fires, clear the spinner anyway
        setTimeout(function () { if (viewer) { viewerBuilding = false; showLoading(false); clearTimeout(loadTimer); } }, 4000);
      } catch (err) {
        viewerBuilding = false;
        clearTimeout(loadTimer);
        showError('3D preview could not start on this page.');
        // eslint-disable-next-line no-console
        console.error('Poster Studio:', err);
      }
    }, function () {
      engineLoading = false;
      viewerBuilding = false;
      clearTimeout(loadTimer);
      showError('3D preview asset could not load.');
    });
  }

  /* On any variant/frame change we tear the viewer down completely and build
   * a fresh one from the current payload — rather than patching the existing
   * scene in place. This guarantees the new frame image/color/depth apply
   * correctly every time (no stale state can carry over), at the cost of a
   * brief loader while it rebuilds. No page reload involved. */
  function rebuildViewer(payload) {
    payload = payload || currentPayload();
    if (!payload) return;
    var sig = signatureOf(payload);
    if (sig === lastSignature && viewer) return;   // nothing actually changed

    showError('');
    showLoading(true);
    if (hintEl) hintEl.classList.remove('is-hidden');

    if (viewer) {
      try { if (typeof viewer.dispose === 'function') viewer.dispose(); } catch (e) {}
      viewer = null;
    }
    if (canvasHost) canvasHost.innerHTML = '';   // drop the old canvas/DOM completely
    viewerBuilding = false;
    lastSignature = '';                          // force a genuine fresh build
    ensureViewer();
  }

  /* ================================================= reconcile loop */
  function reconcile() {
    if (!enabled) return;
    if (!attachOverlay()) return;         // no product image on the page yet
    var payload = currentPayload();
    if (!payload) return;
    if (!viewer) { ensureViewer(); return; }
    var sig = signatureOf(payload);
    if (sig !== lastSignature) { rebuildViewer(payload); return; }
    if (typeof viewer.resize === 'function') viewer.resize();
  }

  var reconcileScheduled = false;
  function scheduleReconcile() {
    if (reconcileScheduled) return;
    reconcileScheduled = true;
    setTimeout(function () { reconcileScheduled = false; reconcile(); }, 60);
  }

  function bindEvents() {
    // theme variant / slideshow events
    ['variant:update', 'variant:change', 'product:variant-change', 'variant:selected',
     'slideChanged', 'slideshow:change', 'slideshow:changed', 'slidechange'
    ].forEach(function (n) { document.addEventListener(n, scheduleReconcile, true); });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('variant-picker, variant-selects, product-form') ||
          t.name === 'id' || (t.name && t.name.indexOf('options') === 0)) {
        scheduleReconcile();
        setTimeout(scheduleReconcile, 250);
      }
    }, true);

    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('media-gallery, product-media-gallery, slideshow-component, ' +
                    'slideshow-slide, .product__media-wrapper, .product-gallery, ' +
                    '[data-product-media-gallery], variant-picker, variant-selects')) {
        setTimeout(scheduleReconcile, 80);
        setTimeout(scheduleReconcile, 250);
      }
    }, true);

    window.addEventListener('popstate', scheduleReconcile);

    document.addEventListener('visibilitychange', function () {
      if (!viewer) return;
      if (document.hidden) { if (viewer.pause) viewer.pause(); }
      else if (viewer.resume) viewer.resume();
    });

    window.addEventListener('resize', function () {
      if (viewer && viewer.resize) viewer.resize();
    });
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(scheduleReconcile);
    observer.observe(document.body, {
      childList: true, subtree: true,
      attributes: true, attributeFilter: ['src', 'srcset', 'class', 'hidden', 'aria-hidden']
    });
  }

  /* ================================================= teardown */
  function teardown() {
    enabled = false;
    if (observer) observer.disconnect();
    if (pollTimer) clearInterval(pollTimer);
    clearTimeout(loadTimer);
    if (viewer && viewer.dispose) { try { viewer.dispose(); } catch (e) {} }
    if (primaryImage) primaryImage.classList.remove('ps-img-hidden');
    if (mediaCell && cellPrevPosition !== null) mediaCell.style.position = cellPrevPosition;
    if (overlay) overlay.remove();
    var data = document.getElementById('ps-product-data');
    if (data) data.remove();
    root.remove();
  }

  /* ================================================= boot */
  function start() {
    loadProductData();
    bindEvents();
    startObserver();

    // keep trying to find the gallery image (themes lazy-render it)
    var tries = 0;
    pollTimer = setInterval(function () {
      reconcile();
      tries++;
      // once the viewer exists, slow the poll right down (just keeps things synced)
      if (viewer && tries > 8) { clearInterval(pollTimer); pollTimer = setInterval(reconcile, 1000); }
      if (tries > 80 && !primaryImage) clearInterval(pollTimer);   // give up after ~20s
    }, 250);
    reconcile();
  }

  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }

  /* Respect an app "enabled: false" setting if the backend answers; never
   * block on it. */
  if (productId && backendBase) {
    var settled = false;
    var go = function (data) {
      if (settled) return; settled = true;
      if (data && data.enabled === false) { teardown(); return; }
      boot();
    };
    fetch(backendBase + '/api/settings?product_id=' + encodeURIComponent(productId),
          { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : { enabled: true }; })
      .then(go)
      .catch(function () { go({ enabled: true }); });
    // don't wait forever for the proxy
    setTimeout(function () { go({ enabled: true }); }, 2500);
  } else {
    boot();
  }
})();