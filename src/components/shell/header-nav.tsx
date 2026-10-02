"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActive, publicNav } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function HeaderNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 xl:flex">
      {publicNav.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center rounded-lg px-3 text-base font-medium whitespace-nowrap transition-colors",
              active
                ? "bg-primary-soft text-primary"
                : "text-ink-muted hover:bg-primary-tint hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
