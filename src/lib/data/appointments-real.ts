import { headers } from "next/headers";
import { getConfig } from "@/lib/config/config";
import type { AppointmentDetailView } from "@/modules/scheduling";
import { getAppointments, getSlots } from "@/modules/scheduling";
import { istDate } from "@/modules/scheduling/slots";
import { actorFromHeaders } from "@/modules/identity";
import type { AppointmentStatus, AppointmentView, DoctorSlot } from "@/lib/types";

// The signed-in patient's own appointments from the real services, shaped for the existing
// screens. What the screens show about joining, prescriptions, follow-up prices and refunds
// belongs to later work (video, records, payments), so those fields are left off here.

const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
  });

function statusOf(a: AppointmentDetailView): Pick<AppointmentView, "status" | "cancelledBy"> {
  switch (a.status) {
    case "held":
      return { status: "held" };
    case "scheduled":
    case "in_progress":
      return { status: "upcoming" };
    case "completed":
      return { status: "completed" };
    case "no_show":
      return { status: "no_show" };
    case "cancelled_by_doctor":
      return { status: "cancelled", cancelledBy: "doctor" };
    case "cancelled_by_admin":
      return { status: "cancelled", cancelledBy: "admin" };
    default:
      return { status: "cancelled", cancelledBy: "patient" };
  }
}

/** For the "Join" button only; the join route decides for real. */
function canJoinNow(a: AppointmentDetailView, now: number): boolean {
  if (a.status !== "scheduled" && a.status !== "in_progress") return false;
  const config = getConfig();
  const opens = new Date(a.startAt).getTime() - config.VIDEO_JOIN_EARLY_MINUTES * 60_000;
  const closes = new Date(a.endAt).getTime() + config.VIDEO_JOIN_LATE_MINUTES * 60_000;
  return now >= opens && now <= closes;
}

export function toAppointmentView(a: AppointmentDetailView, now: number): AppointmentView {
  const { status, cancelledBy } = statusOf(a);
  const minutesUntil = Math.round((new Date(a.startAt).getTime() - now) / 60000);
  const view: AppointmentView = {
    id: a.id,
    doctorId: a.doctorId,
    doctorName: a.doctorName,
    specialty: a.doctorSpecialty ?? "Doctor",
    registrationNumber: a.doctorRegistrationNo,
    date: istDate(new Date(a.startAt)),
    time: istTime(a.startAt),
    mode: "video",
    forWhom: a.patientName,
    status: status as AppointmentStatus,
    feePaise: a.feePaise,
    reference: `VC-${a.id.slice(-8).toUpperCase()}`,
    hasPrescription: false,
    reviewed: a.reviewed,
    minutesUntil,
    // Joining: booked (so paid) and inside the window the server enforces. The server checks again.
    canJoin: canJoinNow(a, now),
    freeChange: true,
  };
  if (cancelledBy) view.cancelledBy = cancelledBy;
  if (a.holdExpiresAt) view.holdUntil = a.holdExpiresAt;
  return view;
}

/** Everything on the account (up to 100, newest first), plus free times for moving a booking. */
export async function loadRealAppointments(): Promise<{
  all: AppointmentView[];
  slotsByDoctor: Record<string, DoctorSlot[]>;
} | null> {
  const actor = await actorFromHeaders(await headers());
  if (!actor || actor.limited) return null;
  const rows: AppointmentDetailView[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 2; page++) {
    const result = await getAppointments().list(actor, {
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    rows.push(...result.items);
    cursor = result.nextCursor ?? undefined;
    if (!cursor) break;
  }
  const now = Date.now();
  const all = rows.map((r) => toAppointmentView(r, now));

  const slotsByDoctor: Record<string, DoctorSlot[]> = {};
  const movable = new Set(rows.filter((r) => r.status === "scheduled").map((r) => r.doctorId));
  const from = istDate(new Date(now));
  await Promise.all(
    [...movable].map(async (doctorId) => {
      const { slots } = await getSlots()
        .list(doctorId, { from, to: istDate(new Date(now + 13 * 86_400_000)) })
        .catch(() => ({ slots: [] }));
      slotsByDoctor[doctorId] = slots.slice(0, 60).map((s) => ({
        id: s.startAt,
        date: istDate(new Date(s.startAt)),
        time: istTime(s.startAt),
      }));
    }),
  );
  return { all, slotsByDoctor };
}

/** One of the signed-in patient's appointments, shaped for the call screens. Null when it is not theirs. */
export async function loadRealAppointment(id: string): Promise<AppointmentView | null> {
  const actor = await actorFromHeaders(await headers());
  if (!actor || actor.limited) return null;
  try {
    return toAppointmentView(await getAppointments().get(actor, id), Date.now());
  } catch {
    // Someone else's appointment and a missing one are the same: nothing to show.
    return null;
  }
}
