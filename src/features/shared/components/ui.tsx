"use client";

import { Check, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { Status } from "../types";

export function StatusPill({ status }: { status: Status | string }) {
  const key = status.toLowerCase();
  const className =
    key === "active" ? "status-active" :
    key === "new" ? "status-new" :
    key === "preparing" ? "status-preparing" :
    key === "shipped" || key === "in consultation" ? "status-shipped" :
    key === "needs attention" || key === "return requested" || key === "review" || key === "arrived" ? "status-review" :
    key === "paid" || key === "completed" || key === "delivered" ? "status-completed" :
    key === "partially refunded" ? "status-review" :
    key === "failed" || key === "refunded" || key === "cancelled" || key === "no show" ? "status-cancelled" :
    key === "published" ? "status-published" :
    key === "pending" ? "status-pending" :
    key === "draft" ? "status-draft" :
    key === "suspended" ? "status-suspended" : "status-inactive";
  return <span className={`status ${className}`}>{status}</span>;
}

export function Avatar({ initials }: { initials: string }) {
  return <span className="avatar" aria-hidden="true">{initials}</span>;
}

export function PageHeader({
  eyebrow, title, description, action,
}: { eyebrow?: string; title: string; description: string; action?: React.ReactNode }) {
  return (
    <header className="page-head mx-auto flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-end sm:justify-between" aria-label={title}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="page-title break-words">{title}</h1>
        <p className="page-subtitle max-w-prose">{description}</p>
      </div>
      {action && <div className="head-actions">{action}</div>}
    </header>
  );
}

export function TableToolbar({
  value, onChange, placeholder = "Search...", right,
}: { value: string; onChange: (value: string) => void; placeholder?: string; right?: React.ReactNode }) {
  return (
    <div className="toolbar flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="search" aria-label="Table filters and search">
      <div className="toolbar-left min-w-0 w-full sm:w-auto">
        <label className="input-search w-full min-w-0 sm:min-w-[210px]" aria-label={placeholder}>
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </label>
      </div>
      {right && <div className="toolbar-right flex min-w-0 w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{right}</div>}
    </div>
  );
}

export function ToggleSwitch({
  checked, onChange, disabled, label,
}: { checked: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`switch ${checked ? "on" : ""}`}
    />
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "teal" | "danger" | "ghost";
  size?: "small" | "medium" | "large";
  isLoading?: boolean;
  loadingText?: ReactNode;
  icon?: ReactNode;
  iconPosition?: "left" | "right";
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "medium",
  isLoading = false,
  loadingText,
  icon,
  iconPosition = "left",
  disabled,
  className = "",
  children,
  ...props
}: ButtonProps) {
  const variantClass =
    variant === "primary" ? "button-primary" :
    variant === "secondary" ? "button-secondary" :
    variant === "teal" ? "button-teal" :
    variant === "danger" ? "button-danger" :
    variant === "ghost" ? "button-ghost" : "button-primary";

  const sizeClass = size === "small" ? "button-small" : size === "large" ? "button-large" : "";

  return (
    <button
      {...props}
      disabled={disabled || isLoading}
      aria-busy={isLoading ? "true" : undefined}
      className={`button ${variantClass} ${sizeClass} ${isLoading ? "is-loading" : ""} ${className}`.trim()}
    >
      {isLoading ? (
        <>
          <span className="button-spinner" aria-hidden="true" />
          <span>{loadingText ?? children}</span>
        </>
      ) : (
        <>
          {icon && iconPosition === "left" && <span className="button-icon" aria-hidden="true">{icon}</span>}
          {children}
          {icon && iconPosition === "right" && <span className="button-icon" aria-hidden="true">{icon}</span>}
        </>
      )}
    </button>
  );
}

export function Modal({
  title,
  description,
  children,
  submitLabel = "Save changes",
  submitLoading = false,
  submitDisabled = false,
  submitVariant = "primary",
  className = "",
  hideCancel = false,
  hideFooter = false,
  actions,
  onClose,
  onSubmit,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  submitLabel?: ReactNode;
  submitLoading?: boolean;
  submitDisabled?: boolean;
  submitVariant?: "primary" | "danger" | "teal";
  className?: string;
  hideCancel?: boolean;
  hideFooter?: boolean;
  actions?: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [isClosing, setIsClosing] = useState(false);
  const closingRef = useRef(false);
  const modalRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Store previously focused element to return focus after modal closes (WCAG 2.1)
  useEffect(() => {
    previousFocusRef.current = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
    return () => {
      previousFocusRef.current?.focus?.();
    };
  }, []);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setIsClosing(true);
    const prefersReducedMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      onClose();
    } else {
      window.setTimeout(() => {
        onClose();
      }, 160);
    }
  }, [onClose]);

  // Keyboard navigation & Focus trapping
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        requestClose();
        return;
      }
      if (event.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey) {
          if (document.activeElement === first) {
            event.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestClose]);

  // Initial focus management
  useEffect(() => {
    if (modalRef.current) {
      const firstInput = modalRef.current.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled])'
      );
      if (firstInput) {
        firstInput.focus();
      } else {
        const firstFocusable = modalRef.current.querySelector<HTMLElement>('button:not([disabled])');
        firstFocusable?.focus();
      }
    }
  }, []);

  if (typeof document === "undefined") return null;

  const descId = description ? "modal-desc" : undefined;

  return createPortal(
    <div
      className={`modal-backdrop ${isClosing ? "is-closing" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        ref={modalRef}
        className={`modal max-h-[calc(100dvh-1.25rem)] overflow-y-auto sm:max-h-[calc(100dvh-2.5rem)] sm:rounded-[20px] ${isClosing ? "is-closing" : ""} ${className}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        aria-describedby={descId}
      >
        <div className="modal-head">
          <div>
            <div id="modal-title" className="modal-title-wrap">
              {typeof title === "string" ? <h2>{title}</h2> : title}
            </div>
            {description && (
              typeof description === "string" ? (
                <p id={descId}>{description}</p>
              ) : (
                <div id={descId}>{description}</div>
              )
            )}
          </div>
          <button
            type="button"
            className="row-action"
            aria-label="Close dialog"
            onClick={requestClose}
          >
            <X size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {!hideFooter && (
          <div className="modal-actions">
            {actions ? (
              actions
            ) : (
              <>
                {!hideCancel && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={requestClose}
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  className={`button ${
                    submitVariant === "danger"
                      ? "button-danger"
                      : submitVariant === "teal"
                      ? "button-teal"
                      : "button-primary"
                  } ${submitLoading ? "is-loading" : ""}`}
                  disabled={submitDisabled || submitLoading}
                  aria-busy={submitLoading ? "true" : undefined}
                  onClick={onSubmit}
                >
                  {submitLoading && <span className="button-spinner" aria-hidden="true" />}
                  <span>{submitLabel}</span>
                </button>
              </>
            )}
          </div>
        )}
      </section>
    </div>,
    document.body
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsClosing(true);
      window.setTimeout(onClose, 180);
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);

  const handleDismiss = () => {
    setIsClosing(true);
    window.setTimeout(onClose, 180);
  };

  return (
    <div
      className={`toast ${isClosing ? "is-closing" : ""}`}
      role="status"
      aria-live="polite"
    >
      <Check size={15} aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        className="row-action"
        aria-label="Dismiss notification"
        onClick={handleDismiss}
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function Skeleton({
  className = "",
  variant = "text",
  width,
  height,
}: {
  className?: string;
  variant?: "text" | "circular" | "rectangular" | "card";
  width?: string | number;
  height?: string | number;
}) {
  const variantClass =
    variant === "circular" ? "rounded-full" :
    variant === "rectangular" ? "rounded-lg" :
    variant === "card" ? "rounded-2xl" : "rounded";

  return (
    <div
      className={`skeleton-shimmer ${variantClass} ${className}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function TableSkeleton({
  rows = 5,
  cols = 6,
  className = "",
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={`w-full space-y-3 p-4 ${className}`} aria-hidden="true">
      <div className="flex items-center gap-4 pb-2 border-b border-slate-100">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3.5 ${i === 0 ? "w-32 flex-none" : "flex-1"}`} variant="text" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 py-2.5 border-b border-slate-50">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton
              key={c}
              className={`h-4 ${c === 0 ? "w-32 flex-none" : "flex-1"}`}
              variant="text"
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({
  count = 4,
  className = "",
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4 ${className}`} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-5 space-y-3">
          <div className="flex justify-between items-center">
            <Skeleton className="h-3 w-20" variant="text" />
            <Skeleton className="h-8 w-8 rounded-xl" variant="rectangular" />
          </div>
          <Skeleton className="h-7 w-24" variant="text" />
          <div className="pt-2 border-t border-slate-100 flex justify-between">
            <Skeleton className="h-3 w-16" variant="text" />
            <Skeleton className="h-3 w-16" variant="text" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`empty-state-card ${className}`} role="status">
      {icon && <div className="empty-state-icon" aria-hidden="true">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-description">{description}</p>}
      {action && <div className="empty-state-action">{action}</div>}
    </div>
  );
}
