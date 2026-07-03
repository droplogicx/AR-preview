const CLAID_EDIT_URL = "https://api.claid.ai/v1/image/edit";
const CLAID_UPLOAD_URL = "https://api.claid.ai/v1/image/edit/upload";

export type EnhanceOptions = {
  polish?: boolean;
  upscale?: "smart_enhance" | "smart_resize" | "faces" | "digital_art" | "photo" | null;
  decompress?: "moderate" | "strong" | "auto" | null;
  format?: "jpeg" | "png" | "avif";
  quality?: number;
  sharpness?: number;
  contrast?: number;
  saturation?: number;
  exposure?: number;
  hdr?: number;
};

const DEFAULT_OPTIONS: Required<Pick<EnhanceOptions, "polish" | "format" | "quality">> = {
  polish: true,
  format: "jpeg",
  quality: 90,
};

function getClaidApiKey(): string {
  const key = process.env.CLAID_API_KEY?.trim();
  if (!key) {
    throw new Error("CLAID_API_KEY is not configured");
  }
  return key;
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const num = Number(value);
  if (!Number.isFinite(num)) return undefined;
  return Math.min(max, Math.max(min, num));
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (lower === "true" || lower === "1") return true;
    if (lower === "false" || lower === "0") return false;
  }
  return undefined;
}

const UPSCALE_VALUES = new Set([
  "smart_enhance",
  "smart_resize",
  "faces",
  "digital_art",
  "photo",
]);

const DECOMPRESS_VALUES = new Set(["moderate", "strong", "auto"]);
const FORMAT_VALUES = new Set(["jpeg", "png", "avif"]);

export function parseEnhanceOptions(input: unknown): EnhanceOptions {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_OPTIONS };
  }

  const raw = input as Record<string, unknown>;
  const options: EnhanceOptions = { ...DEFAULT_OPTIONS };

  const polish = parseBoolean(raw.polish);
  if (polish !== undefined) options.polish = polish;

  if (typeof raw.upscale === "string" && UPSCALE_VALUES.has(raw.upscale)) {
    options.upscale = raw.upscale as EnhanceOptions["upscale"];
  } else if (raw.upscale === null) {
    options.upscale = null;
  }

  if (typeof raw.decompress === "string" && DECOMPRESS_VALUES.has(raw.decompress)) {
    options.decompress = raw.decompress as EnhanceOptions["decompress"];
  } else if (raw.decompress === null) {
    options.decompress = null;
  }

  if (typeof raw.format === "string" && FORMAT_VALUES.has(raw.format)) {
    options.format = raw.format as EnhanceOptions["format"];
  }

  const quality = clampNumber(raw.quality, 1, 100);
  if (quality !== undefined) options.quality = quality;

  const sharpness = clampNumber(raw.sharpness, 0, 100);
  if (sharpness !== undefined) options.sharpness = sharpness;

  const contrast = clampNumber(raw.contrast, -100, 100);
  if (contrast !== undefined) options.contrast = contrast;

  const saturation = clampNumber(raw.saturation, -100, 100);
  if (saturation !== undefined) options.saturation = saturation;

  const exposure = clampNumber(raw.exposure, -100, 100);
  if (exposure !== undefined) options.exposure = exposure;

  const hdr = clampNumber(raw.hdr, 0, 100);
  if (hdr !== undefined) options.hdr = hdr;

  return options;
}

function buildClaidPayload(options: EnhanceOptions, input?: string) {
  const restorations: Record<string, unknown> = {};
  if (options.polish !== undefined) restorations.polish = options.polish;
  if (options.upscale !== undefined) restorations.upscale = options.upscale;
  if (options.decompress !== undefined) restorations.decompress = options.decompress;

  const adjustments: Record<string, number> = {};
  if (options.sharpness !== undefined) adjustments.sharpness = options.sharpness;
  if (options.contrast !== undefined) adjustments.contrast = options.contrast;
  if (options.saturation !== undefined) adjustments.saturation = options.saturation;
  if (options.exposure !== undefined) adjustments.exposure = options.exposure;
  if (options.hdr !== undefined) adjustments.hdr = options.hdr;

  const operations: Record<string, unknown> = {
    restorations,
  };
  if (Object.keys(adjustments).length > 0) {
    operations.adjustments = adjustments;
  }

  const payload: Record<string, unknown> = {
    operations,
    output: {
      format: {
        type: options.format || DEFAULT_OPTIONS.format,
        quality: options.quality ?? DEFAULT_OPTIONS.quality,
      },
    },
  };

  if (input) payload.input = input;
  return payload;
}

