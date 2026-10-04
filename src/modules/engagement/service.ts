import { decodeCursor, encodeCursor } from "../../lib/cursor";
import { errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { DirectoryRepo } from "../directory/repo";
import type { PublicDoctorView } from "../directory/schemas";
import { toPublicView } from "../directory/service";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { PatientRepo } from "../patients/repo";
import type { EngagementRepo, ReviewRow } from "./repo";
import type { ModerationReviewView, OwnReviewView, PublicReviewView } from "./schemas";

// Reviews and favorites (P4-10). A review needs a completed appointment and the account that
// booked it; it is public only after an admin publishes it, and the reviewer is never named.

const toPublic = (r: ReviewRow): PublicReviewView => ({
  id: r.id,
  rating: r.rating,
  comment: r.comment,
  createdAt: r.createdAt.toISOString(),
});
const toOwn = (r: ReviewRow): OwnReviewView => ({
  ...toPublic(r),
  status: r.status as OwnReviewView["status"],
});

type Deps = {
  repo: EngagementRepo;
  directory: Pick<DirectoryRepo, "findPublic" | "findPublicMany">;
  patients: Pick<PatientRepo, "findById">;
};

export class EngagementService {
  constructor(private readonly deps: Deps) {}

  // ---- reviews ----

  async submitReview(
    principal: Principal,
    appointmentId: string,
    input: { rating: number; comment?: string | undefined },
  ): Promise<OwnReviewView> {
    const appt = await this.deps.repo.appointmentForReview(appointmentId);
    if (!appt) throw errors.notFound();
    // Only the account that booked it (404 for anyone else, same as a missing appointment).
    assertAllowed(can.appointment.review(principal, { ownerUserId: appt.accountUserId }));
    if (appt.status !== "completed") {
      throw errors.conflict({
        detail: "You can review a doctor after the consultation is complete.",
      });
    }
    const row = await this.deps.repo.createReview({
      id: uuidv7(),
      appointmentId,
      authorUserId: principal.userId,
      rating: input.rating,
      comment: input.comment ?? null,
    });
    if (!row) throw errors.conflict({ detail: "You have already reviewed this consultation." });
    return toOwn(row);
  }

  /** Published reviews of a listed doctor, newest first. */
  async publicReviews(
    doctorId: string,
    query: { cursor?: string | undefined; limit: number },
  ): Promise<{ items: PublicReviewView[]; nextCursor: string | null }> {
    if (!(await this.deps.directory.findPublic(doctorId))) throw errors.notFound();
    const rows = await this.deps.repo.listPublished({
      doctorId,
      ...(query.cursor ? { after: decodeCursor(query.cursor) } : {}),
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toPublic),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ t: last.cursorTime, i: last.id }) : null,
    };
  }

  // ---- moderation (admin) ----

  async moderationQueue(
    principal: Principal,
    query: { status: string; cursor?: string | undefined; limit: number },
  ): Promise<{ items: ModerationReviewView[]; nextCursor: string | null }> {
    assertAllowed(can.review.read(principal, { ownerUserId: "" }));
    const rows = await this.deps.repo.listByStatus({
      status: query.status,
      ...(query.cursor ? { after: decodeCursor(query.cursor) } : {}),
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        ...toOwn(r),
        doctorId: r.doctorId,
        appointmentId: r.appointmentId,
      })),
      nextCursor:
        rows.length > query.limit && last ? encodeCursor({ t: last.cursorTime, i: last.id }) : null,
    };
  }

  async moderate(
    principal: Principal,
    id: string,
    decision: "publish" | "hide",
  ): Promise<{ status: "published" | "hidden" }> {
    assertAllowed(can.review.moderate(principal, { ownerUserId: "" }));
    const to = decision === "publish" ? "published" : "hidden";
    const doctorId = await this.deps.repo.moderate({ id, to, by: principal.userId });
    if (!doctorId) throw errors.notFound();
    // The average is recomputed from the published reviews, so a repeat or a race heals itself.
    await this.deps.repo.refreshRating(doctorId);
    return { status: to };
  }

  // ---- favorites ----

  private async ownProfile(principal: Principal, patientId: string) {
    const patient = await this.deps.patients.findById(patientId);
    if (!patient) throw errors.notFound();
    assertAllowed(can.patientProfile.write(principal, { ownerUserId: patient.accountUserId }));
    return patient;
  }

  async addFavorite(
    principal: Principal,
    input: { patientId: string; doctorId: string },
  ): Promise<{ saved: true }> {
    await this.ownProfile(principal, input.patientId);
    if (!(await this.deps.directory.findPublic(input.doctorId))) throw errors.notFound();
    const added = await this.deps.repo.addFavorite(input.patientId, input.doctorId);
    if (!added && !(await this.deps.repo.isFavorite(input.patientId, input.doctorId))) {
      throw errors.conflict({ detail: "You can save up to 50 doctors. Remove one first." });
    }
    return { saved: true };
  }

  async removeFavorite(
    principal: Principal,
    input: { patientId: string; doctorId: string },
  ): Promise<void> {
    await this.ownProfile(principal, input.patientId);
    await this.deps.repo.removeFavorite(input.patientId, input.doctorId);
  }

  async listFavorites(
    principal: Principal,
    patientId: string,
  ): Promise<{ items: PublicDoctorView[] }> {
    await this.ownProfile(principal, patientId);
    const ids = await this.deps.repo.favoriteDoctorIds(patientId);
    // A doctor who is no longer listed quietly drops out of the list.
    return { items: (await this.deps.directory.findPublicMany(ids)).map(toPublicView) };
  }
}
