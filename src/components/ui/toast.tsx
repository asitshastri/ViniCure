"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle, Info, WarningCircle, X, XCircle } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type ToastTone = "info" | "success" | "warning" | "danger";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastItem = ToastInput & { id: number; tone: ToastTone };

const ToastContext = createContext<{ toast: (input: ToastInput) => void } | null>(null);

const toneStyles: Record<ToastTone, string> = {
  info: "border-info text-info",
  success: "border-success text-success",
  warning: "border-warning text-warning",
  danger: "border-danger text-danger",
};

const toneIcons = {
  info: Info,
  success: CheckCircle,
  warning: WarningCircle,
  danger: XCircle,
} as const;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

/** Toasts never take focus. They are announced politely and dismiss themselves. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setItems((current) => [...current.slice(-3), { ...input, id, tone: input.tone ?? "info" }]);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[1000] flex flex-col items-center gap-2 p-4 pb-24 md:items-end md:pb-6"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
  const Icon = toneIcons[item.tone];
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(item.id), item.tone === "danger" ? 8000 : 5000);
    return () => window.clearTimeout(timer);
  }, [item.id, item.tone, onDismiss]);

  return (
    <div
      role="status"
      className={cn(
        "animate-toast-in bg-surface shadow-pop pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border-l-4 p-4",
        toneStyles[item.tone],
      )}
    >
      <Icon aria-hidden weight="fill" className="mt-0.5 size-5 shrink-0" />
      <div className="text-ink flex-1">
        <p className="font-semibold">{item.title}</p>
        {item.description ? <p className="text-ink-muted text-sm">{item.description}</p> : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Dismiss notification"
        className="text-ink-muted hover:bg-primary-soft -m-2 flex size-11 shrink-0 items-center justify-center rounded-lg"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
