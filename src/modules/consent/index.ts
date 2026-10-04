import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { ConsentRepo } from "./repo";
import { ConsentService } from "./service";

export * from "./schemas";
export { ConsentService } from "./service";

const holder = globalSingleton("consent", () => ({
  service: undefined as ConsentService | undefined,
}));

export function getConsent(): ConsentService {
  holder.service ??= new ConsentService({ repo: new ConsentRepo(queryable(getDatabase())) });
  return holder.service;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setConsentForTest(service: ConsentService | undefined): void {
  holder.service = service;
}
