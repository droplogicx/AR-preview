// app/routes/api.ar-model.tsx
// GET  /api/ar-model?img=URL&w=60&h=40
// POST /api/ar-model  { image: "data:image/png;base64,...", w, h, frame, matting, sizeScale }
// Returns { glb: "https://...", usdz: "https://..." }

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";
import {
  AR_MODEL_CACHE_DIR,
  ensureCacheDir,
  isValidCachedFile,
} from "../ar-model-cache.server";

const CACHE_DIR = AR_MODEL_CACHE_DIR;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function getPublicBaseUrl(request: Request): string {
  const envUrl = (process.env.SHOPIFY_APP_URL || process.env.APP_URL || "").replace(/\/$/, "");
  if (envUrl.startsWith("https://")) return envUrl;
  if (envUrl.startsWith("http://") && !envUrl.includes("localhost")) {
    return envUrl.replace(/^http:/, "https:");
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || "https";
  if (forwardedHost) {
    const proto = forwardedProto.split(",")[0].trim();
    return `${proto}://${forwardedHost.split(",")[0].trim()}`;
  }

  try {
    const reqUrl = new URL(request.url);
    let origin = `${reqUrl.protocol}//${reqUrl.host}`;
    if (origin.startsWith("http://") && !origin.includes("localhost")) {
      origin = origin.replace(/^http:/, "https:");
    }
    if (origin.startsWith("https://") && !origin.includes("localhost")) return origin;
    if (envUrl) return envUrl.replace(/^http:/, "https:");
    return origin;
  } catch {
    return envUrl || "https://localhost:3000";
  }
}

function errorResponse(message: string, status = 500) {
  return Response.json({ error: message }, { status, headers: CORS });
}

async function generateAndCache(
  request: Request,
  imageBuffer: Buffer,
  wCm: number,
  hCm: number,
  cacheSeed: string,
  angle = 0,
  level = 0,
  pitch = 0,
) {
  ensureCacheDir();

  const appUrl   = getPublicBaseUrl(request);
  const hash     = crypto.createHash("md5").update(cacheSeed).digest("hex");
  const glbName  = `${hash}.glb`;
  const usdzName = `${hash}.usdz`;
  const glbPath  = path.join(CACHE_DIR, glbName);
  const usdzPath = path.join(CACHE_DIR, usdzName);
  const glbUrl   = `${appUrl}/api/ar-model/file/${glbName}`;
  const usdzUrl  = `${appUrl}/api/ar-model/file/${usdzName}`;

  const needsGlb  = !isValidCachedFile(glbPath);
  const needsUsdz = !isValidCachedFile(usdzPath);

  if (needsGlb || needsUsdz) {
    const scene = await createARScene(imageBuffer, wCm, hCm, angle, level, pitch);
    if (needsGlb) {
      const glbBuf = await exportGLB(scene);
      if (glbBuf.length < 512) throw new Error("GLB export produced an empty file");
      fs.writeFileSync(glbPath, glbBuf);
    }
    if (needsUsdz) {
      const usdzBuf = await exportUSDZ(scene);
      if (usdzBuf.length < 512) throw new Error("USDZ export produced an empty file");
      fs.writeFileSync(usdzPath, usdzBuf);
    }
  }

  return Response.json({
    glb: glbUrl,
    usdz: usdzUrl,
    glbPath: `/api/ar-model/file/${glbName}`,
    usdzPath: `/api/ar-model/file/${usdzName}`,
  }, { headers: CORS });
}

function parseDataUrlImage(dataUrl: string): Buffer {
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  return Buffer.from(match[1], "base64");
}

export async function loader({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url    = new URL(request.url);
  const imgUrl = url.searchParams.get("img") || "";
  const wCm    = parseFloat(url.searchParams.get("w") || "60");
  const hCm    = parseFloat(url.searchParams.get("h") || "40");

  if (!imgUrl) {
    return errorResponse("img param required", 400);
  }

  try {
    const imageBuffer = await downloadImage(imgUrl);
    const cacheSeed   = `${imgUrl}-${wCm}-${hCm}`;
    return await generateAndCache(request, imageBuffer, wCm, hCm, cacheSeed);
  } catch (err: any) {
    console.error("[ar-model error]", err?.message || err);
    return errorResponse("Failed to generate AR model: " + (err?.message || "unknown"));
  }
}

export async function action({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const body     = await request.json();
    const dataUrl    = body.image || "";
    const imgUrl     = body.imgUrl || "";
    const frameColor = body.frameColor || "";
    const wCm        = parseFloat(body.w || "60");
    const hCm        = parseFloat(body.h || "40");
    const frame      = body.frame || "none";
    const matting    = body.matting || "none";
    const sizeScale  = body.sizeScale || 1;
    const angle      = parseFloat(body.angle ?? "0") || 0;
    const level      = parseFloat(body.level ?? "0") || 0;
    const pitch      = parseFloat(body.pitch ?? "0") || 0;

    let imageBuffer: Buffer;
    if (dataUrl) {
      imageBuffer = parseDataUrlImage(dataUrl);
    } else if (imgUrl) {
      const raw = await downloadImage(imgUrl);
      imageBuffer = await compositeFramedProductImage(raw, frame, matting, frameColor);
    } else {
      return errorResponse("image or imgUrl field required", 400);
    }

    const cacheSeed = crypto.createHash("md5")
      .update(imageBuffer)
      .update(`|${wCm}|${hCm}|${frame}|${matting}|${sizeScale}|${angle}|${level}|${pitch}`)
      .digest("hex");
    return await generateAndCache(request, imageBuffer, wCm, hCm, cacheSeed, angle, level, pitch);
  } catch (err: any) {
    console.error("[ar-model POST error]", err?.message || err);
    return errorResponse("Failed to generate AR model: " + (err?.message || "unknown"));
  }
}

const FRAME_COLOR_MAP: Record<string, string> = {
  white:  "#f5f5f0",
  black:  "#1a1a1a",
  brown:  "#6b4c35",
  gold:   "#c9a84c",
  gray:   "#9a9a9a",
  yellow: "#e8c547",
};

async function compositeFramedProductImage(
  imageBuffer: Buffer,
  frame: string,
  matting: string,
  frameColor = "",
): Promise<Buffer> {
  const { createCanvas, loadImage } = await import("canvas");
  const img = await loadImage(imageBuffer);
  const artW = 1024;
  const imgRatio = img.height / img.width;
  const artH = Math.round(artW * imgRatio);
  const matPx = matting === "1" ? Math.max(14, Math.round(artW * 0.085)) : 0;
  const framePx = frame === "none" ? 0 : Math.max(2, Math.round(artW * 0.011));
  const color = frameColor || FRAME_COLOR_MAP[frame] || "#1a1a1a";
  const totalW = artW + matPx * 2 + framePx * 2;
  const totalH = artH + matPx * 2 + framePx * 2;

  const canvas = createCanvas(totalW, totalH);
  const ctx = canvas.getContext("2d");

  if (framePx > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, totalW, totalH);
  }
  if (matPx > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(framePx, framePx, totalW - framePx * 2, totalH - framePx * 2);
  }

  let drawW = artW;
  let drawH = artH;
  if (imgRatio > drawH / drawW) {
    drawH = artH;
    drawW = drawH / imgRatio;
  } else {
    drawW = artW;
    drawH = drawW * imgRatio;
  }
  const ox = framePx + matPx + (artW - drawW) / 2;
  const oy = framePx + matPx + (artH - drawH) / 2;
  ctx.drawImage(img as any, ox, oy, drawW, drawH);

  return canvas.toBuffer("image/png");
}

// ── Download image ────────────────────────────────────────────────────────────
function downloadImage(rawUrl: string): Promise<Buffer> {
  // Handle Shopify CDN URLs that may be protocol-relative (//cdn.shopify.com/...)
  const fullUrl = rawUrl.startsWith("//") ? "https:" + rawUrl : rawUrl;

  return new Promise((resolve, reject) => {
    const client = fullUrl.startsWith("https") ? https : http;
    const req = client.get(fullUrl, { timeout: 15000 }, (res) => {
      // Follow redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Image download failed with status ${res.statusCode} for URL: ${fullUrl}`));
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Image download timed out")); });
  });
}

// GLTFExporter expects browser DOM APIs; polyfill them for Node.
let domPolyfillsReady = false;
async function ensureNodeDomPolyfills() {
  if (domPolyfillsReady || typeof document !== "undefined") return;

  const { createCanvas, ImageData } = await import("canvas");
  const NodeCanvas = createCanvas(1, 1).constructor;

  (globalThis as any).HTMLCanvasElement = NodeCanvas;
  (globalThis as any).ImageData = ImageData;

  (globalThis as any).document = {
    createElement: (tag: string) => {
      if (tag !== "canvas") throw new Error(`Unsupported element: ${tag}`);
      const canvas: any = createCanvas(1, 1);
      if (typeof canvas.toBlob !== "function") {
        canvas.toBlob = (callback: (blob: Blob) => void, mimeType?: string) => {
          const type = mimeType || "image/png";
          const buf = canvas.toBuffer(type === "image/jpeg" ? "image/jpeg" : "image/png");
          callback(new Blob([buf], { type }));
        };
      }
      return canvas;
    },
  };

  (globalThis as any).FileReader = class {
    result: ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };

  domPolyfillsReady = true;
}

// ── Build shared Three.js scene (frame texture is already baked into image) ───
async function createARScene(
  imageBuffer: Buffer,
  wCm: number,
  hCm: number,
  angleDeg = 0,
  levelDeg = 0,
  pitchDeg = 0,
) {
  const wM = Math.max(0.01, wCm / 100);
  const hM = Math.max(0.01, hCm / 100);

  await ensureNodeDomPolyfills();

  const { createCanvas, loadImage } = await import("canvas");
  const img = await loadImage(imageBuffer);

  const MAX = 1024;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const tw = Math.round(img.width  * scale);
  const th = Math.round(img.height * scale);

  const canvas = createCanvas(tw, th);
  const ctx    = canvas.getContext("2d");
  ctx.drawImage(img as any, 0, 0, tw, th);

  const THREE = await import("three");
  const scene = new THREE.Scene();

  const imgAspect = img.width / img.height;
  const hFromImg  = wM / imgAspect;
  const finalH    = hFromImg > 0 ? hFromImg : hM;
  const depthM    = 0.018;

  const texture = new THREE.CanvasTexture(canvas as any);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY      = true;
  texture.needsUpdate = true;

  const material = new THREE.MeshStandardMaterial({
    map:       texture,
    roughness: 0.85,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(wM, finalH, depthM), material);
  mesh.rotation.order = "YXZ";
  mesh.rotation.y = THREE.MathUtils.degToRad(angleDeg);
  mesh.rotation.x = THREE.MathUtils.degToRad(pitchDeg);
  mesh.rotation.z = THREE.MathUtils.degToRad(levelDeg);

  scene.add(mesh);
  return scene;
}

async function exportGLB(scene: Awaited<ReturnType<typeof createARScene>>): Promise<Buffer> {
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
        } else {
          resolve(Buffer.from(JSON.stringify(result), "utf-8"));
        }
      },
      (err: Error) => reject(err),
      { binary: true, embedImages: true }
    );
  });
}

async function exportUSDZ(scene: Awaited<ReturnType<typeof createARScene>>): Promise<Buffer> {
  const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js");
  const exporter = new USDZExporter();
  const arrayBuffer = await exporter.parseAsync(scene, {
    quickLookCompatible: true,
    includeAnchoringProperties: true,
    ar: {
      anchoring: { type: "plane" },
      planeAnchoring: { alignment: "horizontal" },
    },
  });
  return Buffer.from(arrayBuffer);
}
