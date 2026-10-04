import { z } from "zod";
import type { Crypto } from "../../lib/crypto/crypto";
import { errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { PatientRepo } from "../patients/repo";
import type { AppointmentRepo, AppointmentRow } from "./appointments-repo";
import type { SlotService } from "./service";
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
    await this.deps.repo.expireStaleHolds(input.doctorId, startAt, endAt);
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
      // 23P01 is the exclusion constraint: someone else holds or has booked this time.
      if ((error as { code?: string }).code === "23P01") {
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
}
