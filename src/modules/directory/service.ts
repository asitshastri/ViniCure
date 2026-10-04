import { AppError, errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { FileScanner } from "../../lib/adapters/types";
import type { QueueClient } from "../../lib/queue/queue";
import type { FilePurpose } from "../../lib/storage/policy";
import type { StorageService } from "../../lib/storage/storage";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { DirectoryRepo, DocumentRow, DoctorRow } from "./repo";
import {
  REQUIRED_KYC_DOC_TYPES,
  type ApplicationBody,
  type ApplicationView,
  type DocumentView,
  type PublicDoctorView,
  type PublicDoctorsQuery,
  type SpecialtyView,
} from "./schemas";

// Doctor application and KYC pipeline (P4-02). A doctor saves an application, uploads
// documents straight to storage, and the worker scans each one. An admin reviews the clean
// documents and then approves, rejects, suspends or reinstates the doctor. A doctor is listed
// only when approved and active. Everything here goes through the policy module, and a doctor
// or document that is not yours is a 404.

export type DoctorState = { kycStatus: string; status: string };
export type Decision = "approve" | "reject" | "suspend" | "reinstate";

/** The one table of allowed moves. Returns the new state, or null when the move is not allowed. */
export function nextState(from: DoctorState, decision: Decision): DoctorState | null {
  switch (decision) {
    case "approve":
      return from.kycStatus === "pending" && from.status === "pending"
        ? { kycStatus: "approved", status: "active" }
        : null;
    case "reject":
      return from.kycStatus === "pending" && from.status === "pending"
        ? { kycStatus: "rejected", status: "pending" }
        : null;
    case "suspend":
      return from.status === "active" ? { kycStatus: from.kycStatus, status: "suspended" } : null;
    case "reinstate":
      return from.status === "suspended" && from.kycStatus === "approved"
        ? { kycStatus: "approved", status: "active" }
        : null;
  }
}

export function documentState(doc: DocumentRow): DocumentView["state"] | null {
  if (doc.scanStatus === "infected") return "rejected_virus";
  if (doc.fileDeleted) return null;
  if (!doc.uploaded) return "waiting_for_upload";
  if (doc.scanStatus === "pending") return "checking";
  if (doc.scanStatus === "error") return "check_failed";
  if (doc.status === "approved") return "accepted";
  if (doc.status === "rejected") return "not_accepted";
  return "waiting_for_review";
}

export function toDocumentViews(docs: DocumentRow[]): DocumentView[] {
  const out: DocumentView[] = [];
  for (const doc of docs) {
    const state = documentState(doc);
    if (!state) continue;
    out.push({
      id: doc.id,
      docType: doc.docType as DocumentView["docType"],
      state,
      note: doc.status === "rejected" ? doc.reviewNote : null,
      createdAt: doc.createdAt.toISOString(),
    });
  }
  return out;
}

export function toApplicationView(row: DoctorRow, docs: DocumentRow[]): ApplicationView {
  return {
    id: row.id,
    displayName: row.displayName,
    registrationNo: row.registrationNo,
    registrationCouncil: row.registrationCouncil,
    qualifications: row.qualifications,
    languages: row.languages,
    specialtyId: row.specialtyId,
    consultationFeePaise: row.consultationFeePaise,
    kycStatus: row.kycStatus as ApplicationView["kycStatus"],
    status: row.status as ApplicationView["status"],
    note: row.kycStatus === "rejected" || row.status === "suspended" ? row.reviewNote : null,
    documents: toDocumentViews(docs),
    createdAt: row.createdAt.toISOString(),
  };
}

export type DoctorSummary = Pick<
  ApplicationView,
  | "id"
  | "displayName"
  | "registrationNo"
  | "registrationCouncil"
  | "kycStatus"
  | "status"
  | "createdAt"
>;

const toSummary = (row: DoctorRow): DoctorSummary => ({
  id: row.id,
  displayName: row.displayName,
  registrationNo: row.registrationNo,
  registrationCouncil: row.registrationCouncil,
  kycStatus: row.kycStatus as DoctorSummary["kycStatus"],
  status: row.status as DoctorSummary["status"],
  createdAt: row.createdAt.toISOString(),
});

export function encodeCursor(row: Pick<DoctorRow, "cursorTime" | "id">): string {
  return Buffer.from(JSON.stringify({ t: row.cursorTime, i: row.id })).toString("base64url");
}

export function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const bad = () =>
    errors.validation([{ path: "cursor", message: "This page link is not valid." }]);
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      t?: unknown;
      i?: unknown;
    };
    if (
      typeof parsed.t !== "string" ||
      typeof parsed.i !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(parsed.t) ||
      !/^[0-9a-f-]{36}$/.test(parsed.i)
    ) {
      throw bad();
    }
    return { createdAt: parsed.t, id: parsed.i };
  } catch {
    throw bad();
  }
}

