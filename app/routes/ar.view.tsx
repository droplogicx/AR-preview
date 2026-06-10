// GET /ar/view?glb=https://...&usdz=https://...&title=Product

// Mobile AR page — GLB (Android) + USDZ (iOS Safari Quick Look)



export async function loader({ request }: { request: Request }) {

  const url = new URL(request.url);

  const glb = url.searchParams.get("glb") || "";

  const usdz = url.searchParams.get("usdz") || "";

  const title = url.searchParams.get("title") || "Product";



  if (!glb.startsWith("https://")) {

    return new Response("Invalid model URL", { status: 400 });

  }



  const safeGlb = glb.replace(/[<>&"']/g, "");

  const safeUsdz = usdz.startsWith("https://") ? usdz.replace(/[<>&"']/g, "") : "";

  const safeTitle = title.replace(/[<>&"']/g, "");

  const iosSrcAttr = safeUsdz ? ` ios-src="${safeUsdz}"` : "";



  const html = `<!DOCTYPE html>

<html lang="en">

<head>

  <meta charset="utf-8"/>

  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>

  <title>${safeTitle} — AR View</title>

  <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/3.5.0/model-viewer.min.js"></script>

  <style>

    * { box-sizing: border-box; margin: 0; padding: 0; }

    html, body { width: 100%; height: 100%; background: #111; overflow: hidden; }

    model-viewer {

      width: 100%;

      height: 100%;

      --poster-color: transparent;

    }

    model-viewer::part(default-ar-button) {

      display: none;

    }

    .ar-page-loader {

      position: fixed;

      inset: 0;

      z-index: 100;

      display: flex;

      flex-direction: column;

      align-items: center;

      justify-content: center;

      background: rgba(17,17,17,.92);

      color: #fff;

      font: 14px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

      transition: opacity .35s, visibility .35s;

    }

    .ar-page-loader.hide {

      opacity: 0;

      visibility: hidden;

      pointer-events: none;

    }

    .ar-page-loader p { margin-top: 14px; font-weight: 500; }

    .ar-page-spinner {

      width: 44px;

      height: 44px;

      border: 3px solid rgba(255,255,255,.2);

      border-top-color: #fff;

      border-radius: 50%;

      animation: ar-spin .8s linear infinite;

    }

    @keyframes ar-spin { to { transform: rotate(360deg); } }

    .ar-launch-btn {

      position: fixed;

      left: 50%;

      bottom: max(28px, env(safe-area-inset-bottom));

      transform: translateX(-50%);

      z-index: 110;

      display: none;

      align-items: center;

      justify-content: center;

      min-width: 220px;

      padding: 14px 28px;

      border: none;

      border-radius: 999px;

      background: #fff;

      color: #111;

      font: 600 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

      box-shadow: 0 8px 28px rgba(0,0,0,.35);

      cursor: pointer;

    }

    .ar-launch-btn.show { display: flex; }

    .ar-hint {

      position: fixed;

      bottom: max(88px, calc(env(safe-area-inset-bottom) + 72px));

      left: 50%;

      transform: translateX(-50%);

      background: rgba(0,0,0,.65);

      color: #fff;

      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

      padding: 10px 16px;

      border-radius: 999px;

      pointer-events: none;

      white-space: nowrap;

      opacity: 0;

      transition: opacity .3s;

      max-width: calc(100% - 24px);

      text-align: center;

    }

    .ar-hint.show { opacity: 1; }

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

    ar

    ar-modes="quick-look scene-viewer webxr"

    ar-placement="floor"

    ar-scale="auto"

    camera-controls

    touch-action="pan-y"

    shadow-intensity="0"

    exposure="1.1"

    quick-look-browsers="safari chrome"

  ></model-viewer>



  <button type="button" class="ar-launch-btn" id="ar-launch-btn">View in AR</button>

  <p class="ar-hint" id="ar-hint">Tap View in AR · Point at the floor · Pinch to resize</p>



  <script>

    (function () {

      var mv = document.getElementById('ar-mv');

      var loader = document.getElementById('ar-page-loader');

      var loaderText = document.getElementById('ar-loader-text');

      var hint = document.getElementById('ar-hint');

      var launchBtn = document.getElementById('ar-launch-btn');



      var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||

        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);



      function setMsg(msg) {

        if (loaderText) loaderText.textContent = msg;

      }



      function hideLoader() {

        if (loader) loader.classList.add('hide');

        if (hint) hint.classList.add('show');

      }



      function showLaunchButton() {

        hideLoader();

        if (launchBtn) launchBtn.classList.add('show');

      }



      if (!mv) return;

      if (!isIOS) {
        mv.setAttribute('auto-activate-ar', '');
      }

      if (launchBtn) {
        launchBtn.addEventListener('click', function () {
          if (mv.activateAR) mv.activateAR();
        });
      }



      mv.addEventListener('progress', function (e) {

        var p = e.detail.totalProgress;

        if (p < 1) {

          setMsg('Loading AR model… ' + Math.round(p * 100) + '%');

        }

      });



      mv.addEventListener('load', function () {
        if (isIOS) {
          setMsg('Ready for AR');
          showLaunchButton();
        } else {
          setMsg('Launching AR…');
          setTimeout(hideLoader, 600);
        }
      });



      mv.addEventListener('error', function () {

        setMsg('Could not load AR model');

        if (loader) loader.style.background = 'rgba(60,0,0,.9)';

      });

    })();

  </script>

</body>

</html>`;



  return new Response(html, {

    headers: {

      "Content-Type": "text/html;charset=utf-8",

      "Cache-Control": "no-store",

    },

  });

}

