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
import { API_VERSION } from "../ar-api-version.server";

const CACHE_DIR = AR_MODEL_CACHE_DIR;

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store",
};

function errorResponse(message: string, status = 500) {
  return Response.json(
    { error: message, apiVersion: API_VERSION },
    { status, headers: CORS },
  );
}

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

/** Visible frame depth in AR (~1 inch). */
const FRAME_DEPTH_M = 2.54 / 100;

/**
 * Minimum export bounding box (meters). Scene Viewer often upscales tiny
 * models and downscales large ones toward ~1m, which made every ISO size
 * look the same. A 1m calibration box (NOT 2m — that halved real scale)
 * keeps small posters (A4/A3) true-to-life under that behavior, while the
 * poster mesh itself stays at exact paper meters for WebXR.
 */
const AR_CALIBRATION_EXTENT_M = 1.0;

async function generateAndCache(
  request: Request,
  imageBuffer: Buffer,
  wCm: number,
  hCm: number,
  cacheSeed: string,
  angle = 0,
  level = 0,
  pitch = 0,
  edgeColor = "#3d2b1f",
  sizeLabel = "",
) {
  ensureCacheDir();

  const appUrl   = getPublicBaseUrl(request);
  const hash     = crypto.createHash("md5").update(cacheSeed).digest("hex");
  // Embed cm in the filename so mobile can verify A1 vs B0 are different files.
  const sizeTag  = `${Math.round(wCm)}x${Math.round(hCm)}`;
  const glbName  = `${hash}_${sizeTag}.glb`;
  const usdzName = `${hash}_${sizeTag}.usdz`;
  const glbPath  = path.join(CACHE_DIR, glbName);
  const usdzPath = path.join(CACHE_DIR, usdzName);
  // Cache-bust query so Scene Viewer / Quick Look never reuse a prior size.
  const bust = `v=${API_VERSION}&s=${sizeTag}`;
  const glbUrl   = `${appUrl}/api/ar-model/file/${glbName}?${bust}`;
  const usdzUrl  = `${appUrl}/api/ar-model/file/${usdzName}?${bust}`;
  const wM = Math.max(0.01, wCm / 100);
  const hM = Math.max(0.01, hCm / 100);

  const needsGlb  = !isValidCachedFile(glbPath);
  const needsUsdz = !isValidCachedFile(usdzPath);

  console.log(
    `[ar-model ${API_VERSION}] sizeLabel=${sizeLabel || "?"} wCm=${wCm} hCm=${hCm} ` +
    `wM=${wM.toFixed(4)} hM=${hM.toFixed(4)} needsGlb=${needsGlb} needsUsdz=${needsUsdz} file=${glbName}`,
  );

  if (needsGlb || needsUsdz) {
    const frame = await buildFrameContext(imageBuffer, wCm, hCm, angle, level, pitch, edgeColor);
    if (needsGlb) {
      const glbBuf = await exportGLB(createGLBScene(frame));
      if (glbBuf.length < 512) throw new Error("GLB export produced an empty file");
      fs.writeFileSync(glbPath, glbBuf);
    }
    if (needsUsdz) {
      const usdzBuf = await exportUSDZ(createUSDZScene(frame));
      if (usdzBuf.length < 512) throw new Error("USDZ export produced an empty file");
      fs.writeFileSync(usdzPath, usdzBuf);
    }
  }

  return Response.json({
    glb: glbUrl,
    usdz: usdzUrl,
    glbPath: `/api/ar-model/file/${glbName}?${bust}`,
    usdzPath: `/api/ar-model/file/${usdzName}?${bust}`,
    // Echo so the phone can confirm what the server actually used.
    apiVersion: API_VERSION,
    wCm,
    hCm,
    wM,
    hM,
    sizeLabel,
    sizeTag,
    cached: !needsGlb && !needsUsdz,
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
    const cacheSeed   = `${imgUrl}-${wCm}-${hCm}-${API_VERSION}`;
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
    // Do not use `body.w || "60"` — a numeric 0 would incorrectly fall back.
    const wParsed    = Number(body.w);
    const hParsed    = Number(body.h);
    const wCm        = Number.isFinite(wParsed) && wParsed > 0 ? wParsed : 60;
    const hCm        = Number.isFinite(hParsed) && hParsed > 0 ? hParsed : 40;
    const frame      = body.frame || "none";
    const matting    = body.matting || "none";
    const effectiveMatting = frame === "none" ? "none" : matting;
    const sizeScale  = parseFloat(body.sizeScale) || 1;
    const angle      = parseFloat(body.angle ?? "0") || 0;
    const level      = parseFloat(body.level ?? "0") || 0;
    const pitch      = parseFloat(body.pitch ?? "0") || 0;
    const outerWCm   = wCm * sizeScale;
    const outerHCm   = hCm * sizeScale;

    let imageBuffer: Buffer;
    if (dataUrl) {
      imageBuffer = parseDataUrlImage(dataUrl);
    } else if (imgUrl) {
      const raw = await downloadImage(imgUrl);
      imageBuffer = await compositeFramedProductImage(raw, frame, effectiveMatting, frameColor, outerWCm, outerHCm);
    } else {
      return errorResponse("image or imgUrl field required", 400);
    }

    const sizeLabel = String(body.sizeLabel || "");
    const cacheSeed = crypto.createHash("md5")
      .update(imageBuffer)
      .update(`|${wCm}|${hCm}|${frame}|${effectiveMatting}|${sizeScale}|${angle}|${level}|${pitch}|${API_VERSION}`)
      .digest("hex");
    const edgeColor = frameColor || FRAME_COLOR_MAP[frame] || "#3d2b1f";
    return await generateAndCache(
      request, imageBuffer, outerWCm, outerHCm, cacheSeed, angle, level, pitch, edgeColor, sizeLabel,
    );
  } catch (err: any) {
    console.error("[ar-model POST error]", err?.message || err);
    return errorResponse("Failed to generate AR model: " + (err?.message || "unknown"));
  }
}

const FRAME_COLOR_MAP: Record<string, string> = {
  "natural-timber": "#c4a574",
  white:            "#f5f5f0",
  black:            "#1a1a1a",
};

const MAT_INCH_CM = 2.54;
const FRAME_CM = 1.5;

async function compositeFramedProductImage(
  imageBuffer: Buffer,
  frame: string,
  matting: string,
  frameColor = "",
  outerWCm = 60,
  outerHCm = 40,
): Promise<Buffer> {
  const { createCanvas, loadImage } = await import("canvas");
  const img = await loadImage(imageBuffer);
  const artW = 1024;
  const imgRatio = img.height / img.width;
  const artH = Math.round(artW * imgRatio);
  const outerHCmActual = outerWCm * imgRatio;

  const framePx = frame === "none" ? 0 : Math.max(6, Math.round((FRAME_CM / outerWCm) * artW));
  const framePy = frame === "none" ? 0 : Math.max(6, Math.round((FRAME_CM / outerHCmActual) * artH));
  const matPx = frame !== "none" && matting === "1" ? Math.max(8, Math.round((MAT_INCH_CM / outerWCm) * artW)) : 0;
  const matPy = frame !== "none" && matting === "1" ? Math.max(8, Math.round((MAT_INCH_CM / outerHCmActual) * artH)) : 0;
  const color = frameColor || FRAME_COLOR_MAP[frame] || "#1a1a1a";

  const canvas = createCanvas(artW, artH);
  const ctx = canvas.getContext("2d");

  if (framePx > 0 || framePy > 0) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, artW, artH);
  }
  if (matPx > 0 || matPy > 0) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(framePx, framePy, artW - framePx * 2, artH - framePy * 2);
  }

  const innerW = artW - (framePx + matPx) * 2;
  const innerH = artH - (framePy + matPy) * 2;
  if (innerW > 0 && innerH > 0) {
    let drawW = innerW;
    let drawH = innerH;
    if (imgRatio > drawH / drawW) {
      drawH = innerH;
      drawW = drawH / imgRatio;
    } else {
      drawW = innerW;
      drawH = drawW * imgRatio;
    }
    const ox = framePx + matPx + (innerW - drawW) / 2;
    const oy = framePy + matPy + (innerH - drawH) / 2;
    ctx.drawImage(img as any, ox, oy, drawW, drawH);
  }

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

