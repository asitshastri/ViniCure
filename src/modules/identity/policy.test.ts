import { describe, expect, it } from "vitest";
import { AppError } from "../../lib/errors/app-error";
import {
  MATRIX,
  assertAllowed,
  can,
  decide,
  relationsOf,
  type Facts,
  type Principal,
  type Resource,
} from "./policy";

const OWNER = "owner-1";
const facts = (extra: Partial<Facts> = {}): Facts => ({ ownerUserId: OWNER, ...extra });

const who = {
  owner: { userId: OWNER, roles: ["patient"] } as Principal,
  otherPatient: { userId: "p2", roles: ["patient"] } as Principal,
  assignedDoctor: { userId: "d1", roles: ["doctor"] } as Principal,
  otherDoctor: { userId: "d2", roles: ["doctor"] } as Principal,
  admin: { userId: "a1", roles: ["admin"] } as Principal,
  superAdmin: { userId: "a2", roles: ["super_admin"] } as Principal,
  support: { userId: "s1", roles: ["support"] } as Principal,
};

// Facts per principal, as the caller would load them.
function factsFor(name: keyof typeof who, extra: Partial<Facts> = {}): Facts {
  return facts({ assigned: name === "assignedDoctor", ...extra });
}

const ALL_ACTIONS = (resource: Resource): string[] => {
  const entry = MATRIX[resource] as Record<string, unknown>;
  const out = new Set<string>();
  for (const key of ["owner", "assignedDoctor", "admin", "support", "supportBreakGlass"]) {
    for (const action of (entry[key] as readonly string[] | undefined) ?? []) out.add(action);
  }
  return [...out];
};

// The expected matrix, written out independently of the implementation:
// resource -> action -> principals who may do it (break-glass handled separately).
const EXPECT: Record<Resource, Record<string, (keyof typeof who)[]>> = {
  patientProfile: {
    read: ["owner", "assignedDoctor"],
    write: ["owner"],
    delete: ["owner"],
    readBasic: ["admin", "superAdmin"],
  },
  appointment: {
    read: ["owner", "assignedDoctor", "admin", "superAdmin", "support"],
    cancel: ["owner", "assignedDoctor", "admin", "superAdmin"],
    reschedule: ["owner"],
    review: ["owner"],
    updateStatus: ["assignedDoctor"],
  },
  consultation: { join: ["assignedDoctor"] }, // owner needs paid and in window: tested below
  clinicalNote: { read: ["assignedDoctor"], write: ["assignedDoctor"] },
  prescription: { read: ["owner", "assignedDoctor"], write: ["assignedDoctor"] },
  healthRecord: { read: ["owner", "assignedDoctor"], write: ["owner", "assignedDoctor"] },
  document: { read: ["owner", "assignedDoctor"], write: ["owner"] },
  payment: {
    read: ["owner", "admin", "superAdmin", "support"],
    pay: ["owner"],
    readEarnings: ["assignedDoctor"],
    refund: ["admin", "superAdmin"],
  },
  payout: {
    read: ["admin", "superAdmin"],
    create: ["admin", "superAdmin"],
    settle: ["admin", "superAdmin"],
  },
  // The owner column is empty here because the test's owner is a patient; a doctor owner is tested in the directory service tests.
  doctorProfile: { read: ["admin", "superAdmin"], write: [], review: ["admin", "superAdmin"] },
  // The test's owner is a patient, so the doctor-owned schedule has no allowed principal here.
  doctorSchedule: { read: [], write: [] },
  review: { read: ["admin", "superAdmin"], moderate: ["admin", "superAdmin"] },
  kycDocument: { upload: [], read: ["admin", "superAdmin"], review: ["admin", "superAdmin"] },
  auditLog: { read: ["admin", "superAdmin", "support"] },
  phiAccessLog: { read: ["admin", "superAdmin", "support"] },
};

describe("every cell of the matrix, without break-glass", () => {
  for (const resource of Object.keys(MATRIX) as Resource[]) {
    for (const action of ALL_ACTIONS(resource)) {
      it(`${resource}.${action}`, () => {
        const allowed = EXPECT[resource][action];
        expect(allowed, `matrix test is missing ${resource}.${action}`).toBeDefined();
        for (const name of Object.keys(who) as (keyof typeof who)[]) {
          const decision = decide(resource, action, who[name], factsFor(name));
          expect(decision.allow, `${name} ${resource}.${action}`).toBe(
            (allowed ?? []).includes(name),
          );
          if (!decision.allow) {
            // The owner is told why a join is not open yet (tested below); everyone else gets 404.
            const ownerJoin = resource === "consultation" && name === "owner";
            expect(decision.status).toBe(ownerJoin ? "forbidden" : "not_found");
          }
        }
      });
    }
  }

  it("the test lists no action the matrix lacks", () => {
    for (const resource of Object.keys(EXPECT) as Resource[]) {
      expect(Object.keys(EXPECT[resource]).sort()).toEqual(ALL_ACTIONS(resource).sort());
    }
  });
});

