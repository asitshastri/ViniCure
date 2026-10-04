import { headers } from "next/headers";
import { getConfig } from "@/lib/config/config";
import { AppError } from "@/lib/errors/app-error";
import { actorFromHeaders } from "@/modules/identity";
import { getAppointments } from "@/modules/scheduling";
import { getConsultations } from "@/modules/consultations";
import { istDate } from "@/modules/scheduling/slots";
import type { ConsultContext, DoctorConsultView } from "@/lib/types";

// The doctor's consultation screens on real data (P6-07). Only the assigned doctor gets
// anything; the server checks again on every call the browser makes.

const IST = "Asia/Kolkata";
const istTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: IST, hour: "2-digit", minute: "2-digit" });

export type RealConsole =
  | { status: "ok"; ctx: ConsultContext; appointmentId: string }
  | { status: "closed" }
  | { status: "not_found" };

/** The console for one appointment. Reading the patient's details is logged by the service. */
export async function loadRealConsole(id: string): Promise<RealConsole> {
  const actor = await actorFromHeaders(await headers());
  if (!actor || actor.limited) return { status: "not_found" };
  try {
    const c = await getConsultations().console(actor, id);
    const now = Date.now();
    const config = getConfig();
    const minutesUntil = Math.round((new Date(c.startAt).getTime() - now) / 60_000);
    const opens = new Date(c.startAt).getTime() - config.VIDEO_JOIN_EARLY_MINUTES * 60_000;
    const closes = new Date(c.endAt).getTime() + config.VIDEO_JOIN_LATE_MINUTES * 60_000;
    const consult: DoctorConsultView = {
      id: c.appointmentId,
      date: istDate(new Date(c.startAt)),
      time: istTime(c.startAt),
      patientId: "",
      patientName: c.patient.name,
      ageSex: `${c.patient.ageYears}, ${c.patient.sex}`,
      reason: c.reason ?? "Not given",
      kind: "new",
      mode: "video",
      status: "upcoming",
      allergies: [],
      minutesUntil,
      canStart: now >= opens && now <= closes,
    };
    return {
      status: "ok",
      appointmentId: c.appointmentId,
      ctx: {
        consult,
        patient: {
          name: c.patient.name,
          ageSex: consult.ageSex,
          conditions: [],
          medicines: [],
          pastVisits: [],
          files: [],
          ...(c.patient.attendingAdult
            ? {
                attendingAdult: `${c.patient.attendingAdult.name} (${c.patient.attendingAdult.relation})`,
              }
            : {}),
        },
        doctor: {
          name: c.doctor.name,
          qualifications: c.doctor.qualifications,
          registrationNumber: c.doctor.registrationNo,
          council: c.doctor.council,
        },
      },
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "conflict") return { status: "closed" };
    // Not assigned, not found: the same page.
    return { status: "not_found" };
  }
}

/** The signed-in doctor's confirmed, not yet finished consultations, soonest first. */
export async function loadRealDoctorConsults(): Promise<DoctorConsultView[] | null> {
  const actor = await actorFromHeaders(await headers());
  if (!actor || actor.limited || !actor.roles.includes("doctor")) return null;
  const items: DoctorConsultView[] = [];
  let cursor: string | undefined;
  const config = getConfig();
  const now = Date.now();
  for (let page = 0; page < 2; page++) {
    const result = await getAppointments().list(actor, {
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    for (const a of result.items) {
      const opens = new Date(a.startAt).getTime() - config.VIDEO_JOIN_EARLY_MINUTES * 60_000;
      const closes = new Date(a.endAt).getTime() + config.VIDEO_JOIN_LATE_MINUTES * 60_000;
      items.push({
        id: a.id,
        date: istDate(new Date(a.startAt)),
        time: istTime(a.startAt),
        patientId: "",
        patientName: a.patientName,
        // The list shows who and when. Age, sex and the reason are shown inside the consultation,
        // where reading them is logged.
        ageSex: "",
        reason: "",
        kind: "new",
        mode: "video",
        status: "upcoming",
        allergies: [],
        minutesUntil: Math.round((new Date(a.startAt).getTime() - now) / 60_000),
        canStart: now >= opens && now <= closes,
      });
    }
    cursor = result.nextCursor ?? undefined;
    if (!cursor) break;
  }
  return items;
}
