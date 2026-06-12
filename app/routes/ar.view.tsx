// GET /ar/view?usdzPath=/api/ar-model/file/x.usdz&glbPath=...&title=Product
// Mobile AR page — same-origin USDZ for iOS Quick Look

import { normalizeModelPath } from "../ar-model-cache.server";

function isIOSUserAgent(ua: string): boolean {
  return /iphone|ipad|ipod/i.test(ua);
}

function normalizeModelUrl(raw: string): string {
  const modelPath = normalizeModelPath(raw);
  if (modelPath) return modelPath;
  if (!raw) return "";
  let url = raw.trim();
  if (url.startsWith("//")) url = "https:" + url;
  if (url.startsWith("http://")) url = "https://" + url.slice(7);
  if (!url.startsWith("https://")) return "";
  return url.replace(/[<>&"']/g, "");
}

function iosArPageHtml(usdzPath: string, glbPath: string, safeTitle: string): string {
  const glbSrc = glbPath || usdzPath.replace(/\.usdz$/i, ".glb");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <title>${safeTitle} — AR View</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; min-height: 100%;
      background: #111; color: #fff;
      font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 24px;
      min-height: 100vh;
      text-align: center;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
    .ar-status { color: rgba(255,255,255,.75); margin-bottom: 20px; max-width: 320px; min-height: 44px; }
    .ar-status.error { color: #ff8a8a; }
    model-viewer {
      width: min(100%, 420px);
      height: 52vh;
      max-height: 420px;
      background: #222;
      border-radius: 12px;
      margin-bottom: 20px;
    }
    .ar-launch {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 220px; padding: 14px 28px;
      border: none;
      border-radius: 999px; background: #fff; color: #111;
      font: 600 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-decoration: none; box-shadow: 0 8px 28px rgba(0,0,0,.35);
      cursor: pointer;
    }
    .ar-launch:disabled { opacity: 0.45; cursor: not-allowed; }
    .ar-launch img { display: none; }
    .ar-spinner {
      width: 36px; height: 36px; margin: 0 auto 12px;
      border: 3px solid rgba(255,255,255,.2);
      border-top-color: #fff; border-radius: 50%;
      animation: ar-spin .8s linear infinite;
    }
    @keyframes ar-spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="ar-spinner" id="ar-spinner"></div>
  <h1>${safeTitle}</h1>
  <p class="ar-status" id="ar-status">Loading AR model…</p>

  <model-viewer
    id="ar-mv"
    src="${glbSrc}"
    ios-src="${usdzPath}"
    alt="${safeTitle}"
    ar
    ar-modes="quick-look"
    ar-placement="wall"
    ar-scale="fixed"
    camera-controls
    touch-action="pan-y"
    shadow-intensity="0"
    exposure="1.1"
    quick-look-browsers="safari"
  ></model-viewer>

  <button type="button" class="ar-launch" id="ar-quicklook" disabled>
    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" alt="${safeTitle}"/>
    View in AR
  </button>

  <script>
    (function () {
      var usdzPath = ${JSON.stringify(usdzPath)};
      var mv = document.getElementById('ar-mv');
      var status = document.getElementById('ar-status');
      var spinner = document.getElementById('ar-spinner');
      var btn = document.getElementById('ar-quicklook');

      function setStatus(msg, isError) {
        if (status) {
          status.textContent = msg;
          status.classList.toggle('error', !!isError);
        }
      }

      function enableAR() {
        if (spinner) spinner.style.display = 'none';
        setStatus('Tap View in AR to place it on your wall.');
        if (btn) btn.disabled = false;
      }

      function verifyUsdz() {
        return fetch(usdzPath, { method: 'GET', cache: 'no-store' })
          .then(function (res) {
            if (!res.ok) throw new Error('Model not found (HTTP ' + res.status + '). Go back and try again.');
            return res.blob();
          })
          .then(function (blob) {
            if (!blob || blob.size < 512) {
              throw new Error('Model file is empty (' + (blob ? blob.size : 0) + ' bytes). Go back and try again.');
            }
            enableAR();
          });
      }

      if (btn) {
        btn.addEventListener('click', function () {
          if (mv && mv.activateAR) {
            mv.activateAR();
            return;
          }
          var link = document.createElement('a');
          link.setAttribute('rel', 'ar');
          link.href = usdzPath;
          var img = document.createElement('img');
          img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          img.alt = ${JSON.stringify(safeTitle)};
          link.appendChild(img);
          document.body.appendChild(link);
          link.click();
          link.remove();
        });
      }

      if (mv) {
        mv.addEventListener('load', function () {
          verifyUsdz().catch(function (err) {
            setStatus(err.message || 'Could not load AR model.', true);
            if (spinner) spinner.style.display = 'none';
          });
        });
        mv.addEventListener('error', function () {
          verifyUsdz().catch(function (err) {
            setStatus(err.message || 'Could not load AR model.', true);
            if (spinner) spinner.style.display = 'none';
          });
        });
      } else {
        verifyUsdz().catch(function (err) {
          setStatus(err.message || 'Could not load AR model.', true);
          if (spinner) spinner.style.display = 'none';
        });
      }
    })();
  </script>
</body>
</html>`;
}

function modelViewerHtml(safeGlb: string, safeUsdz: string, safeTitle: string): string {
  const iosSrcAttr = safeUsdz ? ` ios-src="${safeUsdz}"` : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <title>${safeTitle} — AR View</title>
  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #111; overflow: hidden; }
    model-viewer { width: 100%; height: 100%; --poster-color: transparent; }
    model-viewer::part(default-ar-button) { display: none; }
    .ar-page-loader {
      position: fixed; inset: 0; z-index: 100;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(17,17,17,.92); color: #fff;
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      transition: opacity .35s, visibility .35s;
    }
    .ar-page-loader.hide { opacity: 0; visibility: hidden; pointer-events: none; }
    .ar-page-loader p { margin-top: 14px; font-weight: 500; }
    .ar-page-spinner {
      width: 44px; height: 44px;
      border: 3px solid rgba(255,255,255,.2);
      border-top-color: #fff; border-radius: 50%;
      animation: ar-spin .8s linear infinite;
    }
    @keyframes ar-spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="ar-page-loader" id="ar-page-loader">
    <div class="ar-page-spinner"></div>
    <p id="ar-loader-text">Loading AR model…</p>
  </div>
  <model-viewer
    id="ar-mv"
    src="${safeGlb}"${iosSrcAttr}
    alt="${safeTitle}"
    ar ar-modes="scene-viewer webxr"
    ar-placement="wall"
    ar-scale="fixed"
    camera-controls
    auto-activate-ar
    shadow-intensity="0"
    exposure="1.1"
  ></model-viewer>
  <script>
    (function () {
      var mv = document.getElementById('ar-mv');
      var loader = document.getElementById('ar-page-loader');
      var loaderText = document.getElementById('ar-loader-text');
      if (!mv) return;
      mv.addEventListener('progress', function (e) {
        if (e.detail.totalProgress < 1 && loaderText) {
          loaderText.textContent = 'Loading AR model… ' + Math.round(e.detail.totalProgress * 100) + '%';
        }
      });
      mv.addEventListener('load', function () {
        if (loaderText) loaderText.textContent = 'Launching AR…';
        setTimeout(function () { if (loader) loader.classList.add('hide'); }, 600);
      });
      mv.addEventListener('error', function () {
        if (loaderText) loaderText.textContent = 'Could not load AR model';
        if (loader) loader.style.background = 'rgba(60,0,0,.9)';
      });
    })();
  </script>
</body>
</html>`;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const usdzPathParam = url.searchParams.get("usdzPath") || "";
  const glbPathParam = url.searchParams.get("glbPath") || "";
  const usdz = url.searchParams.get("usdz") || "";
  const glb = url.searchParams.get("glb") || "";
  const title = url.searchParams.get("title") || "Product";

  const safeUsdzPath = normalizeModelPath(usdzPathParam) || normalizeModelPath(usdz);
  const safeGlbPath = normalizeModelPath(glbPathParam) || normalizeModelPath(glb);
  const safeGlb = normalizeModelUrl(glb);
  const safeUsdz = normalizeModelUrl(usdz);
  const safeTitle = title.replace(/[<>&"']/g, "");
  const ua = request.headers.get("user-agent") || "";
  const isIOS = isIOSUserAgent(ua);

  if (isIOS) {
    if (safeUsdzPath) {
      return new Response(iosArPageHtml(safeUsdzPath, safeGlbPath, safeTitle), {
        headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    if (!safeUsdz && !safeGlb) {
      return new Response("Invalid model URL — usdzPath is required.", { status: 400 });
    }
    const html = modelViewerHtml(safeGlb, safeUsdz, safeTitle);
    return new Response(html, {
      headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const androidGlb = safeGlbPath || safeGlb;
  if (!androidGlb) {
    return new Response("Invalid model URL — GLB path is required.", { status: 400 });
  }

  return new Response(modelViewerHtml(androidGlb, safeUsdzPath || safeUsdz, safeTitle), {
    headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
  });
}
