import type { Role } from "../../lib/api/types";
import { AppError, errors } from "../../lib/errors/app-error";

// Authorization policies (backend-architecture.md section 4). Authentication says who you are;
// these pure functions say what you may touch. They take facts that the caller has already
// read from the database (who owns the object, whether this doctor is assigned, whether the
// payment cleared) and return a decision. They never read the database themselves, so every
// cell of the matrix can be tested without one.
//
// How a caller relates to an object:
//   owner           the person the object belongs to (the patient, or the doctor for KYC files)
//   assignedDoctor  a doctor with an appointment with that patient in a status that allows access
//   otherDoctor     any other doctor: no access
//   admin           admin and super_admin: business data only, never clinical content
//   support         read-only on business data; clinical data only through break-glass
//
// A denied caller gets "not_found" for objects they do not own (the 404 rule), so IDs cannot be
// probed. The only "forbidden" answers are for an owner who is told why a step is not open yet
// (payment missing, outside the join window).

export type Relation = "owner" | "assignedDoctor" | "otherDoctor" | "admin" | "support";

export type Principal = {
  userId: string;
  roles: readonly Role[];
  /**
   * The session is limited (a risky phone sign-in whose second method is not proven yet,
   * D-019). A limited principal can reach nothing the matrix guards, whoever owns it.
   */
  limited?: boolean;
};

/** What the caller read from the database about this object and this principal. */
export type Facts = {
  /** The user the object belongs to (the patient's account, or the doctor for a KYC file). */
  ownerUserId: string;
  /** True when this principal is a doctor assigned to the patient (see section 4). */
  assigned?: boolean;
  /** True when this principal holds a break-glass grant for this patient that has not expired. */
  breakGlassActive?: boolean;
  /** Join only: the consultation fee is paid. */
  paid?: boolean;
  /** Join only: now is inside the join window. */
  inWindow?: boolean;
};

export type PhiPurpose = "patient_self" | "treatment" | "support_break_glass";

export type DenyReason =
  | "no_relation"
  | "not_permitted"
  | "break_glass_required"
  | "step_up_required"
  | "payment_required"
  | "outside_window";

export type Decision =
  | {
      allow: true;
      relation: Relation;
      /** Set when the read must be written to the PHI access log, with this purpose. */
      phiPurpose?: PhiPurpose;
    }
  | { allow: false; status: "not_found" | "forbidden"; reason: DenyReason };

type Rights = {
  owner?: readonly string[];
  assignedDoctor?: readonly string[];
  admin?: readonly string[];
  support?: readonly string[];
  /** Support may do these only with an active break-glass grant. */
  supportBreakGlass?: readonly string[];
  /** The owner relation only counts for these roles (KYC files belong to doctors). */
  ownerRoles?: readonly Role[];
  /** Reads of this resource are PHI and must be logged. */
  phi?: boolean;
};

// The matrix. One entry per row of the table in the design document.
export const MATRIX = {
  patientProfile: {
    owner: ["read", "write", "delete"],
    assignedDoctor: ["read"],
    admin: ["readBasic"],
    supportBreakGlass: ["read"],
  },
  appointment: {
    owner: ["read", "cancel", "reschedule", "review"],
    assignedDoctor: ["read", "updateStatus", "cancel"],
    admin: ["read", "cancel"],
    support: ["read"],
  },
  consultation: {
    // Recording (P6-08): each of the two people agrees or withdraws for themselves; only the
    // doctor starts and stops it.
    owner: ["join", "recordingConsent"],
    // Only the assigned doctor ends a consultation (for everyone).
    assignedDoctor: ["join", "end", "recordingConsent", "recordingControl"],
  },
  clinicalNote: {
    assignedDoctor: ["read", "write"],
    supportBreakGlass: ["read"],
    phi: true,
  },
  prescription: {
    owner: ["read"],
    assignedDoctor: ["read", "write"],
    supportBreakGlass: ["read"],
    phi: true,
  },
  healthRecord: {
    // Vitals and conditions.
    owner: ["read", "write"],
    assignedDoctor: ["read", "write"],
    supportBreakGlass: ["read"],
    phi: true,
  },
  document: {
    owner: ["read", "write"],
    assignedDoctor: ["read"],
    supportBreakGlass: ["read"],
    phi: true,
  },
  payment: {
    owner: ["read", "pay"],
    assignedDoctor: ["readEarnings"],
    admin: ["read", "refund"],
    support: ["read"],
  },
  referral: {
    // A patient's own referral code, and entering someone else's.
    owner: ["read", "redeem"],
    ownerRoles: ["patient"],
  },
  payout: {
    // Paying doctors what the ledger owes them (manual settlement from a CSV).
    admin: ["read", "create", "settle"],
  },
  doctorProfile: {
    // The doctor's own application; admins review it (approve, reject, suspend, reinstate).
    owner: ["read", "write"],
    ownerRoles: ["doctor"],
    admin: ["read", "review"],
  },
  doctorSchedule: {
    // A doctor's own working hours and time off.
    owner: ["read", "write"],
    ownerRoles: ["doctor"],
  },
  review: {
    // Moderation of patient reviews before they are public.
    admin: ["read", "moderate"],
  },
  kycDocument: {
    owner: ["upload"],
    ownerRoles: ["doctor"],
    admin: ["read", "review"],
  },
  auditLog: { admin: ["read"], support: ["read"] },
  phiAccessLog: { admin: ["read"], support: ["read"] },
} as const satisfies Record<string, Rights>;

