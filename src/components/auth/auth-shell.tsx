import type { ReactNode } from "react";
import { LockKey, ShieldCheck } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type AuthShellProps = {
  variant?: "patient" | "staff";
  title: string;
  intro?: string;
  /** Side-panel heading for patients. Pass a translated string. Staff pages keep their own English heading. */
  privacyTitle?: string;
  /** Short plain list on the side panel: what happens with the person's data. */
  promises: string[];
  children: ReactNode;
  footer?: ReactNode;
};

/** Two columns from 1024px: a quiet side panel and the form. On phones the form comes first. */
export function AuthShell({
  variant = "patient",
  title,
  intro,
  privacyTitle = "Your privacy on ViniCure",
  promises,
  children,
  footer,
}: AuthShellProps) {
  const staff = variant === "staff";
  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:px-6 sm:py-12 lg:grid-cols-[1fr_1.1fr] lg:gap-0 lg:py-16">
      <aside
        className={cn(
          "order-2 rounded-[20px] p-6 sm:p-10 lg:order-1 lg:rounded-r-none",
          staff ? "on-dark bg-dock text-white" : "bg-primary-soft text-ink",
        )}
      >
        <div className="flex items-center gap-2">
          {staff ? (
            <LockKey aria-hidden className="size-6" />
          ) : (
            <ShieldCheck aria-hidden className="text-primary size-6" />
          )}
          <p className="font-display text-lg font-semibold">
            {staff ? "Staff area" : privacyTitle}
          </p>
        </div>
        <ul className={cn("mt-5 grid gap-4", staff ? "text-white/90" : "text-ink-muted")}>
          {promises.map((p) => (
            <li key={p} className="flex gap-3">
              <span
                aria-hidden
                className={cn(
                  "mt-2.5 size-1.5 shrink-0 rounded-full",
                  staff ? "bg-white" : "bg-primary",
                )}
              />
              <span>{p}</span>
            </li>
          ))}
        </ul>
      </aside>

      <div className="border-line bg-surface shadow-card order-1 rounded-[20px] border p-6 sm:p-10 lg:order-2 lg:rounded-l-none lg:border-l-0">
        <h1 className="text-ink text-3xl font-semibold sm:text-4xl">{title}</h1>
        {intro ? <p className="text-ink-muted mt-3 text-lg">{intro}</p> : null}
        <div className="mt-8">{children}</div>
        {footer ? (
          <div className="border-line text-ink-muted mt-8 border-t pt-6 text-base">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
