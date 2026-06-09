// app/routes/api.ar-model.tsx
// GET /api/ar-model?img=URL&w=60&h=40
// Returns { glb: "https://..." }

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
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function loader({ request }: { request: Request }) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url    = new URL(request.url);
  const imgUrl = url.searchParams.get("img") || "";
  const wCm    = parseFloat(url.searchParams.get("w") || "60");
  const hCm    = parseFloat(url.searchParams.get("h") || "40");

  if (!imgUrl) {
    return Response.json({ error: "img param required" }, { status: 400, headers: CORS });
  }

  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });

    const hash    = crypto.createHash("md5").update(`${imgUrl}-${wCm}-${hCm}`).digest("hex");
    const glbName = `${hash}.glb`;
    const glbPath = path.join(CACHE_DIR, glbName);
    const glbUrl  = `${APP_URL}/api/ar-model/file/${glbName}`;

    // Serve from cache if already generated
    if (fs.existsSync(glbPath)) {
      return Response.json({ glb: glbUrl, usdz: null }, { headers: CORS });
    }

    // Download the product image
    const imageBuffer = await downloadImage(imgUrl);

    // Build GLB
    const glbBuffer = await buildGLB(imageBuffer, wCm, hCm);
    fs.writeFileSync(glbPath, glbBuffer);

    return Response.json({ glb: glbUrl, usdz: null }, { headers: CORS });

  } catch (err: any) {
    console.error("[ar-model error]", err?.message || err);
    return Response.json({ error: "Failed to generate AR model: " + (err?.message || "unknown") }, { status: 500, headers: CORS });
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

// ── Build GLB from image ──────────────────────────────────────────────────────
async function buildGLB(imageBuffer: Buffer, wCm: number, hCm: number): Promise<Buffer> {
  const wM = Math.max(0.01, wCm / 100); // cm → meters, min 1cm
  const hM = Math.max(0.01, hCm / 100);

  await ensureNodeDomPolyfills();

  // node-canvas to get image dimensions and pixel data
  const { createCanvas, loadImage } = await import("canvas");
  const img = await loadImage(imageBuffer);

  // Limit texture size to avoid memory issues
  const MAX = 1024;
  const scale = Math.min(1, MAX / Math.max(img.width, img.height));
  const tw = Math.round(img.width  * scale);
  const th = Math.round(img.height * scale);

  const canvas = createCanvas(tw, th);
  const ctx    = canvas.getContext("2d");
  ctx.drawImage(img as any, 0, 0, tw, th);
  const imageData = ctx.getImageData(0, 0, tw, th);

  // Three.js (works in Node — no DOM needed for geometry + exporter)
  const THREE = await import("three");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");

  const scene    = new THREE.Scene();
  const geometry = new THREE.PlaneGeometry(wM, hM);

  const texture = new THREE.DataTexture(
    new Uint8Array(imageData.data.buffer),
    tw,
    th,
    THREE.RGBAFormat
  );
  texture.needsUpdate = true;
  texture.colorSpace  = THREE.SRGBColorSpace;
  texture.flipY       = true;

  const material = new THREE.MeshStandardMaterial({
    map:       texture,
    side:      THREE.FrontSide,
    roughness: 0.85,
    metalness: 0.0,
  });

  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
        } else {
          // Should not happen with binary:true but handle gracefully
          const str = JSON.stringify(result);
          resolve(Buffer.from(str, "utf-8"));
        }
      },
      (err: Error) => reject(err),
      { binary: true, embedImages: true }
    );
  });
}
