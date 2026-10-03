import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldWarning } from "@phosphor-icons/react/ssr";
import { PageHeader } from "@/components/shell/page-header";
import { TicketThread } from "@/components/staff/ticket-thread";
import { buttonStyles } from "@/components/ui/button";
import { formatDue, getTemplates, getTicket, minutesToDue } from "@/lib/data/staff";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ticket = getTicket(id);
  if (!ticket) notFound();
  const mins = minutesToDue(ticket);
  return (
    <>
      <Link
        href="/staff/queue"
        className="text-primary mb-3 inline-flex min-h-11 items-center gap-1 font-semibold underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to the queue
      </Link>
      <PageHeader
        title={ticket.subject}
        description={`${ticket.id}. From ${ticket.requester}${ticket.requesterRole === "doctor" ? " (doctor)" : ""}. ${mins === null ? "Closed." : formatDue(mins) + "."}`}
      />
      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <TicketThread ticket={ticket} templates={getTemplates()} agent="Imran Khan" />
        <div className="grid min-w-0 content-start gap-3">
          {ticket.requesterRole === "patient" ? (
            <Link
              href={`/staff/lookup?q=${encodeURIComponent(ticket.requester.split(" ")[0] ?? "")}`}
              className={buttonStyles({ variant: "secondary" })}
            >
              Look up {ticket.requester}
            </Link>
          ) : null}
          {ticket.needsRecord ? (
            <div className="border-line bg-surface rounded-xl border p-4">
              <p className="mb-2 flex items-center gap-2 font-semibold">
                <ShieldWarning aria-hidden className="size-5" />
                Needs the health record
              </p>
              <p className="text-ink-muted mb-3 text-sm">
                You cannot see the record from here. Ask for break-glass access with this ticket as
                the reason.
              </p>
              <Link
                href={`/staff/break-glass?ticket=${ticket.id}&patient=u-1012`}
                className={buttonStyles({ size: "sm" })}
              >
                Ask for access
              </Link>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
