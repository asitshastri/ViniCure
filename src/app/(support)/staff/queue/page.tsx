import type { Metadata } from "next";
import { Headset } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Support queue" };

export default function SupportQueuePage() {
  return (
    <>
      <PageHeader title="Ticket queue" description="Open requests from patients and doctors." />
      <EmptyState
        icon={<Headset />}
        title="Queue coming next"
        description="This page is built in task F-19. The navigation, sidebar and mobile tab bar around it are ready."
      />
    </>
  );
}
