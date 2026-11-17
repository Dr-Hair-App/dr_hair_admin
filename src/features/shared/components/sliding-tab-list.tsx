"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

type SlidingTabListProps = HTMLAttributes<HTMLDivElement> & {
  activeKey: string;
  label: string;
  children: ReactNode;
  indicatorVariant?: "pill" | "underline";
};

/** A measured, accessible tab list with a single animated selection pill. */
export function SlidingTabList({ activeKey, label, children, className = "", indicatorVariant = "pill", ...props }: SlidingTabListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [indicator, setIndicator] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const selected = list.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
        if (!selected) {
          setIndicator(null);
          return;
        }
        const listRect = list.getBoundingClientRect();
        const selectedRect = selected.getBoundingClientRect();
        setIndicator({
          left: selectedRect.left - listRect.left - list.clientLeft + list.scrollLeft,
          top: indicatorVariant === "underline"
            ? selectedRect.bottom - listRect.top - list.clientTop - 2 + list.scrollTop
            : selectedRect.top - listRect.top - list.clientTop + list.scrollTop,
          width: selectedRect.width,
          height: indicatorVariant === "underline" ? 2 : selectedRect.height,
        });
      });
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((tab) => observer?.observe(tab));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [activeKey, children, indicatorVariant]);

  return (
    <div {...props} ref={listRef} role="tablist" aria-label={label} className={`sliding-tabs ${className}`.trim()}>
      <span
        aria-hidden="true"
        className={`sliding-tab-indicator${indicatorVariant === "underline" ? " is-underline" : ""}${indicator ? " is-ready" : ""}`}
        style={indicator ? { width: indicator.width, height: indicator.height, transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)` } : undefined}
      />
      {children}
    </div>
  );
}
