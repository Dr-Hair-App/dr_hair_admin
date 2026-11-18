const MAX_BYTES = 25 * 1024 * 1024;
const OPTIMIZE_ABOVE_BYTES = 1536 * 1024;
const TARGET_BYTES = 5 * 1024 * 1024;
const MAX_EDGE = 2560;
const MAX_PIXELS = 40_000_000;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  avif: "image/avif", heic: "image/heic", heif: "image/heif", gif: "image/gif",
};

export type SmartImageVariant = { file: File; format: "webp" | "avif" };
export type SmartImagePreparation = {
  original: File;
  variants: SmartImageVariant[];
  processingStatus: "ready" | "already_optimized" | "below_threshold" | "animation_preserved" | "encoder_unavailable" | "optimization_failed";
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
  const extension = file.name.split(".").pop()?.toLowerCase() || "";
  if (extension === "gif") return { original: file, variants: [], processingStatus: "animation_preserved" };
  if ((extension === "webp" || extension === "avif") && file.size <= TARGET_BYTES) {
    return { original: file, variants: [], processingStatus: "already_optimized" };
  }
  if (file.size <= OPTIMIZE_ABOVE_BYTES) {
    return { original: file, variants: [], processingStatus: "below_threshold" };
  }
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return { original: file, variants: [], processingStatus: "encoder_unavailable" };
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > MAX_PIXELS) {
      return { original: file, variants: [], processingStatus: "optimization_failed" };
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return { original: file, variants: [], processingStatus: "encoder_unavailable" };
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const variants: SmartImageVariant[] = [];
    for (const [format, quality] of [["webp", 0.84], ["avif", 0.72]] as const) {
      const blob = await canvasToBlob(canvas, `image/${format}`, quality);
      if (!blob || blob.type !== `image/${format}` || blob.size >= file.size * 0.9) continue;
      const stem = file.name.replace(/\.[^.]+$/, "");
      variants.push({
        file: new File([blob], `${stem}.optimized.${format}`, {
          type: `image/${format}`,
          lastModified: file.lastModified,
        }),
        format,
      });
      if (blob.size <= TARGET_BYTES) break;
    }
    return {
      original: file,
      variants,
      processingStatus: variants.length ? "ready" : "optimization_failed",
    };
  } catch {
    return { original: file, variants: [], processingStatus: "optimization_failed" };
  } finally {
    bitmap?.close();
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mimeType, quality));
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