describe("break-glass (support only, clinical data)", () => {
  const clinical: [Resource, string][] = [
    ["patientProfile", "read"],
    ["clinicalNote", "read"],
    ["prescription", "read"],
    ["healthRecord", "read"],
    ["document", "read"],
  ];
  for (const [resource, action] of clinical) {
    it(`${resource}.${action}: support needs an active grant`, () => {
      const without = decide(resource, action, who.support, factsFor("support"));
      expect(without).toEqual({
        allow: false,
        status: "not_found",
        reason: "break_glass_required",
      });
      const withGrant = decide(
        resource,
        action,
        who.support,
        factsFor("support", { breakGlassActive: true }),
      );
      expect(withGrant.allow).toBe(true);
    });
    it(`${resource}.${action}: a grant does not help anyone else`, () => {
      for (const name of ["otherPatient", "otherDoctor", "admin", "superAdmin"] as const) {
        expect(
          decide(resource, action, who[name], factsFor(name, { breakGlassActive: true })).allow,
          name,
        ).toBe(false);
      }
    });
  }

  it("break-glass is read-only: support cannot write clinical data", () => {
    for (const [resource, action] of [
      ["clinicalNote", "write"],
      ["prescription", "write"],
      ["healthRecord", "write"],
      ["document", "write"],
      ["patientProfile", "write"],
    ] as [Resource, string][]) {
      expect(
        decide(resource, action, who.support, factsFor("support", { breakGlassActive: true }))
          .allow,
      ).toBe(false);
    }
  });
});

describe("join consultation", () => {
  const joinFacts = (extra: Partial<Facts>) => facts(extra);
  it("the patient joins only when paid and inside the window", () => {
    expect(can.consultation.join(who.owner, joinFacts({ paid: true, inWindow: true })).allow).toBe(
      true,
    );
    expect(
      can.consultation.join(who.owner, joinFacts({ paid: false, inWindow: true })),
    ).toMatchObject({
      allow: false,
      status: "forbidden",
      reason: "payment_required",
    });
    expect(
      can.consultation.join(who.owner, joinFacts({ paid: true, inWindow: false })),
    ).toMatchObject({
      allow: false,
      status: "forbidden",
      reason: "outside_window",
    });
  });
  it("another patient, another doctor, admin and support never join", () => {
    for (const name of ["otherPatient", "otherDoctor", "admin", "superAdmin", "support"] as const) {
      const d = can.consultation.join(
        who[name],
        factsFor(name, { paid: true, inWindow: true, breakGlassActive: true }),
      );
      expect(d, name).toMatchObject({ allow: false, status: "not_found" });
    }
  });
  it("the assigned doctor joins; an unassigned doctor does not", () => {
    expect(can.consultation.join(who.assignedDoctor, facts({ assigned: true })).allow).toBe(true);
    expect(can.consultation.join(who.otherDoctor, facts({ assigned: false })).allow).toBe(false);
  });
});

describe("KYC documents belong to doctors", () => {
  it("a doctor uploads their own file, nobody else's, and a patient never uploads", () => {
    const doctor: Principal = { userId: "d9", roles: ["doctor"] };
    expect(can.kycDocument.upload(doctor, { ownerUserId: "d9" }).allow).toBe(true);
    expect(can.kycDocument.upload(doctor, { ownerUserId: "d8" }).allow).toBe(false);
    expect(
      can.kycDocument.upload({ userId: "d9", roles: ["patient"] }, { ownerUserId: "d9" }).allow,
    ).toBe(false);
  });
  it("a doctor cannot read or review KYC files, even their own", () => {
    const doctor: Principal = { userId: "d9", roles: ["doctor"] };
    expect(can.kycDocument.read(doctor, { ownerUserId: "d9" }).allow).toBe(false);
    expect(can.kycDocument.review(doctor, { ownerUserId: "d9" }).allow).toBe(false);
  });
});

