import { mockAppointments } from "@/mocks/appointments";
import { MOCK_NOW } from "@/mocks/doctors";
import type { Appointment, AppointmentView, AppointmentsResult } from "@/lib/types";

// Components get appointments through this layer only. In P4 these call the appointments API, and the server decides
// who may cancel or move which appointment. The flags below are for display only.

const delay = (ms = 600) => new Promise((resolve) => setTimeout(resolve, ms));

export const JOIN_OPENS_MINUTES = 10;
export const FREE_CHANGE_HOURS = 2;

function toMinutes(date: string, time: string): number {
  return Math.round(new Date(`${date}T${time}:00Z`).getTime() / 60000);
}

function toView(a: Appointment, nowMinutes: number): AppointmentView {
  const minutesUntil = toMinutes(a.date, a.time) - nowMinutes;
  return {
    ...a,
    minutesUntil,
    canJoin: a.status === "upcoming" && minutesUntil <= JOIN_OPENS_MINUTES && minutesUntil > -45,
    freeChange: a.status === "upcoming" && minutesUntil > FREE_CHANGE_HOURS * 60,
  };
}

export type AppointmentScenario = "default" | "joinable" | "empty";

/** The scenario switches (from the URL in the prototype) let every state be reached. */
export function getAppointments(scenario: AppointmentScenario = "default"): AppointmentsResult {
  if (scenario === "empty") return { all: [], nextUp: null };
  const now = toMinutes(MOCK_NOW.date, scenario === "joinable" ? "18:25" : MOCK_NOW.time);
  const all = mockAppointments.map((a) => toView(a, now));
  const nextUp =
    all.filter((a) => a.status === "upcoming").sort((a, b) => a.minutesUntil - b.minutesUntil)[0] ??
    null;
  return { all, nextUp };
}

export function getAppointment(id: string): Appointment | undefined {
  return mockAppointments.find((a) => a.id === id);
}

export type CancelResult = { status: "cancelled"; refundPaise: number } | { status: "error" };

export async function cancelAppointment(input: {
  id: string;
  refundPaise: number;
  note: string;
}): Promise<CancelResult> {
  await delay();
  if (input.note.toLowerCase().includes("simulate error")) return { status: "error" };
  return { status: "cancelled", refundPaise: input.refundPaise };
}

export type RescheduleResult = { status: "moved" } | { status: "slot_taken" };

export async function rescheduleAppointment(input: {
  id: string;
  slotId: string;
}): Promise<RescheduleResult> {
  await delay();
  // Evening times at 7:00 or 7:30 pm report "taken", so that state can be reached.
  if (input.slotId.endsWith("1900") || input.slotId.endsWith("1930"))
    return { status: "slot_taken" };
  return { status: "moved" };
}

export async function reviewAppointment(): Promise<{ status: "saved" }> {
  await delay(500);
  return { status: "saved" };
}

/** Refund the person would get if they cancel now. Draft policy, pending legal review. */
export function refundFor(a: AppointmentView): number {
  return a.freeChange ? a.feePaise : 0;
}

export function formatCountdown(minutes: number): string {
  if (minutes <= 0) return "now";
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d} ${d === 1 ? "day" : "days"}${h ? ` ${h} h` : ""}`;
  if (h > 0) return `${h} h${m ? ` ${m} min` : ""}`;
  return `${m} min`;
}
