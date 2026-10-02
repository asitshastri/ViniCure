import { cn } from "@/lib/cn";

const sizes = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
} as const;

function initials(name: string): string {
  const parts = name
    .replace(/^(dr|mr|mrs|ms)\.?\s+/i, "")
    .split(/\s+/)
    .filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

type AvatarProps = {
  name: string;
  size?: keyof typeof sizes;
  className?: string;
};

/** Initials avatar. Real photos come later, after consent and licensing are sorted. */
export function Avatar({ name, size = "md", className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "bg-primary-soft font-display text-primary inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        sizes[size],
        className,
      )}
    >
      <span aria-hidden>{initials(name)}</span>
    </span>
  );
}
