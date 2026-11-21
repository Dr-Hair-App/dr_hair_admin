const MAX_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2560;
const WEBP_QUALITY = 0.88;
const MIN_SAVINGS_RATIO = 0.05;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  avif: "image/avif", heic: "image/heic", heif: "image/heif", gif: "image/gif",
};

export type SmartImageVariant = { file: File; format: "webp" | "avif" };
export type SmartImagePreparation = {
  original: File;
  variants: SmartImageVariant[];
  processingStatus: "backend_processing_pending";
};

export async function validateSmartImage(file: File): Promise<void> {
  if (file.size <= 0) throw new Error("The selected image is empty.");
  if (file.size > MAX_BYTES) throw new Error("Each image must be 25 MiB or smaller.");
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  const expectedMime = MIME_BY_EXTENSION[extension];
  if (!expectedMime) throw new Error("Choose a JPG, PNG, WebP, AVIF, HEIC, HEIF, or GIF image.");
  const isJpeg = (extension === "jpg" || extension === "jpeg") && ["image/jpeg", "image/jpg", "image/pjpeg"].includes((file.type || "").toLowerCase());
  const mimeMatches = isJpeg || (file.type && file.type.toLowerCase() === expectedMime);
  if (file.type && !mimeMatches) {
    throw new Error("The file extension and image MIME type do not match.");
  }

  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  const ascii = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
  const valid = switchMime(expectedMime, bytes, ascii);
  if (!valid) throw new Error("The file content does not match its selected image format.");
}

export async function prepareSmartImage(file: File): Promise<SmartImagePreparation> {
  await validateSmartImage(file);
  const optimized = await createWebpUploadVariant(file);
  return {
    original: file,
    variants: optimized ? [optimized] : [],
    processingStatus: "backend_processing_pending",
  };
}

/**
 * Shared best-effort browser optimization for product and content uploads.
 * Unsupported decoders, animated GIFs, and browsers without canvas encoding
 * keep the validated source file. The backend remains the final optimizer.
 */
async function createWebpUploadVariant(file: File): Promise<SmartImageVariant | null> {
  const mime = (file.type || MIME_BY_EXTENSION[file.name.split(".").pop()?.toLowerCase() || ""] || "").toLowerCase();
  // Canvas would flatten animation. Keep GIFs intact and let the backend handle
  // formats this browser cannot decode (notably some HEIC/AVIF files).
  if (mime === "image/gif" || typeof createImageBitmap !== "function") return null;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file);
    if (!bitmap.width || !bitmap.height) return null;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    let blob: Blob | null;
    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvas.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
    } else {
      const canvas = Object.assign(document.createElement("canvas"), { width, height });
      const context = canvas.getContext("2d");
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, width, height);
      blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
    }
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size * (1 - MIN_SAVINGS_RATIO)) return null;

    const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
    return {
      file: new File([blob], `${baseName}.webp`, { type: "image/webp", lastModified: file.lastModified }),
      format: "webp",
    };
  } catch {
    // Keep uploads available when an image codec/canvas encoder is unavailable.
    return null;
  } finally {
    bitmap?.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function switchMime(
  mime: string,
  bytes: Uint8Array,
  ascii: (start: number, length: number) => string,
): boolean {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(ascii(0, 6));
  if (mime === "image/webp") return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
  if (mime === "image/avif") return ascii(4, 4) === "ftyp" && /avif|avis/.test(ascii(8, 24));
  if (mime === "image/heic") return ascii(4, 4) === "ftyp" && /heic|heix|hevc|hevx/.test(ascii(8, 24));
  if (mime === "image/heif") return ascii(4, 4) === "ftyp" && /heif|mif1|msf1/.test(ascii(8, 24));
  return false;
}
