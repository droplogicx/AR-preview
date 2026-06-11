// GET /ar/view?glb=https://.../model.glb&usdz=https://.../model.usdz&title=Product
// Launches native wall AR: Scene Viewer (Android) / Quick Look (iOS)

import { normalizeModelPath } from "../ar-model-cache.server";

function isIOSUserAgent(ua: string): boolean {
  return /iphone|ipad|ipod/i.test(ua);
}

function toAbsHttps(raw: string): string {
  if (!raw) return "";
  let url = raw.trim();
  if (url.startsWith("//")) url = "https:" + url;
  if (url.startsWith("http://")) url = "https://" + url.slice(7);
  if (!url.startsWith("https://")) return "";
  return url.replace(/[<>&"']/g, "");
}

function resolveModelUrl(request: Request, fullParam: string, pathParam: string): string {
  const direct = toAbsHttps(fullParam);
  if (direct) return direct;

  const path = normalizeModelPath(pathParam) || normalizeModelPath(fullParam);
  if (!path) return "";

  const reqUrl = new URL(request.url);
  const shop = reqUrl.searchParams.get("shop");
  const pathPrefix = (reqUrl.searchParams.get("path_prefix") || "").replace(/\/$/, "");

  if (shop && pathPrefix) {
    return `https://${shop}${pathPrefix}${path}`;
  }

  return `${reqUrl.origin}${path}`;
}

function arPageHtml(
  absGlb: string,
  absUsdz: string,
  safeTitle: string,
  isIOS: boolean,
  pageUrl: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
  <meta name="apple-mobile-web-app-capable" content="yes"/>
  <title>${safeTitle} — Wall AR</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      min-height: 100%;
      background: #111; color: #fff;
      font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    body {
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      padding: 24px; min-height: 100vh; text-align: center;
    }
    h1 { font-size: 20px; font-weight: 600; margin-bottom: 10px; }
    .ar-status { color: rgba(255,255,255,.78); margin-bottom: 22px; max-width: 340px; min-height: 44px; }
    .ar-status.error { color: #ff8a8a; }
    .ar-launch {
      display: inline-flex; align-items: center; justify-content: center;
      min-width: 220px; padding: 14px 28px; border: none;
      border-radius: 999px; background: #fff; color: #111;
      font: 600 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer; box-shadow: 0 8px 28px rgba(0,0,0,.35);
    }
    .ar-spinner {
      width: 36px; height: 36px; margin: 0 auto 14px;
      border: 3px solid rgba(255,255,255,.2);
      border-top-color: #fff; border-radius: 50%;
      animation: ar-spin .8s linear infinite;
    }
    @keyframes ar-spin { to { transform: rotate(360deg); } }
    .ar-hint { color: rgba(255,255,255,.55); font-size: 13px; margin-top: 14px; max-width: 320px; }
  </style>
</head>
<body>
  <div class="ar-spinner" id="ar-spinner"></div>
  <h1>${safeTitle}</h1>
  <p class="ar-status" id="ar-status">Opening wall AR…</p>
  <button type="button" class="ar-launch" id="ar-launch-btn">View on Wall</button>
  <p class="ar-hint">Pinch to zoom in AR. Poster stays on the wall — not on the floor.</p>

  <script>
    (function () {
      var glbUrl = ${JSON.stringify(absGlb)};
      var usdzUrl = ${JSON.stringify(absUsdz || "")};
      var isIOS = ${JSON.stringify(isIOS)};
      var pageUrl = ${JSON.stringify(pageUrl)};
      var status = document.getElementById('ar-status');
      var spinner = document.getElementById('ar-spinner');
      var btn = document.getElementById('ar-launch-btn');
      var launched = false;

      function setStatus(msg, isError) {
        if (status) {
          status.textContent = msg;
          status.classList.toggle('error', !!isError);
        }
      }

      function hideSpinner() {
        if (spinner) spinner.style.display = 'none';
      }

      function launchAndroidWallAR() {
        if (!glbUrl) {
          setStatus('No 3D model available.', true);
          hideSpinner();
          return;
        }
        launched = true;
        setStatus('Scan a wall — pinch to resize the poster.');
        var file = encodeURIComponent(glbUrl);
        var fallback = encodeURIComponent(pageUrl);
        var intent =
          'intent://arvr.google.com/scene-viewer/1.0?file=' + file +
          '&mode=ar_only' +
          '&enable_vertical_placement=true' +
          '&resizable=true' +
          '#Intent;scheme=https;package=com.google.android.googlequicksearchbox;' +
          'action=android.intent.action.VIEW;' +
          'S.browser_fallback_url=' + fallback + ';end;';
        window.location.href = intent;
      }

      function launchIOSWallAR() {
        if (!usdzUrl) {
          setStatus('No AR model for iOS.', true);
          hideSpinner();
          return;
        }
        launched = true;
        setStatus('Opening Quick Look…');
        var link = document.createElement('a');
        link.setAttribute('rel', 'ar');
        link.href = usdzUrl;
        var img = document.createElement('img');
        img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        img.alt = ${JSON.stringify(safeTitle)};
        link.appendChild(img);
        document.body.appendChild(link);
        link.click();
        link.remove();
        hideSpinner();
        setStatus('Pinch to resize. Tap to place on your wall.');
      }

      function launchWallAR() {
        hideSpinner();
        if (isIOS) launchIOSWallAR();
        else launchAndroidWallAR();
      }

      if (btn) btn.addEventListener('click', launchWallAR);

      setTimeout(function () {
        if (!launched) launchWallAR();
      }, 350);

      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'visible' && launched) {
          hideSpinner();
          setStatus('Tap View on Wall to try again.');
        }
      });
    })();
  </script>
</body>
</html>`;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const glbParam      = url.searchParams.get("glb")      || "";
  const usdzParam     = url.searchParams.get("usdz")     || "";
  const glbPathParam  = url.searchParams.get("glbPath")  || "";
  const usdzPathParam = url.searchParams.get("usdzPath") || "";
  const title = url.searchParams.get("title") || "Product";

  const safeTitle = title.replace(/[<>&"']/g, "");
  const ua = request.headers.get("user-agent") || "";
  const isIOS = isIOSUserAgent(ua);

  const absGlb  = resolveModelUrl(request, glbParam, glbPathParam);
  const absUsdz = resolveModelUrl(request, usdzParam, usdzPathParam);

  if (!absGlb && !absUsdz) {
    return new Response("Invalid model URL — glb or usdz parameter is required.", { status: 400 });
  }

  const html = arPageHtml(absGlb, absUsdz, safeTitle, isIOS, url.href);

  return new Response(html, {
    headers: { "Content-Type": "text/html;charset=utf-8", "Cache-Control": "no-store" },
  });
}
