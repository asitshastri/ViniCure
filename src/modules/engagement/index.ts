import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { DirectoryRepo } from "../directory/repo";
import { PatientRepo } from "../patients/repo";
import { EngagementRepo } from "./repo";
import { EngagementService } from "./service";

export * from "./schemas";
export { EngagementService } from "./service";

const holder = globalSingleton("engagement", () => ({
  service: undefined as EngagementService | undefined,
}));

export function getEngagement(): EngagementService {
  const db = queryable(getDatabase());
  holder.service ??= new EngagementService({
    repo: new EngagementRepo(db),
    directory: new DirectoryRepo(db),
    patients: new PatientRepo(db),
  });
  return holder.service;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setEngagementForTest(service: EngagementService | undefined): void {
  holder.service = service;
}
