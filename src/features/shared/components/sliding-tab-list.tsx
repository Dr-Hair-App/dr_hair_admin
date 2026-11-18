"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

type SlidingTabListProps = HTMLAttributes<HTMLDivElement> & {
  activeKey: string;
  label: string;
  children: ReactNode;
  indicatorVariant?: "pill" | "underline";
};

/** A measured, accessible tab list with a single animated selection pill and keyboard navigation. */
export function SlidingTabList({ activeKey, label, children, className = "", indicatorVariant = "pill", onKeyDown, ...props }: SlidingTabListProps) {
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (!listRef.current) return;
    const tabs = Array.from(listRef.current.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (currentIndex === -1) return;

    let targetIndex = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      targetIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      targetIndex = 0;
    } else if (event.key === "End") {
      targetIndex = tabs.length - 1;
    }

    if (targetIndex !== -1) {
      event.preventDefault();
      const target = tabs[targetIndex];
      target.focus();
      target.click();
    }
  };

  return (
    <div
      {...props}
      ref={listRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      className={`sliding-tabs ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className={`sliding-tab-indicator${indicatorVariant === "underline" ? " is-underline" : ""}${indicator ? " is-ready" : ""}`}
        style={indicator ? { width: indicator.width, height: indicator.height, transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)` } : undefined}
      />
      {children}
    </div>
  );
}