type FrameContext = Awaited<ReturnType<typeof buildFrameContext>>;

function applyFrameTilt(
  object: { rotation: { order: string; x: number; y: number; z: number } },
  THREE: typeof import("three"),
  angleDeg: number,
  pitchDeg: number,
  levelDeg: number,
) {
  object.rotation.order = "YXZ";
  object.rotation.y = THREE.MathUtils.degToRad(angleDeg);
  object.rotation.x = THREE.MathUtils.degToRad(pitchDeg);
  object.rotation.z = THREE.MathUtils.degToRad(levelDeg);
}

// ── Shared texture/materials for GLB + USDZ exports ─────────────────────────
async function buildFrameContext(
  imageBuffer: Buffer,
  wCm: number,
  hCm: number,
  angleDeg = 0,
  levelDeg = 0,
  pitchDeg = 0,
  edgeColor = "#3d2b1f",
) {
  // Use the shopper-selected paper size exactly (cm → meters).
  // Do NOT derive height from the image aspect — that made every size
  // share the photo ratio and ignored the customizer size dropdown.
  const wM = Math.max(0.01, wCm / 100);
  const hM = Math.max(0.01, hCm / 100);

  await ensureNodeDomPolyfills();

  const { createCanvas, loadImage } = await import("canvas");
  const img = await loadImage(imageBuffer);

  const MAX = 1024;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const tw = Math.round(img.width * scale);
  const th = Math.round(img.height * scale);

  const canvas = createCanvas(tw, th);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img as any, 0, 0, tw, th);

  const THREE = await import("three");

  const texture = new THREE.CanvasTexture(canvas as any);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.needsUpdate = true;

  const frontMat = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.85,
    metalness: 0.0,
  });
  const backMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.92,
    metalness: 0.0,
  });
  const edgeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(edgeColor),
    roughness: 0.78,
    metalness: 0.04,
  });

  return {
    THREE,
    wM,
    hM,
    frontMat,
    backMat,
    edgeMat,
    angleDeg,
    levelDeg,
    pitchDeg,
  };
}