type ClaidEditResponse = {
  data?: {
    output?: {
      tmp_url?: string;
      url?: string;
    };
  };
  output?: {
    tmp_url?: string;
    url?: string;
  };
};

function extractEnhancedUrl(data: ClaidEditResponse): string | null {
  return (
    data?.data?.output?.tmp_url ||
    data?.data?.output?.url ||
    data?.output?.tmp_url ||
    data?.output?.url ||
    null
  );
}

export async function enhanceImageFromUrl(
  imageUrl: string,
  options: EnhanceOptions = DEFAULT_OPTIONS,
): Promise<string> {
  const apiKey = getClaidApiKey();

  const response = await fetch(CLAID_EDIT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildClaidPayload(options, imageUrl)),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Claid request failed (${response.status})`);
  }

  const data = (await response.json()) as ClaidEditResponse;
  const enhancedUrl = extractEnhancedUrl(data);
  if (!enhancedUrl) {
    throw new Error("No output URL returned from Claid");
  }

  return enhancedUrl;
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string; ext: string } {
  const match = dataUrl.match(/^data:(image\/[\w+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error("Invalid image data URL");
  }

  const mime = match[1].toLowerCase();
  const ext =
    mime.includes("png") ? "png" :
    mime.includes("webp") ? "webp" :
    mime.includes("gif") ? "gif" :
    "jpg";

  return {
    mime,
    ext,
    buffer: Buffer.from(match[2], "base64"),
  };
}

export async function enhanceImageFromBuffer(
  imageBuffer: Buffer,
  filename = "upload.jpg",
  mimeType = "image/jpeg",
  options: EnhanceOptions = DEFAULT_OPTIONS,
): Promise<string> {
  const apiKey = getClaidApiKey();

  const formData = new FormData();
  const blob = new Blob([imageBuffer], { type: mimeType });
  formData.append("file", blob, filename);
  formData.append("data", JSON.stringify(buildClaidPayload(options)));

  const response = await fetch(CLAID_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(errText || `Claid upload failed (${response.status})`);
  }

  const data = (await response.json()) as ClaidEditResponse;
  const enhancedUrl = extractEnhancedUrl(data);
  if (!enhancedUrl) {
    throw new Error("No output URL returned from Claid");
  }

  return enhancedUrl;
}

export async function enhanceImageFromDataUrl(
  dataUrl: string,
  options: EnhanceOptions = DEFAULT_OPTIONS,
): Promise<string> {
  const { buffer, mime, ext } = parseDataUrl(dataUrl);
  return enhanceImageFromBuffer(buffer, `upload.${ext}`, mime, options);
}

export async function parseMultipartImageFile(formData: FormData): Promise<{
  buffer: Buffer;
  filename: string;
  mimeType: string;
} | null> {
  const file = formData.get("file") ?? formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    return null;
  }

  return {
    buffer: Buffer.from(new Uint8Array(await file.arrayBuffer())),
    filename: file.name || "upload.jpg",
    mimeType: file.type || "image/jpeg",
  };
}

export function parseEnhanceOptionsFromFormData(formData: FormData): EnhanceOptions {
  const rawOptions = formData.get("options");
  if (typeof rawOptions === "string" && rawOptions.trim()) {
    try {
      return parseEnhanceOptions(JSON.parse(rawOptions));
    } catch {
      throw new Error("Invalid JSON in options field");
    }
  }

  return parseEnhanceOptions({
    polish: formData.get("polish"),
    upscale: formData.get("upscale"),
    decompress: formData.get("decompress"),
    format: formData.get("format"),
    quality: formData.get("quality"),
    sharpness: formData.get("sharpness"),
    contrast: formData.get("contrast"),
    saturation: formData.get("saturation"),
    exposure: formData.get("exposure"),
    hdr: formData.get("hdr"),
  });
}
