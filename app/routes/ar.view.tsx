// GET /ar/view?glbPath=...&usdzPath=...&title=Product
// Android: model-viewer WebXR wall AR. iOS: GLB preview + native Quick Look (rel=ar).

import { normalizeModelPath } from "../ar-model-cache.server";

const APP_PROXY_PREFIX = "/apps/ar-preview";
const QL_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

function isIOSUserAgent(ua: string): boolean {
  return /iphone|ipad|ipod/i.test(ua);
}

function extractModelPath(raw: string): string {
  if (!raw) return "";
  const fromPath = normalizeModelPath(raw);
  if (fromPath) return fromPath;
  try {
    const url = raw.trim();
    if (url.startsWith("https://") || url.startsWith("http://") || url.startsWith("//")) {
      const full = url.startsWith("//") ? `https:${url}` : url;
      return normalizeModelPath(new URL(full).pathname) || "";
    }
  } catch {
    /* ignore */
  }
  return "";
}

function getAppPathPrefix(request: Request): string {
  const reqUrl = new URL(request.url);
  let prefix = (reqUrl.searchParams.get("path_prefix") || "").replace(/\/$/, "");

  if (!prefix) {
    const viewIdx = reqUrl.pathname.indexOf("/ar/view");
    if (viewIdx > 0) prefix = reqUrl.pathname.slice(0, viewIdx);
  }

  if (!prefix && (reqUrl.searchParams.get("shop") || reqUrl.pathname.startsWith("/proxy/"))) {
    prefix = APP_PROXY_PREFIX;
  }

  return prefix;
}

function resolveModelSrc(request: Request, raw: string): string {
  const path = extractModelPath(raw);
  if (!path) return "";
  return `${getAppPathPrefix(request)}${path}`;
}

const sharedStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      min-height: 100%; background: #0f0f0f; color: #fff;
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      padding: 28px 20px; min-height: 100vh; text-align: center;
    }
    h1 { font-size: 21px; font-weight: 600; margin-bottom: 10px; }
    .ar-status { color: rgba(255,255,255,.78); margin-bottom: 20px; max-width: 320px; min-height: 48px; }
    .ar-status.error { color: #ff8a8a; }
    .ar-preview-box {
      width: min(100%, 360px);
      height: min(52vw, 320px);
      max-height: 320px;
      aspect-ratio: 4 / 3;
      background: #1a1a1a;
      border-radius: 12px;
      margin-bottom: 20px;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
    }
    .ar-preview-box model-viewer {
      width: 100%;
      height: 100%;
      background: #1a1a1a;
      border-radius: 0;
      margin-bottom: 0;
      pointer-events: none;
      touch-action: none;
      --progress-bar-color: transparent;
    }
    model-viewer::part(default-ar-button) { display: none; }
    .ar-launch {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 260px; padding: 18px 32px; border: none;
      border-radius: 999px; background: #fff; color: #111;
      font: 700 17px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer; box-shadow: 0 8px 28px rgba(0,0,0,.35);
      touch-action: manipulation; text-decoration: none;
    }
    .ar-launch:disabled, .ar-launch.ar-disabled {
      opacity: .45; cursor: not-allowed; pointer-events: none;
    }
    .ar-hint { color: rgba(255,255,255,.5); font-size: 13px; margin-top: 18px; max-width: 300px; line-height: 1.5; }
    .ar-ql-img { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
`;

const previewViewerAttrs = `
    camera-orbit="0deg 90deg auto"
    min-camera-orbit="auto 90deg auto"
    max-camera-orbit="auto 90deg auto"
    field-of-view="28deg"
    interaction-prompt="none"
    disable-pan
    disable-zoom
    disable-tap
    touch-action="none"
    shadow-intensity="0"
    exposure="1.1"
    crossorigin="anonymous"
`;

const lockPreviewScript = `
      function lockPreview(mv) {
        if (!mv) return;
        mv.cameraOrbit = '0deg 90deg auto';
        mv.minCameraOrbit = 'auto 90deg auto';
        mv.maxCameraOrbit = 'auto 90deg auto';
        mv.fieldOfView = '28deg';
        mv.style.pointerEvents = 'none';
      }
`;

/** iOS: GLB preview + Apple-native Quick Look link (most reliable wall placement). */
function iosQuickLookHtml(glbSrc: string, usdzSrc: string, safeTitle: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <title>${safeTitle} — Wall AR</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>${sharedStyles}</style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p class="ar-status" id="ar-status">Loading preview…</p>

  <div class="ar-preview-box">
    <model-viewer
      id="ar-mv"
      alt="${safeTitle}"
      ${previewViewerAttrs}
    ></model-viewer>
  </div>

  <a rel="ar" class="ar-launch ar-disabled" id="ar-ql-link" href="#" aria-disabled="true">
    <img class="ar-ql-img" src="${QL_POSTER}" alt="" width="1" height="1"/>
    Place on Wall
  </a>
  <p class="ar-hint">Tap Place on Wall, scan a flat wall, then tap the wall to hang the frame.</p>

  <script>
    (function () {
      var glbSrc = ${JSON.stringify(glbSrc)};
      var usdzSrc = ${JSON.stringify(usdzSrc)};
      var status = document.getElementById('ar-status');
      var mv = document.getElementById('ar-mv');
      var link = document.getElementById('ar-ql-link');
${lockPreviewScript}

      function absUrl(src) {
        if (!src) return '';
        try { return new URL(src, window.location.href).href; }
        catch (e) { return src; }
      }

      var glbUrl = absUrl(glbSrc);
      var usdzUrl = absUrl(usdzSrc);

      function setStatus(msg, isError) {
        if (!status) return;
        status.textContent = msg;
        status.classList.toggle('error', !!isError);
      }

      function disableLink() {
        if (!link) return;
        link.classList.add('ar-disabled');
        link.setAttribute('aria-disabled', 'true');
        link.href = '#';
      }

      function enableLink() {
        if (!link || !usdzUrl) return;
        link.href = usdzUrl;
        link.classList.remove('ar-disabled');
        link.setAttribute('aria-disabled', 'false');
        setStatus('Ready — tap Place on Wall.');
      }

      function failLoad(httpStatus) {
        var msg = httpStatus
          ? 'Model not found (HTTP ' + httpStatus + '). Go back and tap View in AR again.'
          : 'Could not load AR model. Go back and tap View in AR again.';
        setStatus(msg, true);
        disableLink();
      }

      function bootPreview() {
        if (!usdzUrl) {
          failLoad(0);
          return;
        }
        fetch(usdzUrl, { method: 'HEAD', cache: 'no-store' })
          .then(function (res) {
            if (!res.ok && res.status !== 405) {
              failLoad(res.status);
              return;
            }
            enableLink();
            if (mv && glbUrl) {
              mv.src = glbUrl;
              mv.addEventListener('load', function () { lockPreview(mv); }, { once: true });
              mv.addEventListener('error', function () {}, { once: true });
            }
          })
          .catch(function () { failLoad(0); });
      }

      if (link) {
        link.addEventListener('click', function () {
          if (link.classList.contains('ar-disabled')) return;
          setStatus('Scan a wall, then tap to place. Pinch to zoom after placing.');
        });
      }

      bootPreview();
    })();
  </script>
</body>
</html>`;
}

/** Android: model-viewer WebXR / Scene Viewer wall AR (unchanged flow). */
function androidWallArHtml(glbSrc: string, safeTitle: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>${safeTitle} — Wall AR</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>${sharedStyles}</style>
</head>
<body>
  <h1>${safeTitle}</h1>
  <p class="ar-status" id="ar-status">Loading photo frame…</p>

  <div class="ar-preview-box">
    <model-viewer
      id="ar-mv"
      alt="${safeTitle}"
      ar
      ar-modes="webxr scene-viewer"
      ar-placement="wall"
      ar-scale="auto"
      ${previewViewerAttrs}
    ></model-viewer>
  </div>

  <button type="button" class="ar-launch" id="ar-launch-btn" disabled>Place on Wall</button>
  <p class="ar-hint">Point at a wall, tap to place, pinch to zoom.</p>

  <script>
    (function () {
      var glbSrc = ${JSON.stringify(glbSrc)};
      var mv = document.getElementById('ar-mv');
      var status = document.getElementById('ar-status');
      var btn = document.getElementById('ar-launch-btn');
      var ready = false;
${lockPreviewScript}

      function setStatus(msg, isError) {
        if (!status) return;
        status.textContent = msg;
        status.classList.toggle('error', !!isError);
      }

      function markReady() {
        ready = true;
        lockPreview(mv);
        if (btn) btn.disabled = false;
        if (mv && mv.canActivateAR === false) {
          setStatus('Update Chrome and Google Play Services for AR, then try again.', true);
          return;
        }
        setStatus('Ready — tap Place on Wall.');
      }

      function failLoad(httpStatus) {
        var msg = httpStatus
          ? 'Model not found (HTTP ' + httpStatus + '). Go back and tap View in AR again.'
          : 'Could not load 3D model. Go back and tap View in AR again.';
        setStatus(msg, true);
        if (btn) btn.disabled = true;
      }

      function bootModel() {
        fetch(glbSrc, { method: 'HEAD', cache: 'no-store' })
          .then(function (res) {
            if (!res.ok && res.status !== 405) { failLoad(res.status); return; }
            if (!mv) { failLoad(0); return; }
            mv.src = glbSrc;
            mv.addEventListener('load', markReady, { once: true });
            mv.addEventListener('error', function () { failLoad(0); }, { once: true });
          })
          .catch(function () {
            if (!mv) { failLoad(0); return; }
            mv.src = glbSrc;
            mv.addEventListener('load', markReady, { once: true });
            mv.addEventListener('error', function () { failLoad(0); }, { once: true });
          });
      }

      if (btn) {
        btn.addEventListener('click', function (e) {
          e.preventDefault();
          if (!ready || !mv || !mv.canActivateAR) return;
          setStatus('Opening AR… aim at a wall, not the floor.');
          mv.activateAR();
        });
      }

      if (mv) {
        mv.addEventListener('ar-status', function (e) {
          var st = e.detail && e.detail.status;
          if (st === 'session-started') {
            setStatus('Tap the wall when the marker appears. Pinch to zoom after placing.');
          } else if (st === 'failed') {
            setStatus('AR failed to start. Update Chrome and Google Play Services for AR.', true);
            if (btn) btn.disabled = false;
          } else if (st === 'not-presenting' && ready && btn) {
            btn.disabled = false;
            setStatus('Ready — tap Place on Wall.');
          }
        });
      }

      bootModel();
    })();
  </script>
</body>
</html>`;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const glbPathParam  = url.searchParams.get("glbPath")  || "";
  const usdzPathParam = url.searchParams.get("usdzPath") || "";
  const glbParam      = url.searchParams.get("glb")      || "";
  const usdzParam     = url.searchParams.get("usdz")     || "";
  const title = url.searchParams.get("title") || "Product";

  const safeTitle = title.replace(/[<>&"']/g, "");
  const ua = request.headers.get("user-agent") || "";
  const isIOS = isIOSUserAgent(ua);

  const glbSrc = resolveModelSrc(
    request,
    glbPathParam || glbParam || usdzPathParam.replace(/\.usdz$/i, ".glb"),
  );
  const usdzSrc = resolveModelSrc(request, usdzPathParam || usdzParam);

  if (!glbSrc && !usdzSrc) {
    return new Response("Invalid model URL — glbPath or usdzPath is required.", { status: 400 });
  }

  const html = isIOS
    ? iosQuickLookHtml(glbSrc, usdzSrc || glbSrc.replace(/\.glb$/i, ".usdz"), safeTitle)
    : androidWallArHtml(glbSrc, safeTitle);

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
  });
}
