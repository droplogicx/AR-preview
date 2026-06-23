// GET /ar/view?glbPath=...&usdzPath=...&title=Product&returnUrl=...&autostart=1
// Launches wall AR immediately (no Place on Wall step). Back returns to customise screen.

import { normalizeModelPath } from "../ar-model-cache.server";

const APP_PROXY_PREFIX = "/apps/ar-preview";
const QL_POSTER =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
const REOPEN_KEY = "ar-preview-reopen-modal";

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

function safeReturnUrl(raw: string): string {
  if (!raw) return "/";
  try {
    const decoded = decodeURIComponent(raw);
    if (decoded.startsWith("https://") || decoded.startsWith("http://")) return decoded;
    if (decoded.startsWith("/")) return decoded;
  } catch {
    /* ignore */
  }
  return "/";
}

const pageStyles = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%; overflow: hidden;
      background: #000; color: #fff;
      font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body { position: relative; }
    .ar-live-chrome {
      position: fixed;
      top: 0; left: 0; right: 0;
      z-index: 100;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right)) 10px max(14px, env(safe-area-inset-left));
      pointer-events: none;
    }
    .ar-live-chrome button {
      pointer-events: auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 42px;
      height: 42px;
      padding: 0 14px;
      border: none;
      border-radius: 5px;
      background: rgba(255,255,255,0.95);
      color: #111;
      font: 600 15px/1 inherit;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0,0,0,.2);
      -webkit-tap-highlight-color: transparent;
    }
    .ar-live-chrome button:active { transform: scale(0.96); }
    .ar-live-back {
      font-size: 22px;
      font-weight: 400;
      padding: 0;
      width: 42px;
    }
    .ar-live-exit { font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; }
    .ar-live-stage {
      position: fixed;
      inset: 0;
      z-index: 1;
      background: #0f0f0f;
    }
    .ar-live-stage model-viewer {
      width: 100%;
      height: 100%;
      background: #0f0f0f;
      --progress-bar-color: transparent;
    }
    model-viewer::part(default-ar-button) { display: none; }
    .ar-live-status {
      position: fixed;
      left: 50%;
      bottom: max(24px, env(safe-area-inset-bottom));
      transform: translateX(-50%);
      z-index: 90;
      max-width: min(340px, calc(100vw - 32px));
      padding: 10px 16px;
      border-radius: 999px;
      background: rgba(0,0,0,0.55);
      color: rgba(255,255,255,0.92);
      font-size: 13px;
      line-height: 1.4;
      text-align: center;
      pointer-events: none;
      transition: opacity .25s;
    }
    .ar-live-status.error { background: rgba(120,20,20,0.82); }
    .ar-live-status.ar-hidden { opacity: 0; }
    .ar-ql-img { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    .ar-live-chrome.ar-in-session { opacity: 0; pointer-events: none; }
`;

const viewerAttrs = `
    camera-orbit="0deg 90deg auto"
    min-camera-orbit="auto 90deg auto"
    max-camera-orbit="auto 90deg auto"
    field-of-view="28deg"
    interaction-prompt="none"
    shadow-intensity="0"
    exposure="1.1"
    crossorigin="anonymous"
`;

function liveArHtml(opts: {
  glbSrc: string;
  usdzSrc: string;
  safeTitle: string;
  returnUrl: string;
  autostart: boolean;
  isIOS: boolean;
}): string {
  const { glbSrc, usdzSrc, safeTitle, returnUrl, autostart, isIOS } = opts;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <title>${safeTitle} — Live Preview</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>${pageStyles}</style>
</head>
<body>
  <div class="ar-live-chrome" id="ar-chrome">
    <button type="button" class="ar-live-back" id="ar-back" aria-label="Back to customise">&lsaquo;</button>
    <button type="button" class="ar-live-exit" id="ar-exit" aria-label="Exit to product page">Exit</button>
  </div>

  <p class="ar-live-status" id="ar-status">Starting live preview…</p>

  <div class="ar-live-stage">
    <model-viewer
      id="ar-mv"
      alt="${safeTitle}"
      ${isIOS ? "" : 'ar ar-modes="webxr" ar-placement="wall" ar-scale="fixed"'}
      ${viewerAttrs}
    ></model-viewer>
  </div>

  <a rel="ar" class="ar-ql-img" id="ar-ql-link" href="#" aria-hidden="true">
    <img class="ar-ql-img" src="${QL_POSTER}" alt="" width="1" height="1"/>
  </a>

  <script>
    (function () {
      var glbSrc = ${JSON.stringify(glbSrc)};
      var usdzSrc = ${JSON.stringify(usdzSrc)};
      var returnUrl = ${JSON.stringify(returnUrl)};
      var autostart = ${autostart ? "true" : "false"};
      var isIOS = ${isIOS ? "true" : "false"};
      var reopenKey = ${JSON.stringify(REOPEN_KEY)};

      var status = document.getElementById('ar-status');
      var mv = document.getElementById('ar-mv');
      var chrome = document.getElementById('ar-chrome');
      var qlLink = document.getElementById('ar-ql-link');
      var arStarted = false;

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
        status.classList.remove('ar-hidden');
      }

      function hideStatus() {
        if (status) status.classList.add('ar-hidden');
      }

      function goBack() {
        try { sessionStorage.setItem(reopenKey, '1'); } catch (e) {}
        window.location.href = returnUrl;
      }

      function goExit() {
        try { sessionStorage.removeItem(reopenKey); } catch (e) {}
        window.location.href = returnUrl;
      }

      document.getElementById('ar-back').addEventListener('click', goBack);
      document.getElementById('ar-exit').addEventListener('click', goExit);

      function launchIOSQuickLook() {
        if (!qlLink || !usdzUrl || arStarted) return;
        qlLink.href = usdzUrl;
        arStarted = true;
        setStatus('Tap the wall to place your print. Tap again to move it.');
        hideStatus();
        qlLink.click();
      }

      function launchWebXR() {
        if (!mv || arStarted) return;
        if (!mv.canActivateAR) {
          setStatus('Update Chrome and Google Play Services for AR, then try again.', true);
          return;
        }
        arStarted = true;
        if (chrome) chrome.classList.add('ar-in-session');
        hideStatus();
        mv.activateAR();
      }

      function bootIOS() {
        if (!usdzUrl) {
          setStatus('AR model not available. Go back and try again.', true);
          return;
        }
        fetch(usdzUrl, { method: 'HEAD', cache: 'no-store' })
          .then(function (res) {
            if (!res.ok && res.status !== 405) {
              setStatus('Model not found (HTTP ' + res.status + '). Go back and try again.', true);
              return;
            }
            if (mv && glbUrl) {
              mv.src = glbUrl;
            }
            if (autostart) {
              setTimeout(launchIOSQuickLook, 300);
            } else {
              setStatus('Ready — tap back to customise or exit to leave.');
            }
          })
          .catch(function () {
            setStatus('Could not load AR model. Go back and try again.', true);
          });
      }

      function bootAndroid() {
        if (!glbUrl) {
          setStatus('AR model not available. Go back and try again.', true);
          return;
        }
        fetch(glbUrl, { method: 'HEAD', cache: 'no-store' })
          .then(function (res) {
            if (!res.ok && res.status !== 405) {
              setStatus('Model not found (HTTP ' + res.status + '). Go back and try again.', true);
              return;
            }
            if (!mv) return;
            mv.src = glbUrl;
            mv.addEventListener('load', function onLoad() {
              mv.removeEventListener('load', onLoad);
              if (autostart) {
                setTimeout(launchWebXR, 400);
              } else {
                setStatus('Ready — tap back to customise or exit to leave.');
              }
            }, { once: true });
            mv.addEventListener('error', function () {
              setStatus('Could not load 3D model. Go back and try again.', true);
            }, { once: true });
          })
          .catch(function () {
            if (!mv) return;
            mv.src = glbUrl;
            mv.addEventListener('load', function () {
              if (autostart) setTimeout(launchWebXR, 400);
            }, { once: true });
          });
      }

      if (mv) {
        mv.addEventListener('ar-status', function (e) {
          var st = e.detail && e.detail.status;
          if (st === 'session-started') {
            if (chrome) chrome.classList.add('ar-in-session');
            setStatus('Tap the wall to place your print. Tap again to move it.');
            setTimeout(hideStatus, 3500);
          } else if (st === 'object-placed') {
            setStatus('Tap the wall to move your print.');
            setTimeout(hideStatus, 2500);
          } else if (st === 'failed') {
            if (chrome) chrome.classList.remove('ar-in-session');
            arStarted = false;
            setStatus('AR failed to start. Update Chrome and Google Play Services for AR.', true);
          } else if (st === 'not-presenting') {
            if (chrome) chrome.classList.remove('ar-in-session');
            arStarted = false;
            setStatus('Tap back to customise or exit to leave the preview.');
          }
        });
      }

      if (isIOS) bootIOS();
      else bootAndroid();
    })();
  </script>
</body>
</html>`;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const glbPathParam = url.searchParams.get("glbPath") || "";
  const usdzPathParam = url.searchParams.get("usdzPath") || "";
  const glbParam = url.searchParams.get("glb") || "";
  const usdzParam = url.searchParams.get("usdz") || "";
  const title = url.searchParams.get("title") || "Product";
  const returnUrl = safeReturnUrl(url.searchParams.get("returnUrl") || "");
  const autostart = url.searchParams.get("autostart") !== "0";

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

  const html = liveArHtml({
    glbSrc,
    usdzSrc: usdzSrc || glbSrc.replace(/\.glb$/i, ".usdz"),
    safeTitle,
    returnUrl,
    autostart,
    isIOS,
  });

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
  });
}
