import * as fs from "fs";
import * as path from "path";

export const AR_MODEL_CACHE_DIR = path.join(process.cwd(), ".cache", "ar-models");

export function ensureCacheDir() {
  fs.mkdirSync(AR_MODEL_CACHE_DIR, { recursive: true });
}

export function isValidCachedFile(filePath: string): boolean {
  try {
    const stat = fs.statSync(filePath);
    return stat.isFile() && stat.size > 512;
  } catch {
    return false;
  }
}

export function normalizeModelPath(raw: string): string {
  if (!raw) return "";
  let value = raw.trim();

  if (value.startsWith("https://") || value.startsWith("http://") || value.startsWith("//")) {
    try {
      const full = value.startsWith("//") ? `https:${value}` : value;
      value = new URL(full).pathname;
    } catch {
      return "";
    }
  }

  const pathOnly = value.split("?")[0].split("#")[0];
  if (!pathOnly.startsWith("/api/ar-model/file/")) return "";
  const name = pathOnly.slice("/api/ar-model/file/".length);
  // Allow hash_60x84.glb style names (dims embedded for size debugging).
  if (!/^[\w.-]+\.(usdz|glb)$/.test(name)) return "";
  return `/api/ar-model/file/${name}`;
}
