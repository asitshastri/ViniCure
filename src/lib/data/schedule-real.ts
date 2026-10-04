import { headers } from "next/headers";
import { actorFromHeaders } from "@/modules/identity";
import { getAppointments, getAvailability } from "@/modules/scheduling";
import type { HoursView, TimeOffView } from "@/modules/scheduling/availability-schemas";
import { istDate } from "@/modules/scheduling/slots";

// The signed-in doctor's own schedule for the Schedule page: confirmed bookings, weekly hours and
// time off, from the real services. Booking reasons are clinical text and are not shown here.

export type BookedLine = {
  id: string;
  date: string;
  time: string;
  patientName: string;
  reason?: string;
};

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });

export async function loadRealSchedule(): Promise<{
  booked: BookedLine[];
  rules: HoursView["rules"];
  timeOff: TimeOffView[];
} | null> {
  const actor = await actorFromHeaders(await headers());
  if (!actor || !actor.roles.includes("doctor")) return null;
  const [list, hours] = await Promise.all([
    getAppointments().list(actor, { limit: 50 }),
    getAvailability()
      .get(actor)
      .catch(() => ({ rules: [], timeOff: [] })),
  ]);
  return {
    booked: list.items.map((a) => ({
      id: a.id,
      date: istDate(new Date(a.startAt)),
      time: istTime(a.startAt),
      patientName: a.patientName,
    })),
    rules: hours.rules,
    timeOff: hours.timeOff,
  };
}
