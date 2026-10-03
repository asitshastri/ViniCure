import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegalPage } from "@/components/content/legal-page";
import { getLegalDoc } from "@/lib/data/content";

export const metadata: Metadata = { title: "Cookie policy (draft) | ViniCure" };

export default function Page() {
  const doc = getLegalDoc("cookie-policy");
  if (!doc) notFound();
  return <LegalPage doc={doc} />;
}
