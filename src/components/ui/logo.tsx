import Image from "next/image";
import { cn } from "@/lib/cn";

type LogoProps = {
  /** "light" is white, for dark backgrounds. */
  variant?: "default" | "light";
  className?: string;
  priority?: boolean;
};

// Temporary logo. The human will supply the final artwork, so keep every use going through this component.
export function Logo({ variant = "default", className, priority = false }: LogoProps) {
  return (
    <Image
      src={variant === "light" ? "/brand/logo-light.png" : "/brand/logo.png"}
      alt="ViniCure"
      width={480}
      height={209}
      unoptimized
      priority={priority}
      className={cn("h-10 w-auto", className)}
    />
  );
}
