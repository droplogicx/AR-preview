const CLAID_EDIT_URL = "https://api.claid.ai/v1/image/edit";
const CLAID_UPLOAD_URL = "https://api.claid.ai/v1/image/edit/upload";

type ResizeDimension = number | "auto" | `${number}%`;
type ResizeFit = "bounds" | "cover" | "canvas" | "crop" | "outpaint";

type ResizeOptions = {
  width?: ResizeDimension;
  height?: ResizeDimension;
  fit?: ResizeFit;
};

export type EnhanceOptions = {
  polish?: boolean;
  upscale?: "smart_enhance" | "smart_resize" | "faces" | "digital_art" | "photo" | null;
  decompress?: "moderate" | "strong" | "auto" | null;
  resizing?: ResizeOptions;
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
const RESIZE_FIT_VALUES = new Set(["bounds", "cover", "canvas", "crop", "outpaint"]);

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function parseResizeDimension(value: unknown): ResizeDimension | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }

  if (typeof value !== "string") return undefined;
  const raw = value.trim().toLowerCase();
  if (raw === "auto") return "auto";
  // Percentage (e.g. "50%")
  if (/^\d+(?:\.\d+)?%$/.test(raw) && Number.parseFloat(raw) > 0) {
    return raw as `${number}%`;
  }
  // Plain numeric strings (e.g. "2000") -> treat as pixels
  if (/^\d+(?:\.\d+)?$/.test(raw)) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n) && n > 0) return Math.round(n);
  }
  return undefined;
}

function parseResizeOptions(value: unknown): ResizeOptions | undefined {
  const raw = asRecord(value);
  if (!raw) return undefined;

  const resizing: ResizeOptions = {};
  const width = parseResizeDimension(raw.width);
  const height = parseResizeDimension(raw.height);
  if (width !== undefined) resizing.width = width;
  if (height !== undefined) resizing.height = height;
  if (typeof raw.fit === "string" && RESIZE_FIT_VALUES.has(raw.fit)) {
    resizing.fit = raw.fit as ResizeFit;
  }

  return Object.keys(resizing).length > 0 ? resizing : undefined;
}

export function parseEnhanceOptions(input: unknown): EnhanceOptions {
  if (!input || typeof input !== "object") {
    return { ...DEFAULT_OPTIONS };
  }

  const raw = input as Record<string, unknown>;
  const operations = asRecord(raw.operations);
  const restorations = asRecord(operations?.restorations);
  const options: EnhanceOptions = { ...DEFAULT_OPTIONS };

  const polish = parseBoolean(raw.polish ?? restorations?.polish);
  if (polish !== undefined) options.polish = polish;

  const upscale = raw.upscale ?? restorations?.upscale;
  if (typeof upscale === "string" && UPSCALE_VALUES.has(upscale)) {
    options.upscale = upscale as EnhanceOptions["upscale"];
  } else if (upscale === null) {
    options.upscale = null;
  }

  const decompress = raw.decompress ?? restorations?.decompress;
  if (typeof decompress === "string" && DECOMPRESS_VALUES.has(decompress)) {
    options.decompress = decompress as EnhanceOptions["decompress"];
  } else if (decompress === null) {
    options.decompress = null;
  }

  const resizing = parseResizeOptions(raw.resizing ?? operations?.resizing);
  if (resizing) options.resizing = resizing;

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
  if (options.resizing) {
    operations.resizing = options.resizing;
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

  // Support legacy or alternative clients that send only the `operations` JSON.
  // If `operations` is provided as a JSON string, treat it as { operations: ... }.
  const rawOperations = formData.get("operations");
  if (typeof rawOperations === "string" && rawOperations.trim()) {
    try {
      const ops = JSON.parse(rawOperations);
      return parseEnhanceOptions({ operations: ops });
    } catch {
      throw new Error("Invalid JSON in operations field");
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
