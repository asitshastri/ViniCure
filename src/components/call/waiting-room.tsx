"use client";

import { useEffect } from "react";
import { Hourglass } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/lib/types";

const WAIT_MS = 4000;

export function WaitingRoom({
  appt,
  onDoctorJoined,
  onLeave,
}: {
  appt: Appointment;
  onDoctorJoined: () => void;
  onLeave: () => void;
}) {
  // In the prototype the doctor "joins" after a few seconds. In P6 this waits for the doctor's real connection.
  useEffect(() => {
    const t = setTimeout(onDoctorJoined, WAIT_MS);
    return () => clearTimeout(t);
  }, [onDoctorJoined]);

  return (
    <div className="mx-auto grid min-h-[70dvh] max-w-xl content-center gap-6 px-4 py-10 text-center">
      <span
        aria-hidden
        className="bg-primary-soft text-primary mx-auto flex size-20 items-center justify-center rounded-full"
      >
        <Hourglass className="size-10" />
      </span>
      <div role="status">
        <h1 tabIndex={-1} id="stage-h" className="text-3xl font-semibold outline-none">
          Waiting for {appt.doctorName}
        </h1>
        <p className="text-ink-muted mt-2 text-lg">
          You are in the waiting room. The call starts when the doctor joins. Please stay on this
          page.
        </p>
      </div>
      <ul className="border-line bg-surface mx-auto grid max-w-md gap-2 rounded-xl border p-5 text-left">
        <li>Find a quiet place with good light.</li>
        <li>Keep your reports or medicines nearby.</li>
        <li>Use headphones if you can, so the doctor hears you clearly.</li>
      </ul>
      <div>
        <Button variant="secondary" onClick={onLeave}>
          Leave the waiting room
        </Button>
      </div>
    </div>
  );
}
