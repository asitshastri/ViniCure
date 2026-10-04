"use client";

import Link from "next/link";
import { useState } from "react";
import { Notice } from "@/components/auth/notice";
import { Button, ButtonLink } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { sendPrescription } from "@/lib/data/console";
import { formatClock } from "@/lib/data/doctor";
import type { ConsultContext } from "@/lib/types";
import { NotesPanel } from "./notes-panel";
import { PatientPanel } from "./patient-panel";
import { RxBuilder, type RxState } from "./rx-builder";
import { RxPreview } from "./rx-preview";
import { RealVideoPane } from "./real-video-pane";
import { VideoPane } from "./video-pane";

type Tab = "patient" | "files" | "notes" | "rx";

function Card({
  title,
  id,
  children,
  className,
}: {
  title: string;
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("border-line bg-surface shadow-card min-w-0 rounded-xl border p-5", className)}
    >
      <h2 id={id} className="mb-4 text-xl font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * `real` runs the console on a real consultation: real video and the patient's details from the
 * server. Notes and prescriptions are not part of it yet (clinical records, Phase 7), so those
 * panels say so rather than pretend to save.
 */
export function ConsoleFlow({
  ctx,
  real,
}: {
  ctx: ConsultContext;
  real?: { appointmentId: string };
}) {
  const { toast } = useToast();
  const { consult, patient, doctor } = ctx;
  const [tab, setTab] = useState<Tab>("patient");
  const [notes, setNotes] = useState("");
  const [rx, setRx] = useState<RxState>({ diagnosis: "", advice: "", followUpDays: 0, lines: [] });
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [ended, setEnded] = useState(false);

  async function send() {
    setSending(true);
    const r = await sendPrescription(rx.lines);
    setSending(false);
    if (r.status === "sent") {
      setSent(true);
      setPreview(false);
      toast({
        tone: "success",
        title: "Prescription sent",
        description: `${patient.name} has it in their records. Reference ${r.reference}.`,
      });
    } else
      toast({
        tone: "danger",
        title: "Could not send",
        description: "Nothing was sent. Try again.",
      });
  }

  if (ended) {
    return (
      <div className="mx-auto grid max-w-xl gap-5 px-4 py-16">
        <h1
          tabIndex={-1}
          id="stage-h"
          ref={(el) => el?.focus()}
          className="text-3xl font-semibold outline-none"
        >
          Consultation ended
        </h1>
        <Notice
          tone={sent || real ? "info" : "warning"}
          title={
            real
              ? "The consultation is closed"
              : sent
                ? "Prescription sent"
                : "No prescription was sent"
          }
        >
          {real
            ? `${patient.name} has been disconnected and cannot rejoin.`
            : sent
              ? `${patient.name} can see it in their records.`
              : `${patient.name} will not receive a prescription for this consultation.`}
        </Notice>
        <div>
          <ButtonLink href="/doctor/dashboard" size="lg">
            Back to dashboard
          </ButtonLink>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "patient", label: patient.name.split(" ")[0] ?? "Patient" },
    { id: "files", label: `Files (${patient.files.length})` },
    { id: "notes", label: "Notes" },
    { id: "rx", label: "Prescription" },
  ];
  const show = (t: Tab) => (tab === t ? "block" : "hidden");

  return (
    <div className="bg-canvas min-h-dvh">
      <header className="border-line bg-surface flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-6">
        <Link
          href="/doctor/dashboard"
          className="text-primary min-h-11 content-center font-semibold underline"
        >
          Dashboard
        </Link>
        <h1 tabIndex={-1} id="stage-h" className="text-lg font-semibold outline-none">
          Consultation with {patient.name}
        </h1>
        <span className="bg-success-soft text-success rounded-full px-3 py-1 text-sm font-medium">
          Live. {formatClock(consult.time)}
        </span>
        <span className="text-ink-muted ml-auto text-sm">
          {doctor.name}. Reg. {doctor.registrationNumber}
        </span>
      </header>

      <div className="grid gap-4 p-4 sm:p-6 lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[20rem_minmax(0,1fr)_26rem]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1 xl:col-start-2">
          {real ? (
            <RealVideoPane
              appointmentId={real.appointmentId}
              patientName={patient.name}
              doctorName={doctor.name}
              canStart={consult.canStart}
              onEnded={() => setEnded(true)}
            />
          ) : (
            <VideoPane
              patientName={patient.name}
              doctorName={doctor.name}
              onEnd={() => setEndOpen(true)}
            />
          )}
        </div>

        <div className="grid min-w-0 content-start gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 xl:contents">
          <div
            role="tablist"
            aria-label="Consultation panels"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 xl:hidden"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={cn(
                  "min-h-11 rounded-full px-4 text-sm font-semibold whitespace-nowrap",
                  tab === t.id
                    ? "bg-primary text-white"
                    : "bg-primary-soft text-primary hover:bg-primary-soft/70",
                )}
              >
                {t.label}
                {t.id === "rx" && rx.lines.length ? ` (${rx.lines.length})` : ""}
              </button>
            ))}
          </div>

          <div
            id="panel-patient"
            role="tabpanel"
            aria-labelledby="tab-patient"
            className={cn(show("patient"), "xl:col-start-1 xl:row-start-1 xl:block")}
          >
            <Card id="p-h" title="Patient">
              <PatientPanel ctx={ctx} part="info" real={Boolean(real)} />
            </Card>
          </div>
          <div
            id="panel-files"
            role="tabpanel"
            aria-labelledby="tab-files"
            className={cn(show("files"), "xl:col-start-1 xl:row-start-2 xl:block")}
          >
            <Card id="f-h" title="Files">
              <PatientPanel ctx={ctx} part="files" real={Boolean(real)} />
            </Card>
          </div>
          <div
            id="panel-notes"
            role="tabpanel"
            aria-labelledby="tab-notes"
            className={cn(show("notes"), "xl:col-start-2 xl:row-start-2 xl:block")}
          >
            <Card id="n-h" title="Notes">
              {real ? (
                <Notice tone="info" title="Notes are not available yet">
                  Consultation notes arrive with clinical records. Nothing written here would be
                  saved.
                </Notice>
              ) : (
                <NotesPanel value={notes} onChange={setNotes} />
              )}
            </Card>
          </div>
          <div
            id="panel-rx"
            role="tabpanel"
            aria-labelledby="tab-rx"
            className={cn(show("rx"), "xl:col-start-3 xl:row-span-2 xl:row-start-1 xl:block")}
          >
            <Card id="r-h" title="Prescription">
              {real ? (
                <Notice tone="info" title="Prescriptions are not available yet">
                  The prescription builder arrives with clinical records. No prescription can be
                  sent from here yet.
                </Notice>
              ) : (
                <RxBuilder
                  allergies={consult.allergies}
                  value={rx}
                  onChange={setRx}
                  onPreview={() => setPreview(true)}
                  sent={sent}
                  onSend={() => void send()}
                  sending={sending}
                />
              )}
            </Card>
          </div>
        </div>
      </div>

      <RxPreview
        open={preview}
        onClose={() => setPreview(false)}
        ctx={ctx}
        rx={rx}
        onSend={() => void send()}
        sending={sending}
        sent={sent}
      />
      <Dialog
        open={endOpen}
        onClose={() => setEndOpen(false)}
        title="End this consultation?"
        description={
          sent
            ? "The prescription has been sent."
            : "You have not sent a prescription. The patient will not receive one unless you send it first."
        }
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setEndOpen(false);
                if (!sent) setTab("rx");
              }}
            >
              {sent ? "Stay" : "Back to prescription"}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setEndOpen(false);
                setEnded(true);
              }}
            >
              End consultation
            </Button>
          </>
        }
      />
    </div>
  );
}
