// app/routes/api.ar-model.file.$name.tsx
// Serves cached .glb and .usdz files

import * as fs from "fs";
import * as path from "path";
import { AR_MODEL_CACHE_DIR, isValidCachedFile } from "../ar-model-cache.server";

const CACHE_DIR = AR_MODEL_CACHE_DIR;

const MIME: Record<string, string> = {
  ".glb":  "model/gltf-binary",
  ".usdz": "model/vnd.usdz+zip",
};

function fileHeaders(name: string, ext: string, byteLength: number): Record<string, string> {
  // IMPORTANT: unique Content-Disposition filename per size.
  // Using a fixed "model.usdz" made Quick Look / Scene Viewer reuse the
  // first downloaded model for every size after the first open.
  const safeName = name.replace(/[^\w.-]/g, "_") || `model${ext}`;
  return {
    "Content-Type":                  MIME[ext],
    "Access-Control-Allow-Origin":   "*",
    "Access-Control-Allow-Methods":  "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers":  "Content-Type, Range",
    "Access-Control-Expose-Headers": "Content-Length, Content-Type, Content-Disposition",
    // Unique URLs already encode size; still avoid intermediary reuse.
    "Cache-Control":                 "private, no-cache, no-store, must-revalidate",
    "Content-Length":                String(byteLength),
    "Content-Disposition":           `inline; filename="${safeName}"`,
    ...(ext === ".usdz" ? { "Accept-Ranges": "bytes" } : {}),
  };
}

export async function loader({ params, request }: { params: { name?: string }; request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Range",
      },
    });
  }

  const name = String(params.name || "").split("?")[0].split("#")[0];
  const ext  = name.slice(name.lastIndexOf(".")).toLowerCase();

  // Allow hash_60x84.glb (embedded cm tag for size debugging).
  if (
    !MIME[ext] ||
    name.includes("/") ||
    name.includes("..") ||
    name.includes("\0") ||
    !/^[\w.-]+\.(glb|usdz)$/i.test(name)
  ) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(CACHE_DIR, name);

  if (!fs.existsSync(filePath) || !isValidCachedFile(filePath)) {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    }
    return new Response("Model not found. Regenerate from the product page.", { status: 404 });
  }

  const stat = fs.statSync(filePath);

  if (request.method === "HEAD") {
    return new Response(null, {
      status: 200,
      headers: fileHeaders(name, ext, stat.size),
    });
  }

  const buffer = fs.readFileSync(filePath);

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: fileHeaders(name, ext, buffer.byteLength),
  });
}