export function encodePublicCursor(sort: string, row: { sortKey: string; id: string }): string {
  return Buffer.from(JSON.stringify({ s: sort, k: row.sortKey, i: row.id })).toString("base64url");
}

export function decodePublicCursor(cursor: string, sort: string): { key: string; id: string } {
  const bad = () =>
    errors.validation([{ path: "cursor", message: "This page link is not valid." }]);
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    // A cursor belongs to one sort order; reusing it with another would skip or repeat people.
    if (
      parsed.s !== sort ||
      typeof parsed.k !== "string" ||
      parsed.k.length > 200 ||
      typeof parsed.i !== "string" ||
      !/^[0-9a-f-]{36}$/.test(parsed.i) ||
      (sort !== "name" && !/^\d{1,9}$/.test(parsed.k))
    ) {
      throw bad();
    }
    return { key: parsed.k, id: parsed.i };
  } catch {
    throw bad();
  }
}

/** Copies the allow-listed fields only, so the page-cursor key never reaches a visitor. */
const toPublicView = (row: PublicDoctorView): PublicDoctorView => ({
  id: row.id,
  displayName: row.displayName,
  registrationNo: row.registrationNo,
  registrationCouncil: row.registrationCouncil,
  qualifications: row.qualifications,
  languages: row.languages,
  specialty: row.specialty,
  consultationFeePaise: row.consultationFeePaise,
  availableToday: row.availableToday,
});

type Deps = {
  repo: DirectoryRepo;
  storage: () => StorageService;
  queue: () => Promise<Pick<QueueClient, "enqueue">>;
};

export class DirectoryService {
  constructor(private readonly deps: Deps) {}

  private get repo() {
    return this.deps.repo;
  }

  // ---- the doctor's own application ----

  async myApplication(principal: Principal): Promise<ApplicationView> {
    const doctor = await this.repo.findDoctorByUser(principal.userId);
    if (!doctor) throw errors.notFound();
    assertAllowed(can.doctorProfile.read(principal, { ownerUserId: principal.userId }));
    return toApplicationView(doctor, await this.repo.documentsOf(doctor.id));
  }

  async saveApplication(principal: Principal, data: ApplicationBody): Promise<ApplicationView> {
    assertAllowed(can.doctorProfile.write(principal, { ownerUserId: principal.userId }));
    let doctor: DoctorRow | null;
    try {
      doctor = await this.repo.saveApplication({ id: uuidv7(), userId: principal.userId, data });
    } catch (error) {
      const e = error as { code?: string; constraint?: string };
      if (e.code === "23505" && e.constraint === "doctors_registration_idx") {
        throw errors.conflict({ detail: "This registration is already in use." });
      }
      if (e.code === "23503") {
        throw errors.validation([
          { path: "specialtyId", message: "Choose a specialty from the list." },
        ]);
      }
      throw error;
    }
    if (!doctor) {
      throw errors.conflict({
        detail: "An approved profile cannot be changed here. Ask support for a change.",
      });
    }
    return toApplicationView(doctor, await this.repo.documentsOf(doctor.id));
  }

  // ---- documents ----

  async requestUpload(
    principal: Principal,
    input: { docType: string; contentType: string; sizeBytes: number },
  ) {
    const doctor = await this.repo.findDoctorByUser(principal.userId);
    if (!doctor) {
      throw errors.conflict({ detail: "Save your application before adding documents." });
    }
    assertAllowed(can.kycDocument.upload(principal, { ownerUserId: principal.userId }));
    // The storage module checks type and size against the KYC policy and signs the slot.
    const slot = await this.deps.storage().createUploadSlot({
      purpose: "kyc",
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
    });
    const documentId = uuidv7();
    const created = await this.repo.createDocument({
      documentId,
      fileId: uuidv7(),
      doctorId: doctor.id,
      ownerUserId: principal.userId,
      docType: input.docType,
      storageKey: slot.storageKey,
      mimeType: slot.headers["Content-Type"],
      sizeBytes: input.sizeBytes,
      // The name is never used as a path or key; it is only a label.
      fileName: input.docType,
    });
    if (!created) {
      throw errors.conflict({
        detail: "You have added the most documents allowed. Remove one first.",
      });
    }
    return {
      documentId,
      upload: { url: slot.url, headers: slot.headers, expiresAt: slot.expiresAt.toISOString() },
    };
  }

