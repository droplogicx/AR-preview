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

  if (!value.startsWith("/api/ar-model/file/")) return "";
  const name = value.slice("/api/ar-model/file/".length);
  if (!/^[\w-]+\.(usdz|glb)$/.test(name)) return "";
  return `/api/ar-model/file/${name}`;
}
