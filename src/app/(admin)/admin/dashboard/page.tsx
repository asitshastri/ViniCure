import type { Metadata } from "next";
import { ChartLineUp } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Admin dashboard" };

export default function AdminDashboardPage() {
  return (
    <>
      <PageHeader title="Overview" description="Platform activity and items that need attention." />
      <EmptyState
        icon={<ChartLineUp />}
        title="Dashboard coming next"
        description="This page is built in task F-18. The navigation, sidebar and mobile tab bar around it are ready."
      />
    </>
  );
}