  private async ownDocument(principal: Principal, id: string): Promise<DocumentRow> {
    const doc = await this.repo.findDocument(id);
    const doctor = doc ? await this.repo.findDoctor(doc.doctorId) : null;
    if (!doc || !doctor) throw errors.notFound();
    assertAllowed(can.kycDocument.upload(principal, { ownerUserId: doctor.userId ?? "" }));
    return doc;
  }

  /** The doctor says the upload is done. Check it, then queue the virus scan. Safe to repeat. */
  async completeUpload(principal: Principal, id: string): Promise<DocumentView> {
    const doc = await this.ownDocument(principal, id);
    if (doc.fileDeleted) throw errors.notFound();
    if (!doc.uploaded) {
      try {
        await this.deps.storage().verifyUpload({
          purpose: "kyc",
          storageKey: doc.storageKey,
          declaredType: doc.mimeType,
          declaredSizeBytes: doc.sizeBytes,
        });
      } catch (error) {
        // verifyUpload already deleted a bad object; retire the record so it cannot be reused.
        if (error instanceof AppError && error.code === "file_rejected") {
          await this.repo.removeFile(doc.fileId);
        }
        throw error;
      }
      await this.repo.markUploaded(doc.fileId);
    }
    if (doc.scanStatus === "pending" || doc.scanStatus === "error") {
      // One scan job per file, however many times this is called.
      await (
        await this.deps.queue()
      ).enqueue("file.scan", { fileId: doc.fileId }, { dedupeKey: doc.fileId });
    }
    const fresh = await this.repo.findDocument(id);
    const view = fresh ? toDocumentViews([fresh])[0] : undefined;
    if (!view) throw errors.notFound();
    return view;
  }

  // ---- admin ----

  async list(
    principal: Principal,
    query: { status?: string; kycStatus?: string; cursor?: string; limit: number },
  ): Promise<{ items: DoctorSummary[]; nextCursor: string | null }> {
    assertAllowed(can.doctorProfile.read(principal, { ownerUserId: "" }));
    const rows = await this.repo.listDoctors({
      ...(query.status ? { status: query.status } : {}),
      ...(query.kycStatus ? { kycStatus: query.kycStatus } : {}),
      ...(query.cursor ? { after: decodeCursor(query.cursor) } : {}),
      limit: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toSummary),
      nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null,
    };
  }

  async detail(principal: Principal, id: string): Promise<ApplicationView> {
    const doctor = await this.repo.findDoctor(id);
    if (!doctor) throw errors.notFound();
    assertAllowed(can.doctorProfile.read(principal, { ownerUserId: doctor.userId ?? "" }));
    return toApplicationView(doctor, await this.repo.documentsOf(doctor.id));
  }

  async reviewDocument(
    principal: Principal,
    id: string,
    input: { decision: "approve" | "reject"; note?: string | undefined },
  ): Promise<DocumentView> {
    const doc = await this.repo.findDocument(id);
    const doctor = doc ? await this.repo.findDoctor(doc.doctorId) : null;
    if (!doc || !doctor) throw errors.notFound();
    assertAllowed(can.kycDocument.review(principal, { ownerUserId: doctor.userId ?? "" }));
    if (doctor.userId === principal.userId) {
      throw errors.forbidden({ detail: "You cannot review your own documents." });
    }
    const done = await this.repo.reviewDocument({
      id,
      reviewerId: principal.userId,
      decision: input.decision === "approve" ? "approved" : "rejected",
      note: input.decision === "reject" ? (input.note ?? null) : null,
    });
    if (!done) {
      throw errors.conflict({
        detail: "This document cannot be reviewed now. It may be unchecked or already decided.",
      });
    }
    const fresh = await this.repo.findDocument(id);
    const view = fresh ? toDocumentViews([fresh])[0] : undefined;
    if (!view) throw errors.notFound();
    return view;
  }

