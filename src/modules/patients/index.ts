import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { PatientRepo } from "./repo";
import { PatientService } from "./service";

export * from "./schemas";
export { PatientService } from "./service";

const holder = globalSingleton("patients", () => ({
  service: undefined as PatientService | undefined,
}));

export function getPatients(): PatientService {
  holder.service ??= new PatientService(new PatientRepo(queryable(getDatabase())));
  return holder.service;
}
