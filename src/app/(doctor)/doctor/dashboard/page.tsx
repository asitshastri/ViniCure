import type { Metadata } from "next";
import { SquaresFour } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Doctor dashboard" };

export default function DoctorDashboardPage() {
  return (
    <>
      <PageHeader title="Good morning, Dr. Rao" description="Your day at a glance." />
      <EmptyState
        icon={<SquaresFour />}
        title="Dashboard coming next"
        description="This page is built in task F-14. The navigation, sidebar and mobile tab bar around it are ready."
      />
    </>
  );
}
