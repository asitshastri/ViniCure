import { requireRole } from "@/modules/identity/page-guard-next";
import { SkipLink } from "@/components/shell/skip-link";

// Call screens use the whole window, so they have no site header, footer or dashboard sidebar.
export default async function CallLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await requireRole(["patient", "doctor"]);
  return (
    <>
      <SkipLink />
      <main id="main" tabIndex={-1} className="min-h-dvh outline-none">
        {children}
      </main>
    </>
  );
}
