"use client";

import Link from "next/link";
import { useState } from "react";
import { Switch } from "@/components/ui/choice";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { setAvailable } from "@/lib/data/doctor";

/** The big toggle at the top of the doctor's dashboard. When off, patients cannot book new times with the doctor. */
export function AvailabilityCard({ initial, until }: { initial: boolean; until: string }) {
  const { toast } = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function change(next: boolean) {
    setBusy(true);
    await setAvailable();
    setBusy(false);
    setOn(next);
    toast({
      tone: next ? "success" : "info",
      title: next ? "You are available" : "You are away",
      description: next
        ? "Patients can book you again."
        : "Patients cannot book new times. Booked ones stay.",
    });
  }

  return (
    <section
      aria-labelledby="avail-h"
      className={cn(
        "flex items-center gap-4 rounded-2xl p-5 text-white",
        on ? "bg-primary" : "bg-dock",
      )}
    >
      <span
        aria-hidden
        className={cn("size-3 shrink-0 rounded-full", on ? "bg-success-soft" : "bg-white/50")}
      />
      <div className="min-w-0 flex-1">
        <h2 id="avail-h" className="text-lg font-semibold">
          {on ? "You are available" : "You are away"}
        </h2>
        <p className="text-sm text-white/90" aria-live="polite">
          {on
            ? `Accepting consultations until ${until}.`
            : "Patients cannot book new times with you."}{" "}
          <Link href="/doctor/calendar" className="font-semibold underline">
            Change hours
          </Link>
        </p>
      </div>
      <Switch
        label={on ? "Available. Turn off to go away" : "Away. Turn on to become available"}
        checked={on}
        disabled={busy}
        onCheckedChange={(v) => void change(v)}
        className="!border-white"
      />
    </section>
  );
}