  async decide(
    principal: Principal,
    id: string,
    input: { decision: Decision; note?: string | undefined },
  ): Promise<ApplicationView> {
    const doctor = await this.repo.findDoctor(id);
    if (!doctor) throw errors.notFound();
    assertAllowed(can.doctorProfile.review(principal, { ownerUserId: doctor.userId ?? "" }));
    if (doctor.userId === principal.userId) {
      throw errors.forbidden({ detail: "You cannot decide on your own application." });
    }
    const from = { kycStatus: doctor.kycStatus, status: doctor.status };
    const to = nextState(from, input.decision);
    if (!to) {
      throw errors.conflict({ detail: "That is not possible for a doctor in this state." });
    }
    if (input.decision === "approve") {
      const have = new Set(await this.repo.approvedDocTypes(doctor.id));
      const missing = REQUIRED_KYC_DOC_TYPES.filter((type) => !have.has(type));
      if (missing.length > 0) {
        throw errors.conflict({
          detail: `Accept these documents first: ${missing.join(", ").replaceAll("_", " ")}.`,
        });
      }
    }
    const changed = await this.repo.applyDecision(id, {
      from,
      to,
      note:
        input.decision === "approve" || input.decision === "reinstate"
          ? null
          : (input.note ?? null),
    });
    // Someone else decided first: the state we read is no longer current.
    if (!changed)
      throw errors.conflict({ detail: "This application changed. Reload and try again." });
    return toApplicationView(changed, await this.repo.documentsOf(id));
  }

  /** A short-lived link for an admin to open one clean document. */
  async downloadUrl(principal: Principal, id: string): Promise<{ url: string; expiresAt: string }> {
    const doc = await this.repo.findDocument(id);
    const doctor = doc ? await this.repo.findDoctor(doc.doctorId) : null;
    if (!doc || !doctor) throw errors.notFound();
    assertAllowed(can.kycDocument.read(principal, { ownerUserId: doctor.userId ?? "" }));
    // Only a file that passed the scan is ever offered.
    if (doc.fileDeleted || !doc.uploaded || doc.scanStatus !== "clean") throw errors.notFound();
    const link = await this.deps.storage().createDownloadUrl({
      purpose: "kyc",
      storageKey: doc.storageKey,
      type: doc.mimeType as never,
      fileName: doc.docType,
    });
    return { url: link.url, expiresAt: link.expiresAt.toISOString() };
  }

  // ---- public directory (P4-03): no sign-in, only listed doctors ----

  specialties(): Promise<SpecialtyView[]> {
    return this.repo.listSpecialties();
  }

  async searchDoctors(
    query: PublicDoctorsQuery,
  ): Promise<{ items: PublicDoctorView[]; nextCursor: string | null }> {
    const { cursor, limit, sort, ...filters } = query;
    const rows = await this.repo.searchPublic({
      ...filters,
      sort,
      ...(cursor ? { after: decodePublicCursor(cursor, sort) } : {}),
      limit: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map(toPublicView),
      nextCursor: rows.length > limit && last ? encodePublicCursor(sort, last) : null,
    };
  }

  /** A doctor who is not listed is a 404, whatever the reason (pending, rejected, suspended). */
  async publicProfile(id: string): Promise<PublicDoctorView> {
    const row = await this.repo.findPublic(id);
    if (!row) throw errors.notFound();
    return toPublicView(row);
  }

  // ---- worker ----

  /**
   * The file.scan job. Safe to run twice. A scanner outage leaves the file inactive and throws,
   * so the queue retries; an infected file is deleted from storage and never offered.
   */
  async scanFile(fileId: string, scanner: FileScanner): Promise<"clean" | "infected" | "skipped"> {
    const file = await this.repo.fileForScan(fileId);
    if (!file || file.scanStatus === "clean" || file.scanStatus === "infected") return "skipped";
    const { status } = await scanner.scan({ storageKey: file.storageKey });
    await this.repo.setScanResult(fileId, status);
    if (status === "error") throw new Error("scanner could not decide");
    if (status === "infected") {
      // The key starts with the purpose (storage.ts), which tells which bucket holds it.
      await this.deps
        .storage()
        .remove(file.storageKey.split("/")[0] as FilePurpose, file.storageKey);
    }
    return status;
  }
}
