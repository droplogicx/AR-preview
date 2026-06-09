// app/routes/api.ar-model.tsx
// Remix route — GET /api/ar-model?img=...&w=60&h=40&title=...
// Returns { glb: "https://...", usdz: "https://..." }
//
// Install deps first:
//   npm install three @types/three

import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import * as crypto from "crypto";

// ── Config ────────────────────────────────────────────────────────────────────
// Set this env var in Railway/Fly.io to your public app URL
const APP_URL = process.env.APP_URL || "http://localhost:3000";

// Where generated GLB files are cached (Railway has ephemeral /tmp)
const CACHE_DIR = process.env.GLB_CACHE_DIR || "/tmp/ar-models";

// ── CORS helper ───────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// ── Loader ────────────────────────────────────────────────────────────────────
export async function loader({ request }: LoaderFunctionArgs) {
  const url    = new URL(request.url);
  const imgUrl = url.searchParams.get("img")   || "";
  const wCm    = parseFloat(url.searchParams.get("w") || "60");
  const hCm    = parseFloat(url.searchParams.get("h") || "40");

  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (!imgUrl) {
    return json({ error: "img param required" }, { status: 400, headers: CORS });
  }

  try {
    // Hash the image URL + dimensions to use as cache key
    const hash    = crypto.createHash("md5").update(`${imgUrl}-${wCm}-${hCm}`).digest("hex");
    const glbName = `${hash}.glb`;
    const glbPath = path.join(CACHE_DIR, glbName);
    const glbUrl  = `${APP_URL}/api/ar-model/file/${glbName}`;

    // Return cached if exists
    if (fs.existsSync(glbPath)) {
      return json({ glb: glbUrl, usdz: null }, { headers: CORS });
    }

    // Generate new GLB
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const imageBuffer = await downloadImage(imgUrl);
    const glbBuffer   = await buildGLB(imageBuffer, wCm, hCm);
    fs.writeFileSync(glbPath, glbBuffer);

    return json({ glb: glbUrl, usdz: null }, { headers: CORS });

  } catch (err: any) {
    console.error("[ar-model]", err?.message || err);
    return json({ error: "Failed to generate AR model" }, { status: 500, headers: CORS });
  }
}

// ── Serve cached GLB file ─────────────────────────────────────────────────────
// Add this second loader in: app/routes/api.ar-model.file.$name.tsx
// (shown at bottom of this file as a comment)

// ── Download image to buffer ──────────────────────────────────────────────────
function downloadImage(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith("https") ? https : http;
    client.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Image download failed: ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
}

// ── Build GLB from image buffer ───────────────────────────────────────────────
// Creates a flat rectangular panel (like a painting/poster on a wall)
// Width and height are in centimeters → converted to meters for GLB
async function buildGLB(imageBuffer: Buffer, wCm: number, hCm: number): Promise<Buffer> {
  // Dynamic import — Three.js runs fine in Node
  const THREE = await import("three");
  const { GLTFExporter } = await import("three/examples/jsm/exporters/GLTFExporter.js");

  const wM = wCm / 100; // cm → meters
  const hM = hCm / 100;

  // Scene
  const scene = new THREE.Scene();

  // Geometry: flat plane (the painting)
  const geometry = new THREE.PlaneGeometry(wM, hM);

  // Texture from image buffer
  // Three.js TextureLoader needs a DOM in browser; in Node we use DataTexture
  const { createCanvas, loadImage } = await importCanvas();
  const img    = await loadImage(imageBuffer);
  const canvas = createCanvas(img.width, img.height);
  const ctx    = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);

  const texture = new THREE.DataTexture(
    imageData.data,
    img.width,
    img.height,
    THREE.RGBAFormat
  );
  texture.needsUpdate   = true;
  texture.colorSpace    = THREE.SRGBColorSpace;
  texture.flipY         = true;

  // Material
  const material = new THREE.MeshStandardMaterial({
    map:         texture,
    side:        THREE.FrontSide,
    roughness:   0.8,
    metalness:   0.0,
  });

  // Mesh — rotated to face viewer (plane faces +Z by default)
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  // Light (needed for MeshStandardMaterial to look correct)
  const ambient = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambient);

  // Export to GLB binary
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(
      scene,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(Buffer.from(result));
        } else {
          reject(new Error("GLTFExporter returned JSON instead of binary"));
        }
      },
      (err) => reject(err),
      { binary: true, embedImages: true }
    );
  });
}

// ── Import canvas (node-canvas) ───────────────────────────────────────────────
// Install: npm install canvas
async function importCanvas() {
  const { createCanvas, loadImage } = await import("canvas");
  return { createCanvas, loadImage };
}

/*
─────────────────────────────────────────────────────────────────────────────────
FILE SERVER ROUTE — create this as a separate file:

  app/routes/api.ar-model.file.$name.tsx

─────────────────────────────────────────────────────────────────────────────────

import type { LoaderFunctionArgs } from "@remix-run/node";
import * as fs   from "fs";
import * as path from "path";

const CACHE_DIR = process.env.GLB_CACHE_DIR || "/tmp/ar-models";

export async function loader({ params }: LoaderFunctionArgs) {
  const name    = params.name || "";
  const glbPath = path.join(CACHE_DIR, name);

  if (!name.endsWith(".glb") || !fs.existsSync(glbPath)) {
    return new Response("Not found", { status: 404 });
  }

  const buffer = fs.readFileSync(glbPath);
  return new Response(buffer, {
    headers: {
      "Content-Type":                 "model/gltf-binary",
      "Access-Control-Allow-Origin":  "*",
      "Cache-Control":                "public, max-age=86400",
      "Content-Length":               String(buffer.length),
    },
  });
}
─────────────────────────────────────────────────────────────────────────────────
*/
