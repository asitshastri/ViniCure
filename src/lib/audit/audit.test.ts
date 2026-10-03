import { beforeEach, describe, expect, it } from "vitest";
import { configureApi, resetApiConfig } from "../api/deps";
import { clearRoutesForTest } from "../api/registry";
import type { Actor } from "../api/types";
import { withApi } from "../api/with-api";
import {
  AuditService,
  AuditValidationError,
  MemoryAuditStore,
  validateMetadata,
  type AuditStore,
} from "./audit";

const U1 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const U2 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";
const P1 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5d";
const R1 = "0190a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5e";

const make = () => {
  const store = new MemoryAuditStore();
  return {
    store,
    service: new AuditService(store, undefined, () => new Date("2026-10-03T00:00:00Z")),
  };
};

describe("append-only", () => {
  it("the store interface offers no way to update or delete", () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(new MemoryAuditStore()));
    expect(methods.sort()).toEqual(["append", "appendPhi", "constructor"]);
  });

  it("stored entries cannot be changed afterwards", async () => {
    const { store, service } = make();
    await service.record({ actorUserId: U1, action: "refund.create", entityType: "payment" });
    const entry = store.audit[0] as { action: string };
    expect(() => {
      entry.action = "tampered";
    }).toThrow();
  });
});

describe("audit entries", () => {
  it("records actor, action, entity, time and safe metadata", async () => {
    const { store, service } = make();
    await service.record({
      actorUserId: U1,
      action: "doctor.approve",
      entityType: "doctor",
      entityId: U2,
      ip: "203.0.113.5",
      userAgent: "x".repeat(500),
      metadata: {
        changed_fields: ["status", "approved_at"],
        previous_status: "pending",
        count: 2,
        flag: true,
      },
    });
    expect(store.audit[0]).toMatchObject({
      actorUserId: U1,
      action: "doctor.approve",
      entityType: "doctor",
      entityId: U2,
      occurredAt: new Date("2026-10-03T00:00:00Z"),
    });
    expect(store.audit[0]?.userAgent).toHaveLength(200);
  });

  it.each([
    ["no verb", { action: "refund" }],
    ["upper case", { action: "Refund.Create" }],
    ["bad entity", { entityType: "Payment Row" }],
    ["entity id that is not a UUID", { entityId: "42" }],
    ["actor that is not a UUID", { actorUserId: "admin" }],
  ])("rejects %s", async (_label, patch) => {
    const { service } = make();
    await expect(
      service.record({ actorUserId: U1, action: "refund.create", entityType: "payment", ...patch }),
    ).rejects.toBeInstanceOf(AuditValidationError);
  });
});

describe("metadata must not carry content", () => {
  it.each([
    "diagnosis",
    "clinical_note",
    "prescription_text",
    "symptoms",
    "reason",
    "comment",
    "message_body",
    "phone",
    "email",
    "patient_name",
    "address",
    "otp",
    "access_token",
    "notes_enc",
    "medication",
    "advice",
  ])("refuses the key %s", (key) => {
    expect(() => validateMetadata({ [key]: "x" })).toThrow(AuditValidationError);
  });

  it("refuses values that look like a phone number or email, long text and objects", () => {
    expect(() => validateMetadata({ target: "+91 98123 45678" })).toThrow(AuditValidationError);
    expect(() => validateMetadata({ target: "asha@example.com" })).toThrow(AuditValidationError);
    expect(() => validateMetadata({ target: "x".repeat(81) })).toThrow(AuditValidationError);
    expect(() => validateMetadata({ target: { a: 1 } as never })).toThrow(AuditValidationError);
    expect(() => validateMetadata({ BadKey: "x" })).toThrow(AuditValidationError);
  });

  it("accepts IDs, field names, counts and flags", () => {
    expect(() =>
      validateMetadata({
        changed_fields: ["status"],
        amount_paise: 49900,
        refund_id: R1,
        forced: false,
      }),
    ).not.toThrow();
  });
});

describe("PHI access log", () => {
  it("records who read which patient's data, and why", async () => {
    const { store, service } = make();
    await service.recordPhiAccess({
      actorUserId: U1,
      patientId: P1,
      resourceType: "prescription",
      resourceId: R1,
      purpose: "treatment",
    });
    expect(store.phi[0]).toMatchObject({
      patientId: P1,
      purpose: "treatment",
      resourceType: "prescription",
    });
  });

  it("rejects an unknown purpose, resource type or non-UUID id", async () => {
    const { service } = make();
    const base = {
      actorUserId: U1,
      patientId: P1,
      resourceType: "prescription",
      resourceId: R1,
      purpose: "treatment",
    } as const;
    await expect(
      service.recordPhiAccess({ ...base, purpose: "curiosity" as never }),
    ).rejects.toThrow();
    await expect(
      service.recordPhiAccess({ ...base, resourceType: "gossip" as never }),
    ).rejects.toThrow();
    await expect(service.recordPhiAccess({ ...base, patientId: "7" })).rejects.toThrow();
  });
});

describe("withApi integration", () => {
  const actor: Actor = { userId: U1, roles: ["admin"], sessionId: "s" };

  beforeEach(() => {
    clearRoutesForTest();
    resetApiConfig();
  });

  it("writes an audit entry after a successful audited request", async () => {
    const { store, service } = make();
    configureApi({ production: false, authenticate: async () => actor, audit: service.writer });
    const route = withApi(
      {
        method: "POST",
        path: "/api/v1/admin/x",
        auth: "session",
        rateLimit: "admin",
        audit: { action: "doctor.approve", entity: "doctor" },
      },
      () => ({}),
    );
    const res = await route(new Request("http://x.test/api/v1/admin/x", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(store.audit).toHaveLength(1);
    expect(store.audit[0]).toMatchObject({
      actorUserId: U1,
      action: "doctor.approve",
      entityType: "doctor",
    });
    expect(store.audit[0]?.metadata).toMatchObject({ route: "/api/v1/admin/x", status: 200 });
  });

  it("fails the request when the audit write fails, so nothing succeeds unrecorded", async () => {
    const broken: AuditStore = {
      append: async () => {
        throw new Error("db down");
      },
      appendPhi: async () => {},
    };
    configureApi({
      production: false,
      authenticate: async () => actor,
      audit: new AuditService(broken).writer,
    });
    const route = withApi(
      {
        method: "POST",
        path: "/api/v1/admin/y",
        auth: "session",
        rateLimit: "admin",
        audit: { action: "doctor.approve", entity: "doctor" },
      },
      () => ({}),
    );
    const res = await route(new Request("http://x.test/api/v1/admin/y", { method: "POST" }));
    expect(res.status).toBe(500);
  });
});
