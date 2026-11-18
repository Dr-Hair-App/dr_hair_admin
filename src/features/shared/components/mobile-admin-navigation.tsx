"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { NavigationItem } from "../lib/permissions";
import type { PageKey } from "../types";

const primaryKeys: PageKey[] = ["overview", "catalog", "bookings", "content"];
const shortLabels: Partial<Record<PageKey, string>> = {
  overview: "Home",
  patients: "Patients",
  catalog: "Commerce",
  orders: "Orders",
  bookings: "Bookings",
  content: "App",
  tests: "Tests",
  team: "Team",
  activity: "Accounts",
  notifications: "Alerts",
};

export function MobileAdminNavigation({
  items,
  page,
  onNavigate,
  renderIcon,
}: {
  items: NavigationItem[];
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  renderIcon: (key: string, isActive: boolean) => React.ReactNode;
}) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const orderedItems = useMemo(() => {
    const priority = (key: PageKey) => {
      const index = primaryKeys.indexOf(key);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...items].sort((a, b) => priority(a.key) - priority(b.key));
  }, [items]);

  const primaryItems = primaryKeys
    .map((key) => orderedItems.find((item) => item.key === key))
    .filter((item): item is NavigationItem => Boolean(item));
  const primaryKeysSet = new Set(primaryItems.map((item) => item.key));
  const moreItems = orderedItems.filter((item) => !primaryKeysSet.has(item.key));
  const moreIsActive = moreItems.some((item) => item.key === page);
  const activePrimaryIndex = primaryItems.findIndex((item) => item.key === page);
  const activeTabIndex = activePrimaryIndex >= 0 ? activePrimaryIndex : primaryItems.length;
  const tabCount = primaryItems.length + 1;

  const closeMore = useCallback(() => {
    setIsClosing(true);
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsMoreOpen(false);
      setIsClosing(false);
      moreButtonRef.current?.focus();
    } else {
      window.setTimeout(() => {
        setIsMoreOpen(false);
        setIsClosing(false);
        moreButtonRef.current?.focus();
      }, 180);
    }
  }, []);

  useEffect(() => {
    if (!isMoreOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMore();
      if (event.key === "Tab" && sheetRef.current) {
        const focusables = sheetRef.current.querySelectorAll<HTMLElement>("button, [href]");
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isMoreOpen, closeMore]);

  const navigate = (key: PageKey) => {
    closeMore();
    onNavigate(key);
  };

  return (
    <>
      {isMoreOpen && (
        <div
          className={`mobile-admin-more-backdrop transition-opacity duration-200 ${
            isClosing ? "opacity-0" : "opacity-100"
          }`}
          onClick={(event) => {
            if (event.target === event.currentTarget) closeMore();
          }}
        >
          <section
            ref={sheetRef}
            className={`mobile-admin-more-sheet transition-transform duration-200 ${
              isClosing ? "translate-y-6" : ""
            }`}
            role="dialog"
            aria-modal="true"
            aria-label="More admin sections"
          >
            <div className="mobile-admin-more-heading">
              <div>
                <p>Workspace</p>
                <h2>More sections</h2>
              </div>
              <button
                type="button"
                onClick={closeMore}
                aria-label="Close more sections"
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                ×
              </button>
            </div>
            <div className="mobile-admin-more-grid">
              {moreItems.map((item) => {
                const isActive = page === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => navigate(item.key)}
                    className={`${isActive ? "mobile-admin-more-item active" : "mobile-admin-more-item"} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600`}
                  >
                    <span aria-hidden="true">{renderIcon(item.key, isActive)}</span>
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <nav className="mobile-admin-dock" aria-label="Main navigation">
        <div className="mobile-admin-dock-pill">
          <div
            className="mobile-admin-dock-track"
            style={{ "--mobile-nav-tabs": tabCount } as React.CSSProperties}
          >
            <span
              aria-hidden="true"
              className="mobile-admin-dock-indicator"
              style={{ transform: `translateX(${activeTabIndex * 100}%)` }}
            />
            {primaryItems.map((item) => {
              const isActive = page === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  onClick={() => navigate(item.key)}
                  className={isActive ? "mobile-admin-dock-item active" : "mobile-admin-dock-item"}
                >
                  <span aria-hidden="true">{renderIcon(item.key, isActive)}</span>
                  <span>{shortLabels[item.key] ?? item.label}</span>
                </button>
              );
            })}
            <button
              ref={moreButtonRef}
              type="button"
              aria-label="More admin sections"
              aria-haspopup="dialog"
              aria-expanded={isMoreOpen}
              aria-current={moreIsActive ? "page" : undefined}
              onClick={() => setIsMoreOpen(true)}
              className={moreIsActive || isMoreOpen ? "mobile-admin-dock-item active" : "mobile-admin-dock-item"}
            >
              <span aria-hidden="true"><MoreHorizontal size={19} strokeWidth={1.8} /></span>
              <span>More</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}
