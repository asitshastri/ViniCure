import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb } from "../../db/testing";
import { FakeFileScanner } from "../../lib/adapters/fakes";
import type { Queryable } from "../../lib/db/queryable";
import { AppError } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import {
  StorageService,
  type ObjectInfo,
  type ObjectStore,
  type StorageConfig,
} from "../../lib/storage/storage";
import type { Role } from "../../lib/api/types";
import type { Principal } from "../identity/policy";
import { DirectoryRepo } from "./repo";
import {
  adminDoctorsQuery,
  applicationBody,
  doctorDecisionBody,
  reviewDocumentBody,
} from "./schemas";
import { DirectoryService, nextState } from "./service";

const PDF = Uint8Array.from([
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0, 0, 0, 0, 0, 0, 0, 0,
]);
const EXE = Uint8Array.from([0x4d, 0x5a, 0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0]);
const config: StorageConfig = {
  buckets: { files: "vc-files", exports: "vc-exports" },
  region: "ap-south-1",
  signedUrlTtlSeconds: 300,
};

class MemoryStore implements ObjectStore {
  readonly objects = new Map<string, { head: Uint8Array; size: number }>();
  async presignPut(a: { bucket: string; key: string }) {
    return `https://fake/${a.bucket}/${a.key}`;
  }
  async presignGet(a: { bucket: string; key: string }) {
    return `https://fake/${a.bucket}/${a.key}?get`;
  }
  async head(bucket: string, key: string): Promise<ObjectInfo | null> {
    const o = this.objects.get(`${bucket}/${key}`);
    return o ? { sizeBytes: o.size, contentType: "x" } : null;
  }
  async readHead(bucket: string, key: string) {
    return this.objects.get(`${bucket}/${key}`)?.head ?? new Uint8Array();
  }
  async read(bucket: string, key: string) {
    const head = this.objects.get(`${bucket}/${key}`)?.head ?? new Uint8Array();
    return (async function* () {
      yield head;
    })();
  }
  async delete(bucket: string, key: string) {
    this.objects.delete(`${bucket}/${key}`);
  }
}

let q: Queryable;
let store: MemoryStore;
let service: DirectoryService;
let jobs: { name: string; payload: unknown; dedupe?: string }[];
let scanner: FakeFileScanner;

const application = {
  displayName: "Meera Shah",
  registrationNo: "G-45012",
  registrationCouncil: "Gujarat Medical Council",
  qualifications: "MBBS, MD (Medicine)",
  languages: ["English", "Hindi"],
  specialtyId: 1,
  consultationFeePaise: 49_900,
};

async function person(roles: Role[]): Promise<Principal> {
  const id = uuidv7();
  await q.query(`INSERT INTO users (id, name, email) VALUES ($1, 'U', $2)`, [
    id,
    `${id}@no-email.invalid`,
  ]);
  return { userId: id, roles };
}

async function code(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "ok";
  } catch (e) {
    return e instanceof AppError ? e.code : `other:${String(e)}`;
  }
}