describe("PHI access logging hints", () => {
  it("names the purpose for clinical reads", () => {
    expect(can.prescription.read(who.owner, facts())).toMatchObject({ phiPurpose: "patient_self" });
    expect(can.prescription.read(who.assignedDoctor, factsFor("assignedDoctor"))).toMatchObject({
      phiPurpose: "treatment",
    });
    expect(
      can.prescription.read(who.support, factsFor("support", { breakGlassActive: true })),
    ).toMatchObject({
      phiPurpose: "support_break_glass",
    });
  });
  it("names no purpose for writes or for business data", () => {
    const write = can.prescription.write(who.assignedDoctor, factsFor("assignedDoctor"));
    expect(write.allow && write.phiPurpose).toBeFalsy();
    const pay = can.payment.read(who.owner, facts());
    expect(pay.allow && pay.phiPurpose).toBeFalsy();
  });
});

describe("relations and edge cases", () => {
  it("a person with no roles and no ownership has no rights", () => {
    const nobody: Principal = { userId: "x", roles: [] };
    for (const resource of Object.keys(MATRIX) as Resource[]) {
      for (const action of ALL_ACTIONS(resource)) {
        expect(decide(resource, action, nobody, facts()).allow, `${resource}.${action}`).toBe(
          false,
        );
      }
    }
  });
  it("a doctor who is also the patient's owner gets the owner rights", () => {
    const both: Principal = { userId: OWNER, roles: ["doctor", "patient"] };
    expect(can.prescription.read(both, facts({ assigned: false })).allow).toBe(true);
    expect(can.prescription.write(both, facts({ assigned: false })).allow).toBe(false);
  });
  it("relationsOf reports every link", () => {
    expect(relationsOf(who.superAdmin, facts())).toEqual(["admin"]);
    expect(relationsOf(who.otherDoctor, facts())).toEqual(["otherDoctor"]);
    expect(relationsOf(who.assignedDoctor, facts({ assigned: true }))).toEqual(["assignedDoctor"]);
  });
  it("a facts flag set to a truthy non-boolean does not grant anything", () => {
    const sneaky = facts({
      assigned: "yes" as unknown as boolean,
      breakGlassActive: 1 as unknown as boolean,
    });
    expect(can.clinicalNote.read(who.otherDoctor, sneaky).allow).toBe(false);
    expect(can.clinicalNote.read(who.support, sneaky).allow).toBe(false);
  });
});

describe("limited sessions (D-019)", () => {
  it("a limited principal is refused every cell of the matrix, owner included", () => {
    for (const resource of Object.keys(MATRIX) as Resource[]) {
      for (const action of ALL_ACTIONS(resource)) {
        for (const name of Object.keys(who) as (keyof typeof who)[]) {
          const decision = decide(
            resource,
            action,
            { ...who[name], limited: true },
            factsFor(name, { paid: true, inWindow: true, breakGlassActive: true }),
          );
          expect(decision, `${name} ${resource}.${action}`).toMatchObject({
            allow: false,
            status: "forbidden",
            reason: "step_up_required",
          });
        }
      }
    }
  });

  it("the same owner is allowed again once the session is unlocked", () => {
    expect(can.prescription.read({ ...who.owner, limited: false }, facts()).allow).toBe(true);
  });

  it("assertAllowed turns it into the step_up_required error", () => {
    const attempt = () =>
      assertAllowed(can.prescription.read({ ...who.owner, limited: true }, facts()));
    expect(attempt).toThrowError(expect.objectContaining({ code: "step_up_required" }));
  });
});

describe("assertAllowed", () => {
  it("returns an allowed decision, hides objects with 404, explains join refusals", () => {
    expect(assertAllowed(can.prescription.read(who.owner, facts())).allow).toBe(true);
    const hidden = (() => {
      try {
        assertAllowed(can.prescription.read(who.otherPatient, facts()));
      } catch (e) {
        return e as AppError;
      }
    })();
    expect(hidden?.code).toBe("not_found");
    const window = (() => {
      try {
        assertAllowed(can.consultation.join(who.owner, facts({ paid: true, inWindow: false })));
      } catch (e) {
        return e as AppError;
      }
    })();
    expect(window?.code).toBe("outside_join_window");
    const unpaid = (() => {
      try {
        assertAllowed(can.consultation.join(who.owner, facts({ paid: false, inWindow: true })));
      } catch (e) {
        return e as AppError;
      }
    })();
    expect(unpaid?.code).toBe("forbidden");
  });
});
