import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DesignDemo } from "./design-demo";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false },
};

export default function DesignPage() {
  // Developer preview only. It must never be reachable in production.
  if (process.env.NODE_ENV === "production") notFound();
  return <DesignDemo />;
}
