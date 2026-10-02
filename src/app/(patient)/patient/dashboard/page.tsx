import type { Metadata } from "next";
import { SquaresFour } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Dashboard" };

export default function PatientDashboardPage() {
  return (
    <>
      <PageHeader title="Good morning, Asha" description="Your care at a glance." />
      <EmptyState
        icon={<SquaresFour />}
        title="Dashboard coming next"
        description="This page is built in task F-11. The navigation, sidebar and mobile tab bar around it are ready."
      />
    </>
  );
}