export type Resource = keyof typeof MATRIX;
type ActionsOf<R extends Resource> = (typeof MATRIX)[R] extends infer Entry
  ? Entry[Extract<
      keyof Entry,
      "owner" | "assignedDoctor" | "admin" | "support" | "supportBreakGlass"
    >] extends infer List
    ? List extends readonly (infer A)[]
      ? A
      : never
    : never
  : never;
export type Action<R extends Resource> = ActionsOf<R>;

const ADMIN_ROLES: readonly Role[] = ["admin", "super_admin"];

/** Every way the principal is connected to this object. A person can be several at once. */
export function relationsOf(
  principal: Principal,
  facts: Facts,
  ownerRoles?: readonly Role[],
): Relation[] {
  const out: Relation[] = [];
  const isOwner =
    principal.userId === facts.ownerUserId &&
    (!ownerRoles || principal.roles.some((role) => ownerRoles.includes(role)));
  if (isOwner) out.push("owner");
  if (principal.roles.includes("doctor")) {
    out.push(facts.assigned === true ? "assignedDoctor" : "otherDoctor");
  }
  if (principal.roles.some((role) => ADMIN_ROLES.includes(role))) out.push("admin");
  if (principal.roles.includes("support")) out.push("support");
  return out;
}

const deny = (reason: DenyReason, status: "not_found" | "forbidden" = "not_found"): Decision => ({
  allow: false,
  status,
  reason,
});

/** The one place a rule is applied. The typed `can.*` functions below call this. */
export function decide(
  resource: Resource,
  action: string,
  principal: Principal,
  facts: Facts,
): Decision {
  // A limited session reaches nothing stored about the patient: the second method comes first.
  if (principal.limited === true) return deny("step_up_required", "forbidden");
  const rights: Rights = MATRIX[resource];
  const relations = relationsOf(principal, facts, rights.ownerRoles);
  let reason: DenyReason = relations.length === 0 ? "no_relation" : "not_permitted";

  for (const relation of relations) {
    if (relation === "otherDoctor") continue;
    const granted = rights[relation]?.includes(action) ?? false;
    const phiPurpose: PhiPurpose | undefined =
      rights.phi && action === "read"
        ? relation === "owner"
          ? "patient_self"
          : "treatment"
        : undefined;

    if (granted) {
      // Join has conditions that the owner is told about, because the answer is useful.
      if (resource === "consultation" && relation === "owner" && action === "join") {
        if (facts.paid !== true) return deny("payment_required", "forbidden");
        if (facts.inWindow !== true) return deny("outside_window", "forbidden");
      }
      return { allow: true, relation, ...(phiPurpose ? { phiPurpose } : {}) };
    }

    if (relation === "support" && rights.supportBreakGlass?.includes(action)) {
      if (facts.breakGlassActive === true) {
        return {
          allow: true,
          relation,
          ...(rights.phi && action === "read"
            ? { phiPurpose: "support_break_glass" as const }
            : {}),
        };
      }
      reason = "break_glass_required";
    }
  }
  return deny(reason);
}

type Can = {
  [R in Resource]: { [A in Action<R>]: (principal: Principal, facts: Facts) => Decision };
};

const actionsOf = (rights: Rights): string[] => [
  ...new Set([
    ...(rights.owner ?? []),
    ...(rights.assignedDoctor ?? []),
    ...(rights.admin ?? []),
    ...(rights.support ?? []),
    ...(rights.supportBreakGlass ?? []),
  ]),
];

/** `can.prescription.read(principal, facts)`: a decision for every resource and action in the matrix. */
export const can = Object.fromEntries(
  (Object.keys(MATRIX) as Resource[]).map((resource) => [
    resource,
    Object.fromEntries(
      actionsOf(MATRIX[resource]).map((action) => [
        action,
        (principal: Principal, facts: Facts) => decide(resource, action, principal, facts),
      ]),
    ),
  ]),
) as unknown as Can;

/** Turns a refusal into the error the API returns; returns the decision when allowed. */
export function assertAllowed(decision: Decision): Extract<Decision, { allow: true }> {
  if (decision.allow) return decision;
  if (decision.status === "not_found") throw errors.notFound();
  if (decision.reason === "step_up_required") throw new AppError("step_up_required");
  if (decision.reason === "outside_window") throw new AppError("outside_join_window");
  throw errors.forbidden({ detail: "Payment is needed before you can join." });
}
