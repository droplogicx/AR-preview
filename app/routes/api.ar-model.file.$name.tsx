// app/routes/api.ar-model.file.$name.tsx
// Serves cached .glb files

import * as fs   from "fs";
import * as os   from "os";
import * as path from "path";

const CACHE_DIR = path.join(os.tmpdir(), "ar-models");

export async function loader({ params }: { params: { name?: string } }) {
  const name = params.name || "";

  // Security: only .glb, no traversal
  if (!name.endsWith(".glb") || name.includes("/") || name.includes("..") || name.includes("\0")) {
    return new Response("Not found", { status: 404 });
  }

  const filePath = path.join(CACHE_DIR, name);

  if (!fs.existsSync(filePath)) {
    return new Response("Model not found. It may still be generating.", { status: 404 });
  }

  const buffer = fs.readFileSync(filePath);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type":                "model/gltf-binary",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control":               "public, max-age=86400",
      "Content-Length":              String(buffer.byteLength),
    },
  });
}
