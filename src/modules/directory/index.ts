import { getDatabase, queryable } from "../../lib/db/pool";
import { getQueue } from "../../lib/queue/producer";
import { globalSingleton } from "../../lib/singleton";
import { getStorage } from "../../lib/storage";
import { DirectoryRepo } from "./repo";
import { DirectoryService } from "./service";

export * from "./schemas";
export { DirectoryService } from "./service";

const holder = globalSingleton("directory", () => ({
  service: undefined as DirectoryService | undefined,
}));

export function getDirectory(): DirectoryService {
  holder.service ??= new DirectoryService({
    repo: new DirectoryRepo(queryable(getDatabase())),
    storage: getStorage,
    queue: getQueue,
  });
  return holder.service;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setDirectoryForTest(service: DirectoryService | undefined): void {
  holder.service = service;
}
