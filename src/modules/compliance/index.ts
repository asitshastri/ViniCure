import { z } from "zod";
import { getDatabase, queryable } from "../../lib/db/pool";
import { globalSingleton } from "../../lib/singleton";
import { DataRequestRepo, REQUEST_TYPES } from "./repo";
import { DataRequestService } from "./service";

export { REQUEST_TYPES } from "./repo";
export { DataRequestService } from "./service";

export const createDataRequestBody = z.strictObject({ type: z.enum(REQUEST_TYPES) });

const holder = globalSingleton("data-requests", () => ({
  service: undefined as DataRequestService | undefined,
}));

export function getDataRequests(): DataRequestService {
  holder.service ??= new DataRequestService(new DataRequestRepo(queryable(getDatabase())));
  return holder.service;
}
