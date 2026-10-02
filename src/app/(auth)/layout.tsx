import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { SkipLink } from "@/components/shell/skip-link";

export default function AuthLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="from-primary-tint to-canvas flex min-h-dvh flex-col bg-gradient-to-b">
      <SkipLink />
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Link href="/" aria-label="ViniCure home" className="rounded-lg">
          <Logo className="h-9" priority />
        </Link>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 outline-none sm:pt-12"
      >
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
