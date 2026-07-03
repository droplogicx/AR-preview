// POST /api/enhance-image
// JSON: { imageUrl, image, polish, upscale, quality, format, ... }
// multipart/form-data: file=<image> + optional options JSON or individual fields

import {
  enhanceImageFromBuffer,
  enhanceImageFromDataUrl,
  enhanceImageFromUrl,
  parseEnhanceOptions,
  parseEnhanceOptionsFromFormData,
  parseMultipartImageFile,
} from "../claid.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function errorResponse(message: string, status = 500) {
  return Response.json({ error: message }, { status, headers: CORS });
}

export async function action({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const imageFile = await parseMultipartImageFile(formData);
      if (!imageFile) {
        return errorResponse("file or image field required", 400);
      }

      const options = parseEnhanceOptionsFromFormData(formData);
      const url = await enhanceImageFromBuffer(
        imageFile.buffer,
        imageFile.filename,
        imageFile.mimeType,
        options,
      );
      return Response.json({ url }, { headers: CORS });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse("Invalid JSON body", 400);
    }

    const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    const imageDataUrl = typeof body.image === "string" ? body.image.trim() : "";
    const options = parseEnhanceOptions(body);

    if (imageUrl) {
      const url = await enhanceImageFromUrl(imageUrl, options);
      return Response.json({ url }, { headers: CORS });
    }

    if (imageDataUrl) {
      const url = await enhanceImageFromDataUrl(imageDataUrl, options);
      return Response.json({ url }, { headers: CORS });
    }

    return errorResponse("imageUrl or image field required", 400);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Image enhancement failed";
    console.error("[enhance-image]", message);
    return errorResponse(message);
  }
}
