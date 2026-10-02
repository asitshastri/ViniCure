import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/content/legal-page";
import { getLegalDoc } from "@/lib/data/content";

export const metadata: Metadata = { title: "Terms of use (draft) | ViniCure" };

export default function Page() {
  const doc = getLegalDoc("terms");
  if (!doc) notFound();
  return <LegalPage doc={doc} />;
}
