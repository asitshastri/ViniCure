import { errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { AvailabilityRepo } from "./availability-repo";
import {
  type HoursBody,
  type HoursView,
  type TimeOffBody,
  type TimeOffView,
} from "./availability-schemas";
import type { SlotService } from "./service";
import { istDate, istMidnight } from "./slots";

// A doctor sets their own weekly hours and time off (P4-08). Changes are for new bookings: an
// appointment that is already booked is never moved or cancelled here, and time off reports how
// many bookings it overlaps so the doctor can deal with them.

const DAY_MS = 86_400_000;

type Deps = {
  repo: AvailabilityRepo;
  slots: Pick<SlotService, "invalidate">;
  now?: () => Date;
};

export class AvailabilityService {
  constructor(private readonly deps: Deps) {}

  private now() {
    return (this.deps.now ?? (() => new Date()))();
  }

  private async own(principal: Principal, action: "read" | "write") {
    const doctor = await this.deps.repo.doctorOfUser(principal.userId);
    if (!doctor) throw errors.notFound();
    assertAllowed(can.doctorSchedule[action](principal, { ownerUserId: doctor.userId }));
    return doctor;
  }

  private toTimeOffView(t: {
    id: string;
    startAt: Date;
    endAt: Date;
    reason: string | null;
  }): TimeOffView {
    return {
      id: t.id,
      from: istDate(t.startAt),
      // The stored end is midnight after the last day.
      to: istDate(new Date(t.endAt.getTime() - 1)),
      reason: t.reason,
    };
  }

  async get(principal: Principal): Promise<{ rules: HoursView["rules"]; timeOff: TimeOffView[] }> {
    const doctor = await this.own(principal, "read");
    const now = this.now();
    const [rules, timeOff] = await Promise.all([
      this.deps.repo.currentRules(doctor.id, istDate(now)),
      this.deps.repo.listTimeOff(doctor.id, now),
    ]);
    return { rules, timeOff: timeOff.map((t) => this.toTimeOffView(t)) };
  }

  /** Replaces the weekly hours. The new hours start today; nothing already booked changes. */
  async saveHours(principal: Principal, body: HoursBody) {
    const doctor = await this.own(principal, "write");
    try {
      await this.deps.repo.replaceRules(doctor.id, body.rules, istDate(this.now()), uuidv7);
    } catch (error) {
      // The database refuses overlapping windows even if the checks above were bypassed.
      if (
        (error as { code?: string }).code === "23P01" ||
        (error as { code?: string }).code === "23514"
      ) {
        throw errors.validation([
          { path: "rules", message: "These hours overlap or do not fit the consultation length." },
        ]);
      }
      throw error;
    }
    await this.deps.slots.invalidate(doctor.id).catch(() => undefined);
    return this.get(principal);
  }

  async addTimeOff(
    principal: Principal,
    body: TimeOffBody,
  ): Promise<TimeOffView & { affectedAppointments: number }> {
    const doctor = await this.own(principal, "write");
    const startAt = istMidnight(body.from);
    const lastDay = istMidnight(body.to);
    if (!startAt || !lastDay)
      throw errors.validation([{ path: "from", message: "Enter a real date." }]);
    if (body.from < istDate(this.now())) {
      throw errors.validation([{ path: "from", message: "Time off cannot start in the past." }]);
    }
    const endAt = new Date(lastDay.getTime() + DAY_MS);
    const id = uuidv7();
    const added = await this.deps.repo.addTimeOff({
      id,
      doctorId: doctor.id,
      startAt,
      endAt,
      reason: body.reason ? body.reason : null,
    });
    if (!added)
      throw errors.conflict({
        detail: "You have the most time off entries allowed. Remove one first.",
      });
    await this.deps.slots.invalidate(doctor.id).catch(() => undefined);
    const affectedAppointments = await this.deps.repo.bookedBetween(doctor.id, startAt, endAt);
    return {
      ...this.toTimeOffView({ id, startAt, endAt, reason: body.reason ? body.reason : null }),
      affectedAppointments,
    };
  }

  async removeTimeOff(principal: Principal, id: string): Promise<void> {
    const doctor = await this.own(principal, "write");
    if (!(await this.deps.repo.removeTimeOff(id, doctor.id))) throw errors.notFound();
    await this.deps.slots.invalidate(doctor.id).catch(() => undefined);
  }
}