/** Gets a slot, "uploads" the bytes, and completes. Returns the document id. */
async function addDocument(
  doctor: Principal,
  docType: string,
  bytes: Uint8Array = PDF,
  size = 1000,
): Promise<string> {
  const slot = await service.requestUpload(doctor, {
    docType,
    contentType: "application/pdf",
    sizeBytes: size,
  });
  const key = new URL(slot.upload.url).pathname.replace(/^\/vc-files\//, "");
  store.objects.set(`vc-files/${key}`, { head: bytes, size });
  await service.completeUpload(doctor, slot.documentId);
  return slot.documentId;
}

async function scanAll() {
  const { rows } = await q.query("SELECT id FROM files WHERE uploaded_at IS NOT NULL");
  for (const r of rows) await service.scanFile(String(r.id), scanner).catch(() => undefined);
}

let shared: ReturnType<typeof createTestDb> | undefined;
beforeAll(async () => {
  shared ??= createTestDb();
  const pg = await shared;
  q = {
    query: async (text, params) => ({
      rows: (await pg.db.query(text, params)).rows as Record<string, unknown>[],
    }),
  };
}, 60_000);

let doctor: Principal;
let admin: Principal;
beforeEach(async () => {
  await q.query("DELETE FROM doctor_kyc_documents");
  await q.query("DELETE FROM files");
  await q.query("DELETE FROM doctor_specialties");
  await q.query("DELETE FROM doctors");
  await q.query("DELETE FROM specialties");
  await q.query(
    "INSERT INTO specialties (id, name) VALUES (1, 'General medicine'), (2, 'Dermatology')",
  );
  await q.query("DELETE FROM users");
  store = new MemoryStore();
  jobs = [];
  scanner = new FakeFileScanner();
  service = new DirectoryService({
    repo: new DirectoryRepo(q),
    storage: () => new StorageService(store, config),
    queue: async () => ({
      enqueue: async (name: string, payload: unknown, options?: { dedupeKey?: string }) => {
        if (options?.dedupeKey && jobs.some((j) => j.dedupe === options.dedupeKey)) return null;
        jobs.push({ name, payload, ...(options?.dedupeKey ? { dedupe: options.dedupeKey } : {}) });
        return "job";
      },
    }),
  });
  doctor = await person(["doctor"]);
  admin = await person(["admin"]);
});

describe("the application", () => {
  it("a doctor saves, reads and changes their own application", async () => {
    const saved = await service.saveApplication(doctor, application);
    expect(saved).toMatchObject({ kycStatus: "pending", status: "pending", specialtyId: 1 });
    const changed = await service.saveApplication(doctor, {
      ...application,
      specialtyId: 2,
      consultationFeePaise: 60_000,
    });
    expect(changed).toMatchObject({ id: saved.id, specialtyId: 2, consultationFeePaise: 60_000 });
    expect((await service.myApplication(doctor)).id).toBe(saved.id);
    const { rows } = await q.query("SELECT count(*)::int AS n FROM doctor_specialties");
    expect(rows[0]?.n).toBe(1);
  });

  it("only a doctor can apply; other roles get 404", async () => {
    const patient = await person(["patient"]);
    expect(await code(service.saveApplication(patient, application))).toBe("not_found");
    expect(await code(service.myApplication(patient))).toBe("not_found");
  });

  it("the same registration cannot be claimed twice, and an unknown specialty is refused", async () => {
    await service.saveApplication(doctor, application);
    const other = await person(["doctor"]);
    expect(await code(service.saveApplication(other, application))).toBe("conflict");
    expect(
      await code(
        service.saveApplication(other, { ...application, registrationNo: "G-1", specialtyId: 99 }),
      ),
    ).toBe("validation_failed");
  });

  it("the server never takes status or fees from the client", () => {
    expect(applicationBody.safeParse({ ...application, status: "active" }).success).toBe(false);
    expect(applicationBody.safeParse({ ...application, platformFeeBps: 0 }).success).toBe(false);
    expect(applicationBody.safeParse({ ...application, kycStatus: "approved" }).success).toBe(
      false,
    );
    expect(applicationBody.safeParse({ ...application, consultationFeePaise: 5 }).success).toBe(
      false,
    );
  });
});

describe("uploading and scanning documents", () => {
  beforeEach(async () => {
    await service.saveApplication(doctor, application);
  });

  it("slot, upload, complete, scan: the document waits for review only once clean", async () => {
    const id = await addDocument(doctor, "registration_certificate");
    expect(jobs).toEqual([expect.objectContaining({ name: "file.scan" })]);
    expect((await service.myApplication(doctor)).documents[0]).toMatchObject({
      id,
      state: "checking",
    });
    await scanAll();
    expect((await service.myApplication(doctor)).documents[0]).toMatchObject({
      id,
      state: "waiting_for_review",
    });
  });

  it("completing twice queues one scan and changes nothing", async () => {
    const id = await addDocument(doctor, "photo_id");
    await service.completeUpload(doctor, id);
    await service.completeUpload(doctor, id);
    expect(jobs).toHaveLength(1);
  });

  it("a document that never arrived, the wrong size or the wrong content is refused and retired", async () => {
    const slot = await service.requestUpload(doctor, {
      docType: "photo",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    expect(await code(service.completeUpload(doctor, slot.documentId))).toBe("file_rejected");
    // An executable renamed as a PDF.
    expect(await code(addDocument(doctor, "photo", EXE))).toBe("file_rejected");
    // The declared size is not what arrived.
    const slot2 = await service.requestUpload(doctor, {
      docType: "photo",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    const key = new URL(slot2.upload.url).pathname.replace(/^\/vc-files\//, "");
    store.objects.set(`vc-files/${key}`, { head: PDF, size: 2000 });
    expect(await code(service.completeUpload(doctor, slot2.documentId))).toBe("file_rejected");
    expect(store.objects.size).toBe(0);
    expect(jobs).toHaveLength(0);
    // Retired records are not listed again.
    expect((await service.myApplication(doctor)).documents).toHaveLength(0);
  });

  it("refuses types and sizes the KYC policy does not allow, before any slot exists", async () => {
    expect(
      await code(
        service.requestUpload(doctor, {
          docType: "photo",
          contentType: "application/x-msdownload",
          sizeBytes: 100,
        }),
      ),
    ).toBe("file_rejected");
    expect(
      await code(
        service.requestUpload(doctor, {
          docType: "photo",
          contentType: "application/pdf",
          sizeBytes: 50 * 1024 * 1024,
        }),
      ),
    ).toBe("file_rejected");
    const { rows } = await q.query("SELECT count(*)::int AS n FROM files");
    expect(rows[0]?.n).toBe(0);
  });

  it("limits documents per type and overall", async () => {
    for (let i = 0; i < 3; i++) await addDocument(doctor, "degree_certificate");
    expect(await code(addDocument(doctor, "degree_certificate"))).toBe("conflict");
    for (const type of ["registration_certificate", "photo_id", "photo"]) {
      for (let i = 0; i < 2; i++) await addDocument(doctor, type);
    }
    // 3 + 6 = 9 so far; one more fits and then the overall cap of 10 is reached.
    await addDocument(doctor, "photo");
    expect(await code(addDocument(doctor, "photo_id"))).toBe("conflict");
  });

  it("another doctor cannot complete my upload, and applicant records have no owner", async () => {
    const slot = await service.requestUpload(doctor, {
      docType: "photo",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    const other = await person(["doctor"]);
    expect(await code(service.completeUpload(other, slot.documentId))).toBe("not_found");
    expect(await code(service.completeUpload(admin, slot.documentId))).toBe("not_found");
    expect(await code(service.completeUpload(doctor, uuidv7()))).toBe("not_found");
  });

  it("an upload slot needs an application first", async () => {
    const fresh = await person(["doctor"]);
    expect(
      await code(
        service.requestUpload(fresh, {
          docType: "photo",
          contentType: "application/pdf",
          sizeBytes: 100,
        }),
      ),
    ).toBe("conflict");
  });

  it("an infected file is deleted from storage, shown as refused, and never offered", async () => {
    const id = await addDocument(doctor, "photo_id");
    const { rows } = await q.query("SELECT storage_key FROM files");
    scanner.infected.add(String(rows[0]?.storage_key));
    await scanAll();
    expect(store.objects.size).toBe(0);
    expect((await service.myApplication(doctor)).documents[0]).toMatchObject({
      id,
      state: "rejected_virus",
    });
    expect(await code(service.downloadUrl(admin, id))).toBe("not_found");
    expect(await code(service.reviewDocument(admin, id, { decision: "approve" }))).toBe("conflict");
  });

  it("a scanner outage leaves the file inactive and throws so the queue retries; a later scan succeeds", async () => {
    const id = await addDocument(doctor, "photo_id");
    const { rows } = await q.query("SELECT id, storage_key FROM files");
    scanner.broken.add(String(rows[0]?.storage_key));
    await expect(service.scanFile(String(rows[0]?.id), scanner)).rejects.toThrow();
    expect((await service.myApplication(doctor)).documents[0]?.state).toBe("check_failed");
    expect(await code(service.reviewDocument(admin, id, { decision: "approve" }))).toBe("conflict");
    scanner.broken.clear();
    expect(await service.scanFile(String(rows[0]?.id), scanner)).toBe("clean");
    expect((await service.myApplication(doctor)).documents[0]?.state).toBe("waiting_for_review");
    // A repeat of the job is harmless.
    expect(await service.scanFile(String(rows[0]?.id), scanner)).toBe("skipped");
  });

  it("a file that was never uploaded is not scanned", async () => {
    const slot = await service.requestUpload(doctor, {
      docType: "photo",
      contentType: "application/pdf",
      sizeBytes: 1000,
    });
    expect(slot.documentId).toBeDefined();
    const { rows } = await q.query("SELECT id FROM files");
    expect(await service.scanFile(String(rows[0]?.id), scanner)).toBe("skipped");
  });
});

describe("review and decisions", () => {
  let docs: Record<string, string>;
  beforeEach(async () => {
    await service.saveApplication(doctor, application);
    docs = {
      registration_certificate: await addDocument(doctor, "registration_certificate"),
      photo_id: await addDocument(doctor, "photo_id"),
    };
    await scanAll();
  });
  const id = async () => (await service.myApplication(doctor)).id;

  it("approval needs every required document accepted first", async () => {
    expect(await code(service.decide(admin, await id(), { decision: "approve" }))).toBe("conflict");
    await service.reviewDocument(admin, docs.registration_certificate as string, {
      decision: "approve",
    });
    expect(await code(service.decide(admin, await id(), { decision: "approve" }))).toBe("conflict");
    await service.reviewDocument(admin, docs.photo_id as string, { decision: "approve" });
    const approved = await service.decide(admin, await id(), { decision: "approve" });
    expect(approved).toMatchObject({ kycStatus: "approved", status: "active" });
  });

  it("a refused document keeps its reason for the doctor, and a decided one cannot be decided again", async () => {
    const view = await service.reviewDocument(admin, docs.photo_id as string, {
      decision: "reject",
      note: "The photo is blurred.",
    });
    expect(view).toMatchObject({ state: "not_accepted", note: "The photo is blurred." });
    expect(
      await code(service.reviewDocument(admin, docs.photo_id as string, { decision: "approve" })),
    ).toBe("conflict");
    expect(
      (await service.myApplication(doctor)).documents.find((d) => d.id === docs.photo_id)?.note,
    ).toBe("The photo is blurred.");
  });

  it("rejection sends the doctor back to pending with the reason; saving again reopens it", async () => {
    const rejected = await service.decide(admin, await id(), {
      decision: "reject",
      note: "Registration number not found.",
    });
    expect(rejected).toMatchObject({
      kycStatus: "rejected",
      status: "pending",
      note: "Registration number not found.",
    });
    const again = await service.saveApplication(doctor, {
      ...application,
      registrationNo: "G-45013",
    });
    expect(again).toMatchObject({ kycStatus: "pending", note: null });
  });

  it("suspend and reinstate; an approved application cannot be edited", async () => {
    await service.reviewDocument(admin, docs.registration_certificate as string, {
      decision: "approve",
    });
    await service.reviewDocument(admin, docs.photo_id as string, { decision: "approve" });
    await service.decide(admin, await id(), { decision: "approve" });
    expect(await code(service.saveApplication(doctor, application))).toBe("conflict");
    expect(
      (
        await service.decide(admin, await id(), {
          decision: "suspend",
          note: "Complaint under review.",
        })
      ).status,
    ).toBe("suspended");
    expect(
      await code(service.decide(admin, await id(), { decision: "suspend", note: "again" })),
    ).toBe("conflict");
    expect(await service.decide(admin, await id(), { decision: "reinstate" })).toMatchObject({
      status: "active",
      note: null,
    });
  });

  it("only admins can review or decide; everyone else gets 404", async () => {
    const patient = await person(["patient"]);
    const support = await person(["support"]);
    for (const who of [doctor, patient, support]) {
      expect(
        await code(service.decide(who, await id(), { decision: "approve" })),
        who.roles.join(),
      ).toBe("not_found");
      expect(
        await code(service.reviewDocument(who, docs.photo_id as string, { decision: "approve" })),
      ).toBe("not_found");
      expect(await code(service.downloadUrl(who, docs.photo_id as string))).toBe("not_found");
      // The doctor may read their own application through the service; the admin route is role-gated.
      if (who !== doctor) expect(await code(service.detail(who, await id()))).toBe("not_found");
      expect(await code(service.list(who, { limit: 10 }))).toBe("not_found");
    }
    expect(await code(service.decide(admin, uuidv7(), { decision: "approve" }))).toBe("not_found");
  });

  it("nobody reviews or decides on their own application", async () => {
    const both = await person(["admin", "doctor"]);
    await service.saveApplication(both, { ...application, registrationNo: "G-777" });
    const mine = (await service.myApplication(both)).id;
    expect(await code(service.decide(both, mine, { decision: "approve" }))).toBe("forbidden");
  });

  it("an admin gets a short-lived link to a clean document only", async () => {
    const link = await service.downloadUrl(admin, docs.photo_id as string);
    expect(link.url).toContain("vc-files/kyc/");
    expect(new Date(link.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("the queue of applications", () => {
  it("pages through every doctor once, oldest first, and filters", async () => {
    for (let i = 0; i < 5; i++) {
      const d = await person(["doctor"]);
      await service.saveApplication(d, {
        ...application,
        registrationNo: `R-${i}00`,
        displayName: `Dr Number ${i}`,
      });
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await service.list(admin, { limit: 2, ...(cursor ? { cursor } : {}) });
      seen.push(...page.items.map((i) => i.registrationNo));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(seen).toEqual(["R-000", "R-100", "R-200", "R-300", "R-400"]);
    expect((await service.list(admin, { limit: 10, status: "active" })).items).toHaveLength(0);
    expect((await service.list(admin, { limit: 10, kycStatus: "pending" })).items).toHaveLength(5);
  });

  it("a forged cursor is refused, not trusted", async () => {
    for (const bad of [
      "x",
      Buffer.from("{}").toString("base64url"),
      Buffer.from(JSON.stringify({ t: "1'; DROP", i: "x" })).toString("base64url"),
    ]) {
      expect(await code(service.list(admin, { limit: 5, cursor: bad }))).toBe("validation_failed");
    }
  });

  it("only allow-listed filters are accepted", () => {
    expect(adminDoctorsQuery.safeParse({ sort: "fee" }).success).toBe(false);
    expect(adminDoctorsQuery.safeParse({ status: "everything" }).success).toBe(false);
    expect(adminDoctorsQuery.safeParse({ limit: "500" }).success).toBe(false);
  });
});

describe("decision rules", () => {
  it("every move in the table", () => {
    const pending = { kycStatus: "pending", status: "pending" };
    const approved = { kycStatus: "approved", status: "active" };
    const suspended = { kycStatus: "approved", status: "suspended" };
    const rejected = { kycStatus: "rejected", status: "pending" };
    expect(nextState(pending, "approve")).toEqual(approved);
    expect(nextState(pending, "reject")).toEqual(rejected);
    expect(nextState(pending, "suspend")).toBeNull();
    expect(nextState(pending, "reinstate")).toBeNull();
    expect(nextState(approved, "approve")).toBeNull();
    expect(nextState(approved, "reject")).toBeNull();
    expect(nextState(approved, "suspend")).toEqual(suspended);
    expect(nextState(suspended, "reinstate")).toEqual(approved);
    expect(nextState(suspended, "approve")).toBeNull();
    expect(nextState(rejected, "approve")).toBeNull();
    expect(nextState(rejected, "reinstate")).toBeNull();
  });

  it("a reason is required for everything but approve and reinstate", () => {
    expect(doctorDecisionBody.safeParse({ decision: "reject" }).success).toBe(false);
    expect(doctorDecisionBody.safeParse({ decision: "suspend" }).success).toBe(false);
    expect(doctorDecisionBody.safeParse({ decision: "approve" }).success).toBe(true);
    expect(reviewDocumentBody.safeParse({ decision: "reject" }).success).toBe(false);
    expect(reviewDocumentBody.safeParse({ decision: "approve" }).success).toBe(true);
  });
});
