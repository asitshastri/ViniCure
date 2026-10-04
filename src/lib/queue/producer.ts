import { getConfig } from "../config/config";
import { errors } from "../errors/app-error";
import { registerShutdownHook } from "../lifecycle";
import { globalSingleton } from "../singleton";
import { QueueClient, createBoss } from "./queue";

// Lets the web process add jobs. It connects as the `app` role with a small pool and runs no
// maintenance or cron (the worker does). Started on first use.

const holder = globalSingleton("queue-producer", () => ({
  client: undefined as Promise<QueueClient> | undefined,
  override: undefined as Pick<QueueClient, "enqueue"> | undefined,
}));

export async function getQueue(): Promise<Pick<QueueClient, "enqueue">> {
  if (holder.override) return holder.override;
  holder.client ??= (async () => {
    const url = getConfig().DATABASE_URL;
    if (!url) throw errors.unavailable({ detail: "Background work is not available right now." });
    const boss = createBoss({ connectionString: url, role: "producer" });
    await boss.start();
    registerShutdownHook("queue-producer", () => boss.stop({ graceful: true, timeout: 5000 }));
    return new QueueClient(boss);
  })();
  try {
    return await holder.client;
  } catch (error) {
    holder.client = undefined; // try again next time instead of failing forever
    throw error;
  }
}

/** Replaces the producer (tests). Pass undefined to reset. */
export function setQueueForTest(queue: Pick<QueueClient, "enqueue"> | undefined): void {
  holder.override = queue;
}
