"use client";

import Link from "next/link";
import { useState } from "react";
import { FolderOpen, MagnifyingGlass, Plus, Camera } from "@phosphor-icons/react/ssr";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { deleteRecord, revokeShare } from "@/lib/data/records";
import { RECORD_TYPES, typeLabel, type RecordFilter } from "@/lib/schemas/records";
import type { HealthRecord, ShareTarget } from "@/lib/types";
import { RecordCard } from "./record-card";
import { ShareDialog } from "./share-dialog";
import { UploadDialog, type NewRecord } from "./upload-dialog";
import { ViewDialog } from "./view-dialog";

type Props = {
  initial: HealthRecord[];
  counts: Record<string, number>;
  filter: RecordFilter;
  q: string;
  targets: ShareTarget[];
};

const chip =
  "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors";

export function RecordsView({ initial, counts, filter, q, targets }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState(initial);
  const [viewing, setViewing] = useState<HealthRecord | null>(null);
  const [sharing, setSharing] = useState<HealthRecord | null>(null);
  const [deleting, setDeleting] = useState<HealthRecord | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  const images = items.filter((r) => r.kind === "image");
  const docs = items.filter((r) => r.kind === "document");

  const download = (r: HealthRecord) =>
    toast({
      tone: "info",
      title: "Download started",
      description: `${r.title}. Prototype: no real file.`,
    });

  function href(next: Partial<{ type: string; q: string }>) {
    const p = new URLSearchParams();
    const type = next.type ?? filter;
    const query = next.q ?? q;
    if (type !== "all") p.set("type", type);
    if (query) p.set("q", query);
    const s = p.toString();
    return s ? `/patient/records?${s}` : "/patient/records";
  }

  const add = (n: NewRecord) => {
    const rec: HealthRecord = {
      id: `r-new-${Date.now()}`,
      title: n.title,
      type: n.type,
      kind: RECORD_TYPES.find((t) => t.id === n.type)?.image ? "image" : "document",
      sizeBytes: n.sizeBytes,
      uploadedOn: "2026-10-02",
      status: n.status,
      addedBy: "you",
      ...(n.reason ? { rejectedReason: n.reason } : {}),
    };
    setItems((l) => [rec, ...l]);
    setUploadOpen(false);
    toast(
      n.status === "ready"
        ? { tone: "success", title: "Record saved", description: n.title }
        : { tone: "danger", title: "File not saved", description: n.reason ?? "" },
    );
  };

  return (
    <div className="grid min-w-0 gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <form
          action="/patient/records"
          method="get"
          role="search"
          aria-label="Search records"
          className="flex min-w-0 flex-1 basis-72 gap-2"
        >
          {filter !== "all" ? <input type="hidden" name="type" value={filter} /> : null}
          <div className="min-w-0 flex-1">
            <label htmlFor="rec-q" className="sr-only">
              Search your records
            </label>
            <Input
              id="rec-q"
              name="q"
              type="search"
              defaultValue={q}
              maxLength={80}
              placeholder="Search by name"
              autoComplete="off"
              leading={<MagnifyingGlass className="size-5" />}
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        <Button onClick={() => setUploadOpen(true)}>
          <Plus aria-hidden className="size-5" />
          Add a record
        </Button>
        <ButtonLink href="/patient/records/injury-photo" variant="secondary">
          <Camera aria-hidden className="size-5" />
          Send an injury photo
        </ButtonLink>
      </div>

      <nav aria-label="Record types" className="min-w-0">
        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ id: "all", label: "All" }, ...RECORD_TYPES].map((t) => (
            <li key={t.id}>
              <Link
                href={href({ type: t.id })}
                aria-current={filter === t.id ? "page" : undefined}
                className={cn(
                  chip,
                  filter === t.id
                    ? "bg-primary border-primary text-white"
                    : "border-line-strong bg-surface text-ink hover:bg-primary-soft",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs tabular-nums",
                    filter === t.id ? "bg-white/25" : "bg-primary-soft text-primary",
                  )}
                >
                  {counts[t.id] ?? 0}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {items.length === 0 ? (
        <EmptyState
          as="h2"
          icon={<FolderOpen />}
          title={q || filter !== "all" ? "No records match" : "No records yet"}
          description={
            q || filter !== "all"
              ? "Try another type or a different word."
              : "Add reports, prescriptions and photos here, so your doctor sees the full picture."
          }
          action={
            q || filter !== "all" ? (
              <ButtonLink href="/patient/records">Show all records</ButtonLink>
            ) : (
              <Button onClick={() => setUploadOpen(true)}>Add your first record</Button>
            )
          }
        />
      ) : (
        <>
          {images.length ? (
            <section aria-labelledby="img-h">
              <h2
                id="img-h"
                className="mb-3 flex items-baseline justify-between text-xl font-semibold"
              >
                Images{" "}
                <span className="text-ink-muted text-sm font-normal">
                  {images.length} {images.length === 1 ? "file" : "files"}
                </span>
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((r) => (
                  <li key={r.id}>
                    <RecordCard
                      record={r}
                      onView={setViewing}
                      onDownload={download}
                      onShare={setSharing}
                      onStopShare={(rec) => void stopShare(rec)}
                      onDelete={setDeleting}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {docs.length ? (
            <section aria-labelledby="doc-h">
              <h2
                id="doc-h"
                className="mb-3 flex items-baseline justify-between text-xl font-semibold"
              >
                Documents{" "}
                <span className="text-ink-muted text-sm font-normal">
                  {docs.length} {docs.length === 1 ? "file" : "files"}
                </span>
              </h2>
              <ul className="grid gap-3">
                {docs.map((r) => (
                  <li key={r.id}>
                    <RecordCard
                      record={r}
                      onView={setViewing}
                      onDownload={download}
                      onShare={setSharing}
                      onStopShare={(rec) => void stopShare(rec)}
                      onDelete={setDeleting}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <ViewDialog record={viewing} onClose={() => setViewing(null)} onDownload={download} />
      <ShareDialog
        record={sharing}
        targets={targets}
        onClose={() => setSharing(null)}
        onDone={(id, target, days) => {
          setItems((l) =>
            l.map((r) =>
              r.id === id
                ? {
                    ...r,
                    sharedWith: {
                      doctorId: target.doctorId,
                      doctorName: target.doctorName,
                      until: addDays("2026-10-02", days),
                    },
                  }
                : r,
            ),
          );
          setSharing(null);
          toast({
            tone: "success",
            title: "Shared",
            description: `${target.doctorName} can open it for ${days === 1 ? "this consultation" : `${days} days`}.`,
          });
        }}
      />
      <UploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} onDone={add} />
      <Dialog
        open={Boolean(deleting)}
        onClose={() => !deleteBusy && setDeleting(null)}
        dismissible={!deleteBusy}
        title={deleting?.status === "rejected" ? "Remove this file?" : "Delete this record?"}
        description={
          deleting
            ? `“${deleting.title}” (${typeLabel(deleting.type)}). Doctors you shared it with lose access. Deleted records are kept hidden for 30 days, then erased. Draft policy, pending legal review.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)} disabled={deleteBusy}>
              Keep it
            </Button>
            <Button variant="danger" loading={deleteBusy} onClick={() => void confirmDelete()}>
              Delete
            </Button>
          </>
        }
      />
    </div>
  );

  async function stopShare(r: HealthRecord) {
    await revokeShare();
    setItems((l) => l.map((x) => (x.id === r.id ? { ...x, sharedWith: undefined } : x)));
    toast({
      tone: "success",
      title: "Sharing stopped",
      description: `${r.sharedWith?.doctorName ?? "The doctor"} can no longer open it.`,
    });
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    await deleteRecord();
    setDeleteBusy(false);
    const id = deleting.id;
    setItems((l) => l.filter((x) => x.id !== id));
    setDeleting(null);
    toast({ tone: "success", title: "Deleted" });
  }
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
