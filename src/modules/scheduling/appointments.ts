import { z } from "zod";
import type { Crypto } from "../../lib/crypto/crypto";
import { errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { PatientRepo } from "../patients/repo";
import type { AppointmentDetail, AppointmentRepo, AppointmentRow } from "./appointments-repo";
import type { SlotService } from "./service";
import { CANCEL_REASONS, MAX_RESCHEDULES, canMove, cancelStatusFor, type Canceller } from "./state";
import { istDate } from "./slots";

// Holding a slot (P4-05). The patient picks a patient profile they own and a free slot; the
// server copies the doctor's fee, keeps the slot for a few minutes, and the database constraint
// decides any race: one of ten simultaneous requests wins, the rest get 409.

/** NOT VERIFIED (TODO.md, Questions): product choices. */
export const HOLD_SECONDS = 10 * 60;
export const MAX_ACTIVE_HOLDS = 3;

const CONTROL = /\p{Cc}/u;
const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((v) => !CONTROL.test(v), "Remove special characters.");

export const holdBody = z
  .object({
    patientId: z.uuid(),
    doctorId: z.uuid(),
    startAt: z.iso.datetime(),
    reason: text(3, 1000).optional(),
    attendingAdult: z
      .object({ name: text(2, 100), relation: text(2, 40) })
      .strict()
      .optional(),
  })
  .strict();
export type HoldBody = z.infer<typeof holdBody>;

export const cancelBody = z.object({ reason: z.enum(CANCEL_REASONS) }).strict();
export const rescheduleBody = z.object({ startAt: z.iso.datetime() }).strict();
export const appointmentIdParams = z.object({ id: z.uuid() }).strict();
export const appointmentsQuery = z
  .object({
    cursor: z.string().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

/** What the caller sees of a booking. No reason text, no patient contact details. */
export type AppointmentDetailView = AppointmentView & {
  doctorName: string;
  doctorRegistrationNo: string;
  doctorSpecialty: string | null;
  patientName: string;
  rescheduleCount: number;
  reviewed: boolean;
};

export const toDetailView = (d: AppointmentDetail): AppointmentDetailView => ({
  ...toAppointmentView(d),
  doctorName: d.doctorName,
  doctorRegistrationNo: d.doctorRegistrationNo,
  doctorSpecialty: d.doctorSpecialty,
  patientName: d.patientName,
  rescheduleCount: d.rescheduleCount,
  reviewed: d.reviewed,
});

const cursorError = () =>
  errors.validation([{ path: "cursor", message: "This page link is not valid." }]);

export function encodeAppointmentCursor(d: Pick<AppointmentDetail, "cursorTime" | "id">): string {
  return Buffer.from(JSON.stringify({ k: d.cursorTime, i: d.id })).toString("base64url");
}

export function decodeAppointmentCursor(cursor: string): { key: string; id: string } {
  try {
    const p = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    if (
      typeof p.k !== "string" ||
      typeof p.i !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(p.k) ||
      !/^[0-9a-f-]{36}$/.test(p.i)
    ) {
      throw cursorError();
    }
    return { key: p.k, id: p.i };
  } catch {
    throw cursorError();
  }
}

export type AppointmentView = {
  id: string;
  patientId: string;
  doctorId: string;
  startAt: string;
  endAt: string;
  status: string;
  feePaise: number;
  holdExpiresAt: string | null;
};

export const toAppointmentView = (r: AppointmentRow): AppointmentView => ({
  id: r.id,
  patientId: r.patientId,
  doctorId: r.doctorId,
  startAt: r.startAt.toISOString(),
  endAt: r.endAt.toISOString(),
  status: r.status,
  feePaise: r.feePaise,
  holdExpiresAt: r.holdExpiresAt ? r.holdExpiresAt.toISOString() : null,
});

/**
 * Postgres reports a lost race in two ways: 23P01, the exclusion constraint (the other request
 * already holds the time), and 40P01, a deadlock between two requests inserting overlapping
 * times at once (one is stopped, and the other holds the time). Both mean "slot taken".
 */
const isRace = (error: unknown): boolean => {
  const code = (error as { code?: string }).code;
  return code === "23P01" || code === "40P01";
};

type Deps = {
  repo: AppointmentRepo;
  patients: Pick<PatientRepo, "findById">;
  slots: Pick<SlotService, "list" | "invalidate">;
  crypto: () => Crypto;
};

export class AppointmentService {
  constructor(private readonly deps: Deps) {}

  async hold(principal: Principal, input: HoldBody): Promise<AppointmentView> {
    // The profile must be one of the caller's own; anyone else's is a 404.
    const patient = await this.deps.patients.findById(input.patientId);
    if (!patient) throw errors.notFound();
    assertAllowed(can.patientProfile.write(principal, { ownerUserId: patient.accountUserId }));

    // A child needs a named adult to attend (the minors rule in er_model.md).
    if (patient.isMinor && !input.attendingAdult) {
      throw errors.validation([
        { path: "attendingAdult", message: "Name the adult who will be with the child." },
      ]);
    }

    // The start must be exactly a free slot right now (no cache), so a patient cannot book
    // hours the doctor does not work. An unlisted doctor is a 404 from here.
    const startAt = new Date(input.startAt);
    const day = istDate(startAt);
    const { slots } = await this.deps.slots.list(input.doctorId, {
      from: day,
      to: day,
      fresh: true,
    });
    const slot = slots.find((s) => new Date(s.startAt).getTime() === startAt.getTime());
    if (!slot) throw errors.slotTaken({ detail: "That slot is not available. Choose another." });
    const endAt = new Date(slot.endAt);

    const reasonEnc = input.reason
      ? await this.deps.crypto().encrypt(input.reason, "appointments.reason_enc")
      : null;
    const adult = patient.isMinor ? input.attendingAdult : undefined;

    // A hold that has run out must not block the slot while waiting for the release job.
    await this.deps.repo.expireStaleHolds(input.doctorId, startAt, endAt).catch((error) => {
      // Two requests clearing the same ghost can deadlock; one of them is enough.
      if (!isRace(error)) throw error;
    });
    let row: AppointmentRow | null;
    try {
      row = await this.deps.repo.createHold({
        id: uuidv7(),
        patientId: patient.id,
        doctorId: input.doctorId,
        bookedByUserId: principal.userId,
        startAt,
        endAt,
        holdSeconds: HOLD_SECONDS,
        maxActiveHolds: MAX_ACTIVE_HOLDS,
        reasonEnc,
        attendingAdultName: adult?.name ?? null,
        attendingAdultRelation: adult?.relation ?? null,
      });
    } catch (error) {
      // Someone else holds or has booked this time.
      if (isRace(error)) {
        await this.deps.slots.invalidate(input.doctorId);
        throw errors.slotTaken();
      }
      throw error;
    }
    if (!row) {
      throw errors.conflict({
        detail: `You already hold ${MAX_ACTIVE_HOLDS} slots. Pay for one or wait for a hold to end.`,
      });
    }
    await this.deps.slots.invalidate(input.doctorId);
    return toAppointmentView(row);
  }

  // ---- reading ----

  private factsOf(principal: Principal, d: AppointmentDetail) {
    return {
      ownerUserId: d.patientAccountUserId,
      assigned: d.doctorUserId !== null && d.doctorUserId === principal.userId,
    };
  }

  private async load(id: string): Promise<AppointmentDetail> {
    const detail = await this.deps.repo.findDetail(id);
    if (!detail) throw errors.notFound();
    return detail;
  }

  async get(principal: Principal, id: string): Promise<AppointmentDetailView> {
    const detail = await this.load(id);
    assertAllowed(can.appointment.read(principal, this.factsOf(principal, detail)));
    return toDetailView(detail);
  }

  /** Patients see the bookings on their account; doctors see their confirmed upcoming ones. */
  async list(
    principal: Principal,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<{ items: AppointmentDetailView[]; nextCursor: string | null }> {
    const after = query.cursor ? decodeAppointmentCursor(query.cursor) : undefined;
    const limit = query.limit + 1;
    const asDoctor = principal.roles.includes("doctor") && !principal.roles.includes("patient");
    const rows = asDoctor
      ? await this.deps.repo.listForDoctor({
          doctorUserId: principal.userId,
          ...(after ? { after } : {}),
          limit,
        })
      : await this.deps.repo.listForAccount({
          accountUserId: principal.userId,
          ...(after ? { after } : {}),
          limit,
        });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toDetailView),
      nextCursor: rows.length > query.limit && last ? encodeAppointmentCursor(last) : null,
    };
  }

  // ---- changing ----

  async cancel(
    principal: Principal,
    id: string,
    input: { reason: string },
  ): Promise<AppointmentDetailView> {
    const detail = await this.load(id);
    const decision = assertAllowed(
      can.appointment.cancel(principal, this.factsOf(principal, detail)),
    );
    const who: Canceller =
      decision.relation === "owner"
        ? "patient"
        : decision.relation === "assignedDoctor"
          ? "doctor"
          : "admin";
    const to = cancelStatusFor(who);
    if (!canMove(detail.status, to)) {
      throw errors.conflict({ detail: "This appointment can no longer be cancelled." });
    }
    // A confirmed appointment cannot be cancelled once its time has come.
    if (detail.status === "scheduled" && detail.startAt.getTime() <= Date.now()) {
      throw errors.conflict({ detail: "This appointment has already started." });
    }
    const done = await this.deps.repo.transition({
      id,
      from: detail.status,
      to,
      changedBy: principal.userId,
      reason: input.reason,
    });
    if (!done)
      throw errors.conflict({ detail: "This appointment just changed. Reload and try again." });
    await this.deps.slots.invalidate(detail.doctorId);
    return toDetailView(await this.load(id));
  }

  async reschedule(
    principal: Principal,
    id: string,
    input: { startAt: string },
  ): Promise<AppointmentDetailView> {
    const detail = await this.load(id);
    assertAllowed(can.appointment.reschedule(principal, this.factsOf(principal, detail)));
    if (detail.status !== "scheduled" || detail.startAt.getTime() <= Date.now()) {
      throw errors.conflict({
        detail: "Only a confirmed appointment that has not started can be moved.",
      });
    }
    if (detail.rescheduleCount >= MAX_RESCHEDULES) {
      throw errors.conflict({ detail: `An appointment can be moved ${MAX_RESCHEDULES} times.` });
    }
    const startAt = new Date(input.startAt);
    const day = istDate(startAt);
    const { slots } = await this.deps.slots.list(detail.doctorId, {
      from: day,
      to: day,
      fresh: true,
    });
    const slot = slots.find((s) => new Date(s.startAt).getTime() === startAt.getTime());
    if (!slot) throw errors.slotTaken({ detail: "That slot is not available. Choose another." });
    try {
      const moved = await this.deps.repo.reschedule({
        id,
        startAt,
        endAt: new Date(slot.endAt),
        changedBy: principal.userId,
        maxReschedules: MAX_RESCHEDULES,
      });
      if (!moved)
        throw errors.conflict({ detail: "This appointment just changed. Reload and try again." });
    } catch (error) {
      if (isRace(error)) {
        await this.deps.slots.invalidate(detail.doctorId);
        throw errors.slotTaken();
      }
      throw error;
    }
    await this.deps.slots.invalidate(detail.doctorId);
    return toDetailView(await this.load(id));
  }

  // ---- called by the system, not by a person ----

  /** Frees holds that ran out. The release job calls this until nothing is due. */
  async releaseExpired(batch = 200, maxBatches = 20): Promise<number> {
    let total = 0;
    const doctors = new Set<string>();
    for (let i = 0; i < maxBatches; i++) {
      const freed = await this.deps.repo.releaseExpiredHolds(batch);
      total += freed.length;
      for (const f of freed) doctors.add(f.doctorId);
      if (freed.length < batch) break;
    }
    for (const doctorId of doctors)
      await this.deps.slots.invalidate(doctorId).catch(() => undefined);
    return total;
  }

  /**
   * The payment hook (P5 calls it when a payment is captured). It never charges or refunds; it
   * only says what happened to the appointment, and the payment code acts on the answer:
   *   confirmed       the hold was still valid
   *   confirmed_late  the hold had run out but the time was still free, so it is confirmed
   *   already         it was already confirmed (a repeated webhook)
   *   slot_lost       the time went to someone else: refund automatically and tell the patient
   *   not_payable     released or cancelled meanwhile, or in another state: refund
   */
  async confirmAfterPayment(
    appointmentId: string,
    changedBy: string | null,
  ): Promise<"confirmed" | "confirmed_late" | "already" | "slot_lost" | "not_payable"> {
    const row = await this.deps.repo.findById(appointmentId);
    if (!row) return "not_payable";
    if (row.status === "scheduled" || row.status === "in_progress" || row.status === "completed") {
      return "already";
    }
    if (row.status !== "held" && row.status !== "expired") return "not_payable";
    try {
      const done = await this.deps.repo.confirmPaid({
        id: appointmentId,
        from: row.status,
        changedBy,
      });
      if (!done) {
        // Moved between the read and the write: look again once.
        const again = await this.deps.repo.findById(appointmentId);
        return again && ["scheduled", "in_progress", "completed"].includes(again.status)
          ? "already"
          : "not_payable";
      }
    } catch (error) {
      if (isRace(error)) return "slot_lost";
      throw error;
    }
    await this.deps.slots.invalidate(row.doctorId).catch(() => undefined);
    const late =
      row.status === "expired" ||
      (row.holdExpiresAt !== null && row.holdExpiresAt.getTime() <= Date.now());
    return late ? "confirmed_late" : "confirmed";
  }
}
