(function () {
  'use strict';

  var ENABLE_3D_VIEWER = true;
  var root = document.getElementById('ps-root');
  if (!root || !ENABLE_3D_VIEWER) return;

  var viewerSrc = root.dataset.viewerSrc || '';
  var productTitle = root.dataset.title || 'Product artwork';
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

  var HOST_SELECTORS = [
    '[data-testid="product-information-media"]',
    '.product-information__media',
    'product-media-gallery',
    'media-gallery',
    '.product__media-wrapper',
    '.product__media-list',
    '.product-gallery',
    '.product__photos',
    '[data-product-media-gallery]',
    '[data-product-images]',
    '.product__media'
  ];

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
    if (src.indexOf('//') === 0) src = 'https:' + src;
    return src;
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

    findGalleryHosts().forEach(function (host) {
      host.querySelectorAll('img').forEach(function (img) {
        if (seen.indexOf(img) >= 0 || !isProductImage(img, host)) return;
        seen.push(img);

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
    if (!primaryImage) return null;
    var rect = primaryImage.getBoundingClientRect();
    return {
      url: imageSrc(primaryImage),
      width: primaryImage.naturalWidth || Math.round(rect.width) || 1,
      height: primaryImage.naturalHeight || Math.round(rect.height) || 1,
      alt: primaryImage.alt || productTitle
    };
  }

  function imageRect() {
    if (!primaryImage || !document.body.contains(primaryImage) || !isVisible(primaryImage)) return null;
    var rect = primaryImage.getBoundingClientRect();
    if (rect.width < 150 || rect.height < 150) return null;
    return rect;
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
      '<div class="ps-3d-canvas" role="img" aria-label="' + escapeHtml(productTitle) + ' as an interactive 3D image"></div>',
      '<div class="ps-3d-loading" hidden>Loading 3D...</div>',
      '<div class="ps-3d-error" hidden>3D preview could not load for this image.</div>'
    ].join('');
    document.body.appendChild(shell);

    return shell;
  }

  function positionViewerUi() {
    var rect = imageRect();
    var usable = isRectUsable(rect);
    var btn = toggleButton;

    if (btn) btn.hidden = true;
    if (!usable) return;

    if (btn) {
      btn.style.left = Math.max(8, Math.round(rect.right - 56)) + 'px';
      btn.style.top = Math.max(8, Math.round(rect.top + 12)) + 'px';
    }

    if (shell && !shell.hidden) {
      shell.style.left = Math.round(rect.left) + 'px';
      shell.style.top = Math.round(rect.top) + 'px';
      shell.style.width = Math.round(rect.width) + 'px';
      shell.style.height = Math.round(rect.height) + 'px';
      if (viewerApi && viewerApi.resize) viewerApi.resize();
    }
  }

  function setLoading(on) {
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
    positionViewerUi();
  }

  function syncOpenViewerImage() {
    if (!viewerApi || !shell || shell.hidden) return;
    var payload = currentImagePayload();
    if (payload && payload.url && viewerApi.updateImage) viewerApi.updateImage(payload);
  }

  function enhanceGallery() {
    var candidates = collectCandidates();
    if (!candidates.length) {
      if (toggleButton) toggleButton.hidden = true;
      return false;
    }

    var oldImage = primaryImage;
    var nextImage = candidates[0].img;
    if (autoOpenStarted && primaryImage && document.body.contains(primaryImage)) {
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
    if (!autoOpenStarted) {
      autoOpenStarted = true;
      openViewer();
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
      'slideshow:slideChanged'
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