/**
 * GLB/Android: exact paper-size poster. Optional 1m calibration bounds only
 * when the paper is smaller than 1m so Scene Viewer does not upscale A4 to
 * ~1m (which made A4 and B0 look identical). Never use a 2m box — that made
 * B0 appear ~half size (~20in instead of ~39in).
 */
function createGLBScene(frame: FrameContext) {
  const { THREE, wM, hM, frontMat, backMat, edgeMat, angleDeg, levelDeg, pitchDeg } = frame;
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  root.name = "arPosterRoot";

  const poster = new THREE.Mesh(
    new THREE.BoxGeometry(wM, hM, FRAME_DEPTH_M),
    [edgeMat, edgeMat, edgeMat, edgeMat, frontMat, backMat],
  );
  poster.name = "arPoster";
  applyFrameTilt(poster, THREE, angleDeg, pitchDeg, levelDeg);
  root.add(poster);

  const longest = Math.max(wM, hM);
  if (longest < AR_CALIBRATION_EXTENT_M - 0.001) {
    const calib = new THREE.Mesh(
      new THREE.BoxGeometry(AR_CALIBRATION_EXTENT_M, AR_CALIBRATION_EXTENT_M, 0.0001),
      new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
        colorWrite: false,
      }),
    );
    calib.name = "arSizeCalibration1m";
    calib.visible = false;
    root.add(calib);
  }

  scene.add(root);
  return scene;
}

/**
 * USDZ/iOS: portrait plane (+Z faces viewer on wall). Single mesh for Quick Look.
 * GLB/Android unchanged in createGLBScene.
 */
function createUSDZScene(frame: FrameContext) {
  const { THREE, wM, hM, frontMat } = frame;
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), frontMat);
  scene.add(mesh);
  return scene;
}

async function exportGLB(scene: ReturnType<typeof createGLBScene>): Promise<Buffer> {
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
      { binary: true, embedImages: true, onlyVisible: false },
    );
  });
}

async function exportUSDZ(scene: ReturnType<typeof createUSDZScene>): Promise<Buffer> {
  const { USDZExporter } = await import("three/examples/jsm/exporters/USDZExporter.js");
  const exporter = new USDZExporter();
  const arrayBuffer = await exporter.parseAsync(scene, {
    quickLookCompatible: true,
    includeAnchoringProperties: false,
  });
  return Buffer.from(arrayBuffer);
}
