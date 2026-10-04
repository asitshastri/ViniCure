import { randomInt } from "node:crypto";
import { AdapterError, type VideoProvider } from "../../lib/adapters/types";
import { AppError, errors } from "../../lib/errors/app-error";
import { logger } from "../../lib/logging/logger";
import { uuidv7 } from "../../lib/ids";
import type { ConsentService } from "../consent/service";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { ConsultationRepo, JoinAppointment, ParticipantRow } from "./repo";
import { MAX_OVERRUN_MINUTES, type EndView, type JoinView, type JoinWindow } from "./schemas";

// Joining, renewing and ending a video consultation (P6-03, P6-04). Every token is built for one
// person, one room and one provider number, and only after the server has checked, in this order:
//   1. the appointment exists and the caller is the patient's account or the assigned doctor
//      (anyone else gets the same 404 as a missing appointment);
//   2. the appointment is booked and not over (scheduled or in progress) and, for the patient, paid;
//   3. now is inside the join window, for both people;
//   4. for the patient, the telemedicine and video consents are on record (P6-05);
//   5. the consultation has not ended and the person's seat was not revoked.
// Nothing here believes the browser about who it is, whether it paid, or what time it is.

const PROVIDER = "agora";
const MINUTE = 60_000;

type Deps = {
  repo: ConsultationRepo;
  video: () => VideoProvider;
  consent: Pick<ConsentService, "missingFor">;
  /** The provider's public app id. */
  appId: () => string;
  /** Lifetime of one token. */
  tokenTtlSeconds: () => number;
  window: () => JoinWindow;
  now?: () => number;
  /** For tests: the provider number to try next. */
  newUid?: () => number;
};

export class ConsultationService {
  constructor(private readonly deps: Deps) {}

  private now = () => (this.deps.now ?? Date.now)();

  private windowOf(appt: JoinAppointment) {
    const { earlyMinutes, lateMinutes } = this.deps.window();
    return {
      opens: appt.startAt.getTime() - earlyMinutes * MINUTE,
      closes: appt.endAt.getTime() + lateMinutes * MINUTE,
    };
  }

  private async load(appointmentId: string): Promise<JoinAppointment> {
    const appt = await this.deps.repo.appointmentForJoin(appointmentId);
    if (!appt) throw errors.notFound();
    return appt;
  }

  /** A random provider number for this person: 1 to 2^32 - 1, never 0. */
  private newUid(): number {
    return this.deps.newUid ? this.deps.newUid() : randomInt(1, 4_294_967_296);
  }

