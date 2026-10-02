import type { ReactNode } from "react";
import { CaretDown } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

type AccordionItemProps = {
  question: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Items sharing a group name open one at a time. */
  group?: string;
  className?: string;
};

/** Built on <details>, so it works with the keyboard and screen readers without script. */
export function AccordionItem({
  question,
  children,
  defaultOpen,
  group,
  className,
}: AccordionItemProps) {
  return (
    <details
      name={group}
      open={defaultOpen}
      className={cn("group border-line border-b last:border-b-0", className)}
    >
      <summary className="font-display text-ink flex min-h-14 list-none items-center justify-between gap-4 py-3 text-left text-lg font-semibold [&::-webkit-details-marker]:hidden">
        {question}
        <CaretDown
          aria-hidden
          className="text-ink-muted size-5 shrink-0 transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="text-ink-muted pb-4 text-base">{children}</div>
    </details>
  );
}

export function Accordion({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-line bg-surface rounded-xl border px-5", className)}>{children}</div>
  );
}
