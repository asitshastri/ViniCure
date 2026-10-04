import { getRefunds } from "../payments";
import { z } from "zod";
import { getCache } from "../../lib/cache";
import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable, txRunner } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { getCrypto } from "../../lib/crypto/crypto";
import { PatientRepo } from "../patients/repo";
import { AppointmentRepo } from "./appointments-repo";
import { AppointmentService } from "./appointments";
import { AvailabilityRepo } from "./availability-repo";
import { AvailabilityService } from "./availability";
import { SchedulingRepo } from "./repo";
import { SlotService } from "./service";

export { SlotService } from "./service";
export * from "./appointments";
export * from "./availability-schemas";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");
export const slotsQuery = z.object({ from: date.optional(), to: date.optional() }).strict();

const holder = globalSingleton("scheduling", () => ({
  slots: undefined as SlotService | undefined,
  appointments: undefined as AppointmentService | undefined,
  availability: undefined as AvailabilityService | undefined,
}));

export function getSlots(): SlotService {
  holder.slots ??= new SlotService({
    repo: new SchedulingRepo(queryable(getDatabase())),
    cache: getCache,
    env: getConfig().NODE_ENV,
    // Taken time is read from appointments, so a held slot disappears from the list at once.
    booked: (doctorId, from, to) =>
      new AppointmentRepo(queryable(getDatabase())).activeIntervals(doctorId, from, to),
  });
  return holder.slots;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setSlotsForTest(service: SlotService | undefined): void {
  holder.slots = service;
}

export function getAppointments(): AppointmentService {
  holder.appointments ??= new AppointmentService({
    repo: new AppointmentRepo(queryable(getDatabase())),
    patients: new PatientRepo(queryable(getDatabase())),
    slots: getSlots(),
    crypto: getCrypto,
    // A doctor's or admin's cancellation of a paid booking gives the money back (P5-07).
    onCancelled: ({ appointmentId, by, from }) =>
      getRefunds().refundForCancellation(appointmentId, by, from),
  });
  return holder.appointments;
}

export function getAvailability(): AvailabilityService {
  holder.availability ??= new AvailabilityService({
    repo: new AvailabilityRepo(queryable(getDatabase()), txRunner()),
    slots: getSlots(),
  });
  return holder.availability;
}