  /** Provider trouble reads as "try again", never as a raw provider error. */
  private async viaProvider<T>(what: string, call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof AdapterError) {
        logger.error({ event: "video_provider_failed", what, kind: error.kind });
        throw errors.unavailable({
          detail: "Video is not available right now. Try again in a moment.",
        });
      }
      throw error;
    }
  }

  private async token(roomRef: string, uid: number) {
    try {
      return await this.deps.video().issueToken({
        roomRef,
        uid,
        // Both people publish audio and video.
        role: "host",
        ttlSeconds: this.deps.tokenTtlSeconds(),
      });
    } catch (error) {
      if (error instanceof AdapterError) {
        logger.error({ event: "video_token_failed", kind: error.kind });
        throw errors.unavailable({
          detail: "Video is not available right now. Try again in a moment.",
        });
      }
      throw error;
    }
  }

  /** Gives the caller their way into the room, after every check. */
  async join(principal: Principal, appointmentId: string): Promise<JoinView> {
    const appt = await this.load(appointmentId);
    const { opens, closes } = this.windowOf(appt);
    const now = this.now();
    const inWindow = now >= opens && now <= closes;

    // 1 and the owner's payment and window rules (the policy answers 404 or says why not yet).
    const decision = assertAllowed(
      can.consultation.join(principal, {
        ownerUserId: appt.patientAccountUserId,
        assigned: appt.doctorUserId !== null && appt.doctorUserId === principal.userId,
        paid: appt.paid,
        inWindow,
      }),
    );
    const role = decision.relation === "owner" ? "patient" : "doctor";

    // 2 and 3 for both people.
    if (appt.status !== "scheduled" && appt.status !== "in_progress") {
      throw errors.conflict({ detail: "This appointment cannot be joined." });
    }
    if (!appt.paid) throw errors.forbidden({ detail: "Payment is needed before you can join." });
    if (!inWindow) throw new AppError("outside_join_window");

    // 4 for the patient: the texts they must have agreed to.
    if (role === "patient") {
      const missing = await this.deps.consent.missingFor(appt.patientAccountUserId, appt.patientId);
      if (missing.length > 0) {
        throw new AppError("consent_required", {
          detail: "Agree to the video consultation terms before joining.",
          issues: missing.map((p) => ({ path: "consent", message: p.kind })),
        });
      }
    }

    // The room: made once, random, kept on the consultation.
    let consultation = await this.deps.repo.findByAppointment(appt.id);
    if (!consultation) {
      const { roomRef } = await this.viaProvider("createRoom", () =>
        this.deps.video().createRoom(),
      );
      consultation = await this.deps.repo.ensureConsultation({
        id: uuidv7(),
        appointmentId: appt.id,
        provider: PROVIDER,
        roomRef,
      });
    }
    // 5.
    if (consultation.status === "ended" || consultation.status === "abandoned") {
      throw errors.conflict({ detail: "This consultation has ended." });
    }

    // The person's seat, with a provider number of their own.
    let seat: ParticipantRow | null = null;
    for (let attempt = 0; !seat && attempt < 5; attempt++) {
      try {
        seat = await this.deps.repo.ensureParticipant({
          id: uuidv7(),
          consultationId: consultation.id,
          userId: principal.userId,
          role,
          providerUid: this.newUid(),
        });
      } catch (error) {
        // Another person in this room got the same number (about 1 in 4 billion): pick again.
        const e = error as { code?: string; constraint?: string };
        if (!(e.code === "23505" && e.constraint === "consultation_participants_uid_idx"))
          throw error;
      }
    }
    if (!seat) throw errors.unavailable();
    if (seat.revokedAt) throw errors.forbidden({ detail: "This consultation has ended." });

    const { token, expiresAt } = await this.token(consultation.roomRef, seat.providerUid);
    await this.deps.repo.markJoined(seat.id, expiresAt);
    // The doctor coming in is what starts the consultation.
    if (role === "doctor") {
      await this.deps.repo.startLive(consultation.id, appt.id, principal.userId);
    }
    logger.info({ event: "consultation_joined", role });
    return {
      appointmentId: appt.id,
      role,
      appId: this.deps.appId(),
      channel: consultation.roomRef,
      uid: seat.providerUid,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * A fresh token for someone already in the room, when the video SDK says theirs is about to
   * lapse. Refused once the consultation ended or the person's seat was revoked, once the
   * appointment is no longer booked, or well after the booked time.
   */
  async renew(principal: Principal, appointmentId: string): Promise<JoinView> {
    const seat = await this.deps.repo.seatFor(appointmentId, principal.userId);
    // Someone who never joined (or someone else's appointment) is the same 404.
    if (!seat) throw errors.notFound();
    if (
      seat.revokedAt ||
      seat.consultationStatus === "ended" ||
      seat.consultationStatus === "abandoned" ||
      (seat.appointmentStatus !== "scheduled" && seat.appointmentStatus !== "in_progress")
    ) {
      throw errors.forbidden({ detail: "This consultation has ended." });
    }
    const appt = await this.load(appointmentId);
    const { closes } = this.windowOf(appt);
    if (this.now() > closes + MAX_OVERRUN_MINUTES * MINUTE) {
      throw errors.forbidden({ detail: "This consultation has ended." });
    }
    const { token, expiresAt } = await this.token(seat.roomRef, seat.providerUid);
    await this.deps.repo.markJoined(seat.id, expiresAt);
    return {
      appointmentId,
      role: seat.role as "patient" | "doctor",
      appId: this.deps.appId(),
      channel: seat.roomRef,
      uid: seat.providerUid,
      token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /**
   * The assigned doctor ends the consultation for everyone. Every seat is revoked, so no token can
   * be renewed. A call that went live is completed; one nobody started is abandoned. Ending twice
   * is an error the second time (nothing more to end).
   */
  async end(principal: Principal, appointmentId: string): Promise<EndView> {
    const appt = await this.load(appointmentId);
    assertAllowed(
      can.consultation.end(principal, {
        ownerUserId: appt.patientAccountUserId,
        assigned: appt.doctorUserId !== null && appt.doctorUserId === principal.userId,
      }),
    );
    const consultation = await this.deps.repo.findByAppointment(appt.id);
    if (!consultation) throw errors.conflict({ detail: "This consultation has not started." });
    const result = await this.deps.repo.end(consultation.id, appt.id, principal.userId);
    if (!result) throw errors.conflict({ detail: "This consultation has already ended." });
    logger.info({ event: "consultation_ended", result });
    return { status: result };
  }
}
