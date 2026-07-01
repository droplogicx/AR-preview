(function () {
  'use strict';

  var ENABLE_3D_VIEWER = true;
  var root = document.getElementById('ps-root');
  if (!root || !ENABLE_3D_VIEWER) return;

  var viewerSrc = root.dataset.viewerSrc || '';
  var productTitle = root.dataset.title || 'Product artwork';
  var productId = root.dataset.productId || '';
  var backendPreview = getAppProxyBase();
  var productData = null;
  var posterImageSettings = {
    imageMode: 'default',
    imageAlt: '',
    imageUrl: '',
    imageThumb: '',
    imageWidth: 0,
    imageHeight: 0
  };
  var scanTimer = null;
  var watchTimer = null;
  var observer = null;
  var primaryImage = null;
  var viewerApi = null;
  var viewerLoading = false;
  var autoOpenStarted = false;
  var threeLoaded = false;
  var toggleButton = null;
  var shell = null;
  var shellHost = null;
  var shellHostPreviousPosition = '';
  var viewerLoadTimer = null;
  var lastViewerPayloadSignature = '';
  var VARIANT_META = { size: null, frame: null, border: null };
  var FRAME_COLORS = {
    none: 'transparent',
    'natural-timber': '#caa375',
    white: '#e9e4d8',
    black: '#1a1a1a'
  };
  var FRAME_SWATCH_IMAGES = {
    none: root.dataset.swatchUnframed || '',
    'natural-timber': root.dataset.swatchNatural || '',
    white: root.dataset.swatchWhite || '',
    black: root.dataset.swatchBlack || ''
  };
  var NATURAL_FRAME_REFERENCES = {
    portrait: root.dataset.swatchNatural || '',
    landscape: root.dataset.swatchNaturalLandscape || root.dataset.swatchNatural || ''
  };

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

  function removePosterStudioDom() {
    closeViewer();
    if (observer) observer.disconnect();
    if (scanTimer) clearTimeout(scanTimer);
    if (watchTimer) clearInterval(watchTimer);
    if (toggleButton) toggleButton.remove();
    if (shell) shell.remove();
    var data = document.getElementById('ps-product-data');
    if (data) data.remove();
    root.remove();
  }

  function clearViewerLoadTimer() {
    if (viewerLoadTimer) clearTimeout(viewerLoadTimer);
    viewerLoadTimer = null;
  }

  function getAppProxyBase() {
    var base = (root.dataset.backend || '').replace(/\/$/, '');
    return base || '/apps/ar-preview';
  }

  function toSecureUrl(url) {
    if (!url) return '';
    url = String(url).trim();
    if (url.indexOf('//') === 0) url = 'https:' + url;
    if (url.indexOf('http://') === 0) url = 'https://' + url.slice(7);
    return url;
  }

  function comparableUrl(url) {
    url = toSecureUrl(url);
    if (!url) return '';
    try {
      var parsed = new URL(url, window.location.href);
      parsed.protocol = 'https:';
      parsed.search = '';
      return parsed.hostname.toLowerCase() + parsed.pathname.toLowerCase();
    } catch (e) {
      return url.replace(/^https?:/i, '').split('?')[0].toLowerCase();
    }
  }

  function loadProductData() {
    var el = document.getElementById('ps-product-data');
    if (!el) return;
    try {
      productData = JSON.parse(el.textContent);
      identifyVariantOptions();
    } catch (e) {
      productData = null;
    }
  }

  function normOptName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function parseSizeValue(str) {
    var s = String(str || '').trim();
    var dimMatch = s.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (!dimMatch) return null;
    return {
      label: (s.match(/^([A-Za-z0-9]+)/) || [null, s])[1],
      value: s,
      w: parseFloat(dimMatch[1]),
      h: parseFloat(dimMatch[2])
    };
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
    if (/white border|with white|with border|border/i.test(s)) return '1';
    return 'none';
  }

  function identifyVariantOptions() {
    VARIANT_META = { size: null, frame: null, border: null };
    if (!productData || !productData.options) return;
    productData.options.forEach(function (name, index) {
      var n = normOptName(name);
      if (/size|dimension|format/.test(n)) {
        VARIANT_META.size = { name: name, index: index };
      } else if (/border/.test(n)) {
        VARIANT_META.border = { name: name, index: index };
      } else if (/frame|mount|style|finish|print/.test(n)) {
        VARIANT_META.frame = { name: name, index: index };
      }
    });
  }

  function selectedVariantId() {
    var input = document.querySelector('product-form input[name="id"]') ||
      document.querySelector('product-form select[name="id"]') ||
      document.querySelector('form[action*="/cart/add"] input[name="id"]') ||
      document.querySelector('form[action*="/cart/add"] select[name="id"]') ||
      document.querySelector('[name="id"]');
    if (input && input.value) return String(input.value || '');
    try {
      return new URL(window.location.href).searchParams.get('variant') || '';
    } catch (e) {
      return '';
    }
  }

  function selectedVariant() {
    var id = selectedVariantId();
    if (!productData || !productData.variants || !productData.variants.length) return null;
    if (!id) return productData.variants[0];
    for (var i = 0; i < productData.variants.length; i++) {
      if (String(productData.variants[i].id) === id) return productData.variants[i];
    }
    return null;
  }

  function variantValue(variant, meta) {
    if (!variant || !meta || !variant.options) return '';
    return variant.options[meta.index] || '';
  }

  function selectedVariantFramePayload() {
    var variant = selectedVariant();
    var size = parseSizeValue(variantValue(variant, VARIANT_META.size));
    var frameValue = variantValue(variant, VARIANT_META.frame);
    var borderValue = variantValue(variant, VARIANT_META.border);
    var frameId = parseFrameId(frameValue);
    var matting = frameId === 'none' ? 'none' : parseBorderMat(borderValue);

    return {
      frameId: frameId,
      frameColor: FRAME_COLORS[frameId] || FRAME_COLORS['natural-timber'],
      frameTextureUrl: FRAME_SWATCH_IMAGES[frameId] || '',
      naturalFramePortraitUrl: NATURAL_FRAME_REFERENCES.portrait,
      naturalFrameLandscapeUrl: NATURAL_FRAME_REFERENCES.landscape,
      frameValue: frameValue,
      matting: matting,
      borderValue: borderValue,
      printWidthCm: size ? size.w : 0,
      printHeightCm: size ? size.h : 0,
      sizeValue: size ? size.value : ''
    };
  }

  function withVariantFrame(payload) {
    if (!payload) return payload;
    var variantPayload = selectedVariantFramePayload();
    Object.keys(variantPayload).forEach(function (key) {
      payload[key] = variantPayload[key];
    });
    return payload;
  }

  function viewerPayloadSignature(payload) {
    if (!payload) return '';
    return [
      payload.url || '',
      payload.frameId || '',
      payload.frameColor || '',
      payload.frameTextureUrl || '',
      payload.naturalFramePortraitUrl || '',
      payload.naturalFrameLandscapeUrl || '',
      payload.matting || '',
      payload.printWidthCm || '',
      payload.printHeightCm || ''
    ].join('|');
  }

  function findProductImageByAlt(alt) {
    var normalizedAlt = String(alt || '').trim().toLowerCase();
    if (!normalizedAlt || !productData || !productData.images) return null;

    var requestedAlts = normalizedAlt
      .split(',')
      .map(function (value) { return String(value || '').trim().toLowerCase(); })
      .filter(function (value) { return value; });

    if (!requestedAlts.length) return null;

    for (var i = 0; i < productData.images.length; i++) {
      var image = productData.images[i];
      var imageAlt = String(image.alt || '').trim().toLowerCase();
      if (!imageAlt) continue;

      var imageAltTokens = imageAlt
        .split(',')
        .map(function (value) { return String(value || '').trim().toLowerCase(); })
        .filter(function (value) { return value; });

      if (requestedAlts.some(function (requestedAlt) { return imageAltTokens.indexOf(requestedAlt) >= 0 || imageAlt === requestedAlt; })) {
        return image;
      }
    }
    return null;
  }

  function configuredImagePayload() {
    if (!posterImageSettings || posterImageSettings.imageMode !== 'specific') return null;

    var matched = findProductImageByAlt(posterImageSettings.imageAlt);
    var url = matched ? matched.src : posterImageSettings.imageUrl;
    url = toSecureUrl(url);
    if (!url) return null;

    return withVariantFrame({
      url: url,
      width: (matched && matched.width) || posterImageSettings.imageWidth || parseFloat(root.dataset.imgW || '0') || 1,
      height: (matched && matched.height) || posterImageSettings.imageHeight || parseFloat(root.dataset.imgH || '0') || 1,
      alt: (matched && matched.alt) || posterImageSettings.imageAlt || productTitle
    });
  }

  function findGalleryHosts() {
    var found = [];
    var seen = [];

    HOST_SELECTORS.forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        if (!el || seen.indexOf(el) >= 0) return;
        seen.push(el);
        found.push(el);
      });
    });

    return found;
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function isVisible(el) {
    var node = el;
    while (node && node !== document.body) {
      if (node.hidden || node.getAttribute('aria-hidden') === 'true') return false;
      var style = getComputedStyle(node);
      if (style.display === 'none') return false;
      if (node.classList.contains('ps-primary-image-hidden')) {
        node = node.parentElement;
        continue;
      }
      if (style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) return false;
      node = node.parentElement;
    }
    return true;
  }

  function imageSrc(img) {
    var src = img.currentSrc || img.src || img.getAttribute('src') || img.getAttribute('data-src') || '';
    return toSecureUrl(src);
  }

  function isProductImage(img, host) {
    if (!img || !host || !host.contains(img)) return false;
    if (img.closest('#ps-root, script, template, .ps-3d-viewer-shell, .ps-3d-toggle')) return false;
    if (!isVisible(img)) return false;

    var rect = img.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) return false;

    var src = imageSrc(img);
    if (!src || /sprite|icon|logo|placeholder|transparent|blank/i.test(src)) return false;

    return true;
  }

  function collectCandidates() {
    var candidates = [];
    var seen = [];
    var requiredAlt = posterImageSettings.imageMode === 'specific'
      ? String(posterImageSettings.imageAlt || '').trim().toLowerCase()
      : '';
    var requiredUrl = posterImageSettings.imageMode === 'specific'
      ? comparableUrl((findProductImageByAlt(posterImageSettings.imageAlt) || {}).src || posterImageSettings.imageUrl)
      : '';

    findGalleryHosts().forEach(function (host) {
      host.querySelectorAll('img').forEach(function (img) {
        if (seen.indexOf(img) >= 0 || !isProductImage(img, host)) return;
        seen.push(img);
        if (requiredAlt || requiredUrl) {
          var candidateAlt = String(img.alt || '').trim().toLowerCase();
          var candidateUrl = comparableUrl(imageSrc(img));
          if (candidateAlt !== requiredAlt && candidateUrl !== requiredUrl) return;
        }

        var rect = img.getBoundingClientRect();
        candidates.push({
          img: img,
          area: rect.width * rect.height,
          top: rect.top,
          left: rect.left
        });
      });
    });

    candidates.sort(function (a, b) {
      if (Math.abs(b.area - a.area) > 2000) return b.area - a.area;
      if (Math.abs(a.top - b.top) > 8) return a.top - b.top;
      return a.left - b.left;
    });

    return candidates;
  }

  function currentImagePayload() {
    var configured = configuredImagePayload();
    if (configured) return configured;
    if (!primaryImage) return null;
    var rect = primaryImage.getBoundingClientRect();
    return withVariantFrame({
      url: imageSrc(primaryImage),
      width: primaryImage.naturalWidth || Math.round(rect.width) || 1,
      height: primaryImage.naturalHeight || Math.round(rect.height) || 1,
      alt: primaryImage.alt || productTitle
    });
  }

  function imageRect() {
    if (!primaryImage || !document.body.contains(primaryImage) || !isVisible(primaryImage)) return null;
    var rect = primaryImage.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) return null;
    return rect;
  }

  function imageFrameElement() {
    if (!primaryImage) return null;
    var preferred = primaryImage.closest(
      '.product__media, .product__media-item, .product-media-container, .product-gallery__media, ' +
      'slideshow-slide, .slideshow__slide, .slider__slide, .media'
    );
    var imgRect = primaryImage.getBoundingClientRect();
    var node = preferred || primaryImage.parentElement;

    while (node && node !== document.body) {
      var rect = node.getBoundingClientRect();
      if (
        rect.width >= imgRect.width * 0.9 &&
        rect.height >= imgRect.height * 0.9 &&
        rect.width <= imgRect.width * 1.6 &&
        rect.height <= imgRect.height * 1.6
      ) {
        return node;
      }
      if (preferred) break;
      node = node.parentElement;
    }

    return primaryImage.parentElement || null;
  }

  function attachShellToImageFrame() {
    if (!shell || !primaryImage) return false;
    var host = imageFrameElement();
    if (!host) return false;

    if (shellHost && shellHost !== host && shellHostPreviousPosition !== null) {
      shellHost.style.position = shellHostPreviousPosition;
    }

    if (shellHost !== host) {
      shellHost = host;
      shellHostPreviousPosition = host.style.position || '';
      var style = getComputedStyle(host);
      if (style.position === 'static') host.style.position = 'relative';
      host.appendChild(shell);
    }

    return true;
  }

  function afterPageLoad(done) {
    if (document.readyState === 'complete') {
      setTimeout(done, 0);
      return;
    }
    window.addEventListener('load', done, { once: true });
  }

  function isRectUsable(rect) {
    if (!rect) return false;
    return rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
  }

  function ensureToggle() {
    if (toggleButton) return toggleButton;

    toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'ps-3d-toggle';
    toggleButton.setAttribute('aria-label', 'View this product in 3D');
    toggleButton.innerHTML = '<span aria-hidden="true">3D</span>';
    toggleButton.addEventListener('click', openViewer);
    document.body.appendChild(toggleButton);
    return toggleButton;
  }

  function ensureShell() {
    if (shell) return shell;

    shell = document.createElement('div');
    shell.className = 'ps-3d-viewer-shell';
    shell.hidden = true;
    shell.innerHTML = [
      '<button type="button" class="ps-3d-close" aria-label="Close 3D preview">x</button>',
      '<div class="ps-3d-canvas" role="img" aria-label="' + escapeHtml(productTitle) + ' as an interactive 3D image"></div>',
      '<div class="ps-3d-loading" hidden><div class="ps-3d-loader-bar" aria-hidden="true"></div></div>',
      '<div class="ps-3d-error" hidden>3D preview could not load for this image.</div>'
    ].join('');
    document.body.appendChild(shell);
    shell.querySelector('.ps-3d-close').addEventListener('click', closeViewer);

    return shell;
  }

  function positionViewerUi() {
    var rect = imageRect();
    var usable = isRectUsable(rect);
    var btn = toggleButton;

    if (btn) btn.hidden = !usable || (shell && !shell.hidden);
    if (!usable) return;

    if (btn) {
      btn.style.left = Math.max(8, Math.round(rect.right - 56)) + 'px';
      btn.style.top = Math.max(8, Math.round(rect.top + 12)) + 'px';
    }

    if (shell && !shell.hidden && attachShellToImageFrame()) {
      var hostRect = shellHost.getBoundingClientRect();
      shell.style.left = Math.round(rect.left - hostRect.left) + 'px';
      shell.style.top = Math.round(rect.top - hostRect.top) + 'px';
      shell.style.width = Math.round(rect.width) + 'px';
      shell.style.height = Math.round(rect.height) + 'px';
      if (viewerApi && viewerApi.resize) viewerApi.resize();
    }
  }

  function setLoading(on) {
    if (!on) clearViewerLoadTimer();
    var loader = shell && shell.querySelector('.ps-3d-loading');
    if (loader) loader.hidden = !on;
  }

  function setError(message) {
    var error = shell && shell.querySelector('.ps-3d-error');
    if (!error) return;
    error.textContent = message || '3D preview could not load for this image.';
    error.hidden = !message;
  }

  function hasWebGL() {
    try {
      var canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  function load3DEngine(done, fail) {
    if (threeLoaded && window.PosterStudio3D) {
      done();
      return;
    }
    if (!viewerSrc) {
      fail(new Error('3D viewer asset missing'));
      return;
    }

    var existing = document.querySelector('script[data-ps-3d-engine]');
    if (existing) {
      existing.addEventListener('load', function () { done(); });
      existing.addEventListener('error', fail);
      return;
    }

    var script = document.createElement('script');
    script.src = viewerSrc;
    script.defer = true;
    script.dataset.ps3dEngine = '1';
    script.onload = function () {
      threeLoaded = true;
      done();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }

  function openViewer() {
    if (!primaryImage || viewerLoading) return;
    var payload = currentImagePayload();
    var rect = imageRect();
    if (!payload || !payload.url || !isRectUsable(rect)) return;
    lastViewerPayloadSignature = viewerPayloadSignature(payload);

    ensureShell();
    shell.hidden = false;
    shell.classList.add('is-open');
    document.documentElement.classList.add('ps-3d-open');

    if (primaryImage) {
      primaryImage.classList.add('ps-primary-image-hidden');
    }

    // Surface toggle removed; viewer defaults to the glossy glass surface.

    setError('');
    setLoading(true);
    positionViewerUi();
    viewerLoading = true;
    clearViewerLoadTimer();
    viewerLoadTimer = setTimeout(function () {
      if (!viewerLoading) return;
      setLoading(false);
      viewerLoading = false;
      positionViewerUi();
    }, 12000);

    if (!hasWebGL()) {
      setLoading(false);
      setError('Your browser does not support this 3D preview.');
      viewerLoading = false;
      return;
    }

    var canvasHost = shell.querySelector('.ps-3d-canvas');
    load3DEngine(function () {
      var markReady = function () {
        setLoading(false);
        viewerLoading = false;
        positionViewerUi();
      };

      try {
        if (!viewerApi) {
          viewerApi = window.PosterStudio3D.createViewer(canvasHost, {
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
            onReady: markReady
          });
        } else if (viewerApi.updateImage) {
          viewerApi.updateImage(payload);
          if (viewerApi.resume) viewerApi.resume();
        }
      } catch (e) {
        setError('3D preview could not start on this page.');
        setLoading(false);
        viewerLoading = false;
        positionViewerUi();
      }
    }, function () {
      setLoading(false);
      setError('3D preview asset could not load.');
      viewerLoading = false;
    });
  }

  function closeViewer() {
    if (primaryImage) {
      primaryImage.classList.remove('ps-primary-image-hidden');
    }
    if (shell) {
      shell.hidden = true;
      shell.classList.remove('is-open');
    }
    document.documentElement.classList.remove('ps-3d-open');
    setLoading(false);
    setError('');
    if (viewerApi && viewerApi.pause) viewerApi.pause();
    clearViewerLoadTimer();
    positionViewerUi();
  }

  function syncOpenViewerImage() {
    if (!viewerApi || !shell || shell.hidden) return;
    var payload = currentImagePayload();
    if (payload && payload.url && viewerApi.updateImage) {
      var signature = viewerPayloadSignature(payload);
      if (signature === lastViewerPayloadSignature) return;
      lastViewerPayloadSignature = signature;
      setError('');
      setLoading(true);
      viewerLoading = true;
      clearViewerLoadTimer();
      viewerLoadTimer = setTimeout(function () {
        if (!viewerLoading) return;
        setLoading(false);
        viewerLoading = false;
        positionViewerUi();
      }, 12000);
      viewerApi.updateImage(payload);
      if (viewerApi.resume) viewerApi.resume();
    }
  }

  function enhanceGallery() {
    var candidates = collectCandidates();
    if (!candidates.length) {
      if (toggleButton) toggleButton.hidden = true;
      return false;
    }

    var oldImage = primaryImage;
    var nextImage = candidates[0].img;
    if (shell && !shell.hidden && primaryImage && document.body.contains(primaryImage)) {
      nextImage = primaryImage;
    }
    primaryImage = nextImage;

    if (shell && !shell.hidden) {
      if (oldImage && oldImage !== primaryImage) {
        oldImage.classList.remove('ps-primary-image-hidden');
      }
      if (primaryImage) {
        primaryImage.classList.add('ps-primary-image-hidden');
      }
    }

    positionViewerUi();
    syncOpenViewerImage();
    ensureToggle();
    positionViewerUi();
    if (!autoOpenStarted) {
      autoOpenStarted = true;
      afterPageLoad(function () {
        setTimeout(function () {
          if (!primaryImage || !document.body.contains(primaryImage)) return;
          openViewer();
        }, 350);
      });
    }
    return true;
  }

  function scheduleEnhance() {
    if (scanTimer) clearTimeout(scanTimer);
    scanTimer = setTimeout(enhanceGallery, 50);
  }

  function bindPageEvents() {
    [
      'variant:update',
      'variant:change',
      'product:variant-change',
      'variant:selected',
      'slideChanged',
      'slideshow:slideChanged',
      'slideshow:change',
      'slideshow:changed',
      'slidechange',
      'slideshowchange',
      'slideshow:slide:changed'
    ].forEach(function (name) {
      document.addEventListener(name, scheduleEnhance, true);
    });

    document.addEventListener('change', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      if (
        target.closest('variant-picker') ||
        target.closest('variant-selects') ||
        target.closest('product-form') ||
        target.name === 'id' ||
        (target.name && target.name.indexOf('options') === 0)
      ) {
        scheduleEnhance();
        setTimeout(scheduleEnhance, 220);
      }
    }, true);

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      if (
        target.closest('media-gallery') ||
        target.closest('product-media-gallery') ||
        target.closest('slideshow-component') ||
        target.closest('slideshow-slide') ||
        target.closest('.product__media-wrapper') ||
        target.closest('.product-gallery') ||
        target.closest('[data-product-media-gallery]') ||
        target.closest('variant-picker') ||
        target.closest('variant-selects')
      ) {
        scheduleEnhance();
        setTimeout(scheduleEnhance, 220);
      }
    }, true);

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeViewer();
    });

    document.addEventListener('visibilitychange', function () {
      if (!viewerApi) return;
      if (document.hidden && viewerApi.pause) viewerApi.pause();
      else if (!document.hidden && shell && !shell.hidden && viewerApi.resume) viewerApi.resume();
    });

    window.addEventListener('resize', positionViewerUi);
    window.addEventListener('scroll', positionViewerUi, { passive: true });
  }

  function startObserver() {
    if (observer || !document.body) return;
    observer = new MutationObserver(scheduleEnhance);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'class', 'style', 'hidden', 'aria-hidden']
    });
  }

  function init() {
    var tries = 0;
    function tick() {
      if (enhanceGallery()) {
        startObserver();
        bindPageEvents();
        if (watchTimer) clearInterval(watchTimer);
        watchTimer = setInterval(enhanceGallery, 800);
        return;
      }
      tries += 1;
      if (tries < 40) setTimeout(tick, 250);
    }
    tick();
  }

  function continueInit() {
    loadProductData();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (productId && backendPreview) {
    fetch(
      backendPreview + '/api/settings?product_id=' + encodeURIComponent(productId),
      { credentials: 'same-origin' }
    )
      .then(function (res) { return res.ok ? res.json() : { enabled: true }; })
      .then(function (data) {
        if (data && data.enabled === false) {
          removePosterStudioDom();
          return;
        }

        posterImageSettings = {
          imageMode: (data && data.imageMode) || 'default',
          imageAlt: (data && data.imageAlt) || '',
          imageUrl: toSecureUrl((data && data.imageUrl) || root.dataset.img || ''),
          imageThumb: toSecureUrl((data && data.imageThumb) || root.dataset.imgThumb || ''),
          imageWidth: parseFloat((data && data.imageWidth) || root.dataset.imgW || '0') || 0,
          imageHeight: parseFloat((data && data.imageHeight) || root.dataset.imgH || '0') || 0
        };

        continueInit();
      })
      .catch(function () { continueInit(); });
  } else {
    continueInit();
  }
})();
