import { z } from "zod";
import { getCache } from "../../lib/cache";
import { getConfig } from "../../lib/config/config";
import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { SchedulingRepo } from "./repo";
import { SlotService } from "./service";

export { SlotService } from "./service";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD.");
export const slotsQuery = z.object({ from: date.optional(), to: date.optional() }).strict();

const holder = globalSingleton("scheduling", () => ({
  slots: undefined as SlotService | undefined,
}));

export function getSlots(): SlotService {
  holder.slots ??= new SlotService({
    repo: new SchedulingRepo(queryable(getDatabase())),
    cache: getCache,
    env: getConfig().NODE_ENV,
  });
  return holder.slots;
}

/** Replaces the service (tests). Pass undefined to reset. */
export function setSlotsForTest(service: SlotService | undefined): void {
  holder.slots = service;
}
