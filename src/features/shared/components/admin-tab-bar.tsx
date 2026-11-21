"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type AdminTabBarProps = HTMLAttributes<HTMLDivElement> & {
  activeKey: string;
  label: string;
  children: ReactNode;
};

/** Shared, accessible tab list with an animated selection pill and arrow-key navigation. */
export function AdminTabBar({ activeKey, label, children, className = "", onKeyDown, ...props }: AdminTabBarProps) {
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
          top: selectedRect.top - listRect.top - list.clientTop + list.scrollTop,
          width: selectedRect.width,
          height: selectedRect.height,
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
  }, [activeKey, children]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (!listRef.current) return;
    const tabs = Array.from(listRef.current.querySelectorAll<HTMLElement>('[role="tab"]:not([disabled])'));
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (currentIndex === -1) return;

    let targetIndex = -1;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") targetIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") targetIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") targetIndex = 0;
    else if (event.key === "End") targetIndex = tabs.length - 1;

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
      aria-orientation="horizontal"
      onKeyDown={handleKeyDown}
      className={`admin-tab-bar ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className={`admin-tab-indicator${indicator ? " is-ready" : ""}`}
        style={indicator ? { width: indicator.width, height: indicator.height, transform: `translate3d(${indicator.left}px, ${indicator.top}px, 0)` } : undefined}
      />
      {children}
    </div>
  );
}

type AdminTabProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  icon: LucideIcon;
  badge?: ReactNode;
  badgeClassName?: string;
  suffix?: ReactNode;
  compactOnMobile?: boolean;
};

/** Shared tab button; keeps its label available to assistive technology when visually compact. */
export function AdminTab({ label, icon: Icon, badge, badgeClassName = "", suffix, compactOnMobile = true, className = "", type = "button", title, ...props }: AdminTabProps) {
  return (
    <button
      {...props}
      type={type}
      role="tab"
      aria-label={props["aria-label"] ?? label}
      title={title ?? label}
      className={`admin-tab${compactOnMobile ? " admin-tab--compact-mobile" : ""} ${className}`.trim()}
    >
      <Icon size={17} aria-hidden="true" />
      <span className="admin-tab-label">{label}</span>
      {badge !== undefined && <span className={`admin-tab-badge ${badgeClassName}`.trim()}>{badge}</span>}
      {suffix}
    </button>
  );
}
