import net from "node:net";
import { AdapterError, type FileScanner } from "./types";

// ClamAV scanner adapter. It talks to clamd over TCP with the INSTREAM command: the file is
// sent in length-prefixed chunks and clamd answers "stream: OK", "stream: <name> FOUND" or an
// error line. The bytes never touch the disk of the worker.
//
// Defined behaviour when ClamAV is down or slow (backend-architecture.md section 9):
//   - no connection, timeout or an error answer: the scan reports "error", the file stays
//     inactive, and the job is retried by the queue. A file is never marked clean unseen.
//   - the answer is only trusted when it ends with OK (clean) or FOUND (infected).

const CHUNK = 64 * 1024;
/** clamd refuses a stream above its StreamMaxLength (25 MB by default). Ours are all below. */
const MAX_STREAM = 25 * 1024 * 1024;

export type ClamAvOptions = {
  host: string;
  port: number;
  /** Opens the stored bytes of one file. */
  open: (storageKey: string) => Promise<AsyncIterable<Uint8Array>>;
  /** Whole-scan limit in milliseconds. */
  timeoutMs?: number;
};

export function parseClamdReply(reply: string): "clean" | "infected" | "error" {
  const text = reply.replace(/\0/g, "").trim();
  if (/^stream:\s*OK$/i.test(text)) return "clean";
  if (/^stream:\s*.+\sFOUND$/i.test(text)) return "infected";
  return "error";
}

export class ClamAvScanner implements FileScanner {
  constructor(private readonly options: ClamAvOptions) {}

  async scan(input: { storageKey: string }): Promise<{ status: "clean" | "infected" | "error" }> {
    if (!input.storageKey) throw new AdapterError("invalid_input", "storageKey is required");
    let source: AsyncIterable<Uint8Array>;
    try {
      source = await this.options.open(input.storageKey);
    } catch {
      throw new AdapterError("unavailable", "the stored file could not be opened");
    }
    try {
      return { status: parseClamdReply(await this.stream(source)) };
    } catch {
      // Any network trouble is "could not scan", not "clean".
      return { status: "error" };
    }
  }

  private stream(source: AsyncIterable<Uint8Array>): Promise<string> {
    const { host, port, timeoutMs = 60_000 } = this.options;
    return new Promise((resolve, reject) => {
      const socket = net.connect({ host, port });
      const chunks: Buffer[] = [];
      const timer = setTimeout(() => socket.destroy(new Error("timeout")), timeoutMs);
      const done = (fn: () => void) => {
        clearTimeout(timer);
        fn();
      };
      socket.on("error", (error) => done(() => reject(error)));
      socket.on("data", (data) => chunks.push(data));
      socket.on("close", () => done(() => resolve(Buffer.concat(chunks).toString("utf8"))));
      socket.on("connect", () => {
        void (async () => {
          try {
            socket.write("zINSTREAM\0");
            let total = 0;
            for await (const part of source) {
              for (let i = 0; i < part.length; i += CHUNK) {
                const piece = part.subarray(i, i + CHUNK);
                total += piece.length;
                if (total > MAX_STREAM) throw new Error("file too large to scan");
                const size = Buffer.alloc(4);
                size.writeUInt32BE(piece.length);
                socket.write(size);
                socket.write(piece);
              }
            }
            socket.write(Buffer.alloc(4)); // zero length ends the stream
          } catch (error) {
            socket.destroy(error as Error);
          }
        })();
      });
    });
  }
}
