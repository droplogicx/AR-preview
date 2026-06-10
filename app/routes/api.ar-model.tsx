// app/routes/api.ar-model.tsx
// GET  /api/ar-model?img=URL&w=60&h=40
// POST /api/ar-model  { image: "data:image/png;base64,...", w, h, frame, matting, sizeScale }
// Returns { glb: "https://...", usdz: "https://..." }

import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";

const APP_URL   = (process.env.SHOPIFY_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const CACHE_DIR = path.join(os.tmpdir(), "ar-models");

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function errorResponse(message: string, status = 500) {
  return Response.json({ error: message }, { status, headers: CORS });
}

async function generateAndCache(
  imageBuffer: Buffer,
  wCm: number,
  hCm: number,
  cacheSeed: string,
  angle = 0,
  level = 0,
  pitch = 0,
) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const hash     = crypto.createHash("md5").update(cacheSeed).digest("hex");
  const glbName  = `${hash}.glb`;
  const usdzName = `${hash}.usdz`;
  const glbPath  = path.join(CACHE_DIR, glbName);
  const usdzPath = path.join(CACHE_DIR, usdzName);
  const glbUrl   = `${APP_URL}/api/ar-model/file/${glbName}`;
  const usdzUrl  = `${APP_URL}/api/ar-model/file/${usdzName}`;

  const needsGlb  = !fs.existsSync(glbPath);
  const needsUsdz = !fs.existsSync(usdzPath);

  if (needsGlb || needsUsdz) {
    const scene = await createARScene(imageBuffer, wCm, hCm, angle, level, pitch);
    if (needsGlb)  fs.writeFileSync(glbPath,  await exportGLB(scene));
    if (needsUsdz) fs.writeFileSync(usdzPath, await exportUSDZ(scene));
  }

  return Response.json({ glb: glbUrl, usdz: usdzUrl }, { headers: CORS });
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
    return await generateAndCache(imageBuffer, wCm, hCm, cacheSeed);
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
    const dataUrl  = body.image || "";
    const wCm      = parseFloat(body.w || "60");
    const hCm      = parseFloat(body.h || "40");
    const frame     = body.frame || "none";
    const matting   = body.matting || "none";
    const sizeScale = body.sizeScale || 1;
    const angle     = parseFloat(body.angle ?? "0") || 0;
    const level     = parseFloat(body.level ?? "0") || 0;
    const pitch     = parseFloat(body.pitch ?? "0") || 0;

    if (!dataUrl) {
      return errorResponse("image field required", 400);
    }

    const imageBuffer = parseDataUrlImage(dataUrl);
    const cacheSeed   = crypto.createHash("md5")
      .update(imageBuffer)
      .update(`|${wCm}|${hCm}|${frame}|${matting}|${sizeScale}|${angle}|${level}|${pitch}`)
      .digest("hex");
    return await generateAndCache(imageBuffer, wCm, hCm, cacheSeed, angle, level, pitch);
  } catch (err: any) {
    console.error("[ar-model POST error]", err?.message || err);
    return errorResponse("Failed to generate AR model: " + (err?.message || "unknown"));
  }
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
