import { errors } from "../../lib/errors/app-error";
import { uuidv7 } from "../../lib/ids";
import type { DataRequestRepo, DataRequestRow, RequestType } from "./repo";

// Data requests (P2-11): the entry point for "export my data" and "delete my account". It only
// records the request. Nothing is deleted or exported here; a person processes it (P9) and the
// processing is audited. The legal deadline is not guessed (see docs, Not verified).

export type DataRequestView = {
  id: string;
  type: "export" | "erase";
  status: "pending" | "in_progress" | "completed" | "rejected";
  createdAt: string;
  completedAt: string | null;
};

export const toView = (row: DataRequestRow): DataRequestView => ({
  id: row.id,
  type: row.type as DataRequestView["type"],
  status: row.status as DataRequestView["status"],
  createdAt: row.createdAt.toISOString(),
  completedAt: row.completedAt?.toISOString() ?? null,
});

export class DataRequestService {
  constructor(private readonly repo: DataRequestRepo) {}

  async create(userId: string, type: RequestType): Promise<DataRequestView> {
    const row = await this.repo.createIfNoneOpen({ id: uuidv7(), userId, type });
    if (!row) {
      throw errors.conflict({ detail: "You already have an open request of this kind." });
    }
    return toView(row);
  }

  async list(userId: string): Promise<DataRequestView[]> {
    return (await this.repo.listForUser(userId)).map(toView);
  }
}
