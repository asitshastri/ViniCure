import { errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import { assertAllowed, can, type Principal } from "../identity/policy";
import type { PatientRepo, PatientRow } from "./repo";
import {
  MAX_PROFILES_PER_ACCOUNT,
  type CreatePatient,
  type PatientView,
  type UpdatePatient,
} from "./schemas";

// Patient profiles for the signed-in account (P2-09). Access goes through the policy module:
// a profile that is not yours is a 404, the same as one that does not exist.

export function toView(row: PatientRow): PatientView {
  return {
    id: row.id,
    relation: row.relation as PatientView["relation"],
    fullName: row.fullName,
    dob: row.dob,
    gender: row.gender as PatientView["gender"],
    addressLine: row.addressLine,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    bloodGroup: row.bloodGroup as PatientView["bloodGroup"],
    isMinor: row.isMinor,
    createdAt: row.createdAt.toISOString(),
  };
}

function uniqueProblem(error: unknown): never {
  const e = error as { code?: string; constraint?: string };
  if (e.code === "23505") {
    if (e.constraint === "patients_one_self_idx") {
      throw errors.conflict({ detail: "You already have a profile for yourself." });
    }
    throw errors.conflict({ detail: "This person is already on your account." });
  }
  throw error;
}

export class PatientService {
  constructor(private readonly repo: PatientRepo) {}

  async list(principal: Principal): Promise<PatientView[]> {
    // The account's own profiles only; the cap keeps the list short, so there is no cursor.
    return (await this.repo.listForAccount(principal.userId)).map(toView);
  }

  /** Loads a profile and checks the caller may do `action` on it. 404 for anyone else's. */
  private async authorised(
    principal: Principal,
    id: string,
    action: "read" | "write" | "delete",
  ): Promise<PatientRow> {
    const row = await this.repo.findById(id);
    if (!row) throw errors.notFound();
    assertAllowed(can.patientProfile[action](principal, { ownerUserId: row.accountUserId }));
    return row;
  }

  async get(principal: Principal, id: string): Promise<PatientView> {
    return toView(await this.authorised(principal, id, "read"));
  }

  async create(principal: Principal, data: CreatePatient): Promise<PatientView> {
    let row: PatientRow | null;
    try {
      row = await this.repo.create({ id: uuidv7(), accountUserId: principal.userId, data });
    } catch (error) {
      return uniqueProblem(error);
    }
    if (!row) {
      throw errors.conflict({
        detail: `An account can hold ${MAX_PROFILES_PER_ACCOUNT} profiles. Remove one first.`,
      });
    }
    return toView(row);
  }

  async update(principal: Principal, id: string, data: UpdatePatient): Promise<PatientView> {
    const current = await this.authorised(principal, id, "write");
    let row: PatientRow | null;
    try {
      row = await this.repo.update(id, current.accountUserId, data);
    } catch (error) {
      return uniqueProblem(error);
    }
    if (!row) throw errors.notFound();
    return toView(row);
  }

  async remove(principal: Principal, id: string): Promise<void> {
    const current = await this.authorised(principal, id, "delete");
    // The "self" profile goes with the account (deletion request, P2-11), not on its own.
    if (current.relation === "self") {
      throw errors.conflict({ detail: "Your own profile is removed by deleting your account." });
    }
    if (!(await this.repo.softDelete(id, current.accountUserId))) throw errors.notFound();
  }
}
