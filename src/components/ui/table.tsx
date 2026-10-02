import type { ComponentProps } from "react";
import { CaretDown, CaretUp, CaretUpDown } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/cn";

/** Scrolls sideways inside its own box on small screens, so the page never scrolls sideways. */
export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="border-line bg-surface overflow-x-auto rounded-xl border">
      <table className={cn("w-full min-w-[32rem] text-left text-sm", className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: ComponentProps<"thead">) {
  return <thead className={cn("bg-primary-tint text-ink-muted", className)} {...props} />;
}

export function TBody({ className, ...props }: ComponentProps<"tbody">) {
  return <tbody className={cn("divide-line divide-y", className)} {...props} />;
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={cn("hover:bg-primary-tint/60", className)} {...props} />;
}

export type SortState = "asc" | "desc" | "none";

type ThProps = Omit<ComponentProps<"th">, "onClick"> & {
  /** Set to make the column sortable. Pass "none" when this column is not the active sort. */
  sort?: SortState;
  onSort?: () => void;
};

const ariaSort = { asc: "ascending", desc: "descending", none: "none" } as const;

export function Th({ sort, onSort, className, children, ...props }: ThProps) {
  const SortIcon = sort === "asc" ? CaretUp : sort === "desc" ? CaretDown : CaretUpDown;
  return (
    <th
      scope="col"
      aria-sort={sort ? ariaSort[sort] : undefined}
      className={cn("px-4 py-3 font-semibold", className)}
      {...props}
    >
      {sort && onSort ? (
        <button
          type="button"
          onClick={onSort}
          className="hover:bg-primary-soft -mx-2 inline-flex min-h-9 items-center gap-1 rounded-md px-2"
        >
          {children}
          <SortIcon aria-hidden className="size-4" />
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td className={cn("text-ink px-4 py-3 align-middle", className)} {...props} />;
}
