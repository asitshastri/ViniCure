"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  /** "sheet" slides up from the bottom on phones. */
  variant?: "center" | "sheet";
  /** Set false for flows where closing would lose work, so only the buttons close it. */
  dismissible?: boolean;
};

/** Modal built on the native <dialog>: focus is trapped, Escape closes, focus returns to the opener. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = "center",
  dismissible = true,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
      className={cn(
        "bg-surface text-ink shadow-pop w-full max-w-lg rounded-2xl p-0",
        variant === "sheet"
          ? "animate-sheet-in md:animate-dialog-in m-0 mt-auto max-h-[88dvh] max-w-none rounded-b-none md:m-auto md:max-w-lg md:rounded-2xl"
          : "animate-dialog-in m-auto",
        "max-h-[88dvh] overflow-y-auto",
      )}
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="text-ink-muted text-base">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-ink-muted hover:bg-primary-soft hover:text-ink -m-2 flex size-11 shrink-0 items-center justify-center rounded-lg"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        {children}
        {footer ? <div className="flex flex-wrap justify-end gap-3 pt-2">{footer}</div> : null}
      </div>
    </dialog>
  );
}
