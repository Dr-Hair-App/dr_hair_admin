"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Download, X } from "lucide-react";

export type ViewerImage = {
  src: string;
  alt: string;
  fileName: string;
  caption?: string;
  downloadHref?: string;
};

export function FullSizeImageViewer({ image, onClose }: { image: ViewerImage | null; onClose: () => void }) {
  const [isClosing, setIsClosing] = useState(false);
  const [prevImage, setPrevImage] = useState(image);
  if (image !== prevImage) {
    setPrevImage(image);
    setIsClosing(false);
  }
  const closingRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const requestClose = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onCloseRef.current();
    } else {
      window.setTimeout(() => {
        onCloseRef.current();
      }, 160);
    }
  };

  useEffect(() => {
    if (!image) return;
    closingRef.current = false;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") requestClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [image]);

  if (!image) return null;

  const downloadUrl = image.downloadHref || image.src;
  return (
    <div
      className={`fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-3 backdrop-blur-sm sm:p-6 transition-opacity duration-200 ${
        isClosing ? "opacity-0 pointer-events-none" : "opacity-100 animate-in fade-in"
      }`}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        className={`relative flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101827] shadow-2xl transition-transform duration-200 ${
          isClosing ? "scale-95" : "animate-in zoom-in-95"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={`Image preview: ${image.alt}`}
      >
        <header className="flex min-w-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white sm:px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{image.alt}</p>
            {image.caption && <p className="mt-0.5 truncate text-xs text-slate-300">{image.caption}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {downloadUrl && (
              <a
                href={downloadUrl}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              >
                <Download size={14} aria-hidden="true" />
                <span>Download</span>
              </a>
            )}
            <button
              type="button"
              onClick={requestClose}
              className="grid h-9 w-9 place-items-center rounded-lg text-slate-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
              aria-label="Close image preview"
            >
              <X size={18} />
            </button>
          </div>
        </header>
        <div className="relative min-h-0 flex-1 bg-black/25 p-3 sm:p-5">
          <div className="relative mx-auto h-[min(76dvh,780px)] w-full">
            <Image src={image.src} alt={image.alt} fill unoptimized sizes="100vw" className="object-contain" priority />
          </div>
        </div>
        <p className="sr-only">Use Escape to close this image preview.</p>
      </section>
    </div>
  );
}
