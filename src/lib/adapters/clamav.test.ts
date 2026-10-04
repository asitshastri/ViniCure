import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { ClamAvScanner, parseClamdReply } from "./clamav";

// A stand-in for clamd that speaks the INSTREAM protocol, so the adapter runs without ClamAV.
type Stub = { port: number; received: Buffer[]; close: () => void };
const open: net.Server[] = [];

async function stubClamd(reply: (body: Buffer) => string | null): Promise<Stub> {
  const received: Buffer[] = [];
  const server = net.createServer((socket) => {
    let buf = Buffer.alloc(0);
    socket.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const cmd = "zINSTREAM\0";
      if (buf.length < cmd.length || buf.subarray(0, cmd.length).toString() !== cmd) return;
      let at = cmd.length;
      const body: Buffer[] = [];
      for (;;) {
        if (buf.length < at + 4) return;
        const size = buf.readUInt32BE(at);
        if (size === 0) break;
        if (buf.length < at + 4 + size) return;
        body.push(buf.subarray(at + 4, at + 4 + size));
        at += 4 + size;
      }
      const all = Buffer.concat(body);
      received.push(all);
      const answer = reply(all);
      if (answer === null) return socket.destroy();
      socket.end(`${answer}\0`);
    });
  });
  open.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: (server.address() as net.AddressInfo).port,
    received,
    close: () => server.close(),
  };
}

const bytes = (...parts: string[]) =>
  async function* () {
    for (const p of parts) yield Buffer.from(p);
  };

afterEach(() => {
  for (const s of open.splice(0)) s.close();
});

describe("parseClamdReply", () => {
  it("trusts only OK and FOUND answers", () => {
    expect(parseClamdReply("stream: OK\0")).toBe("clean");
    expect(parseClamdReply("stream: Eicar-Test-Signature FOUND")).toBe("infected");
    expect(parseClamdReply("INSTREAM size limit exceeded. ERROR")).toBe("error");
    expect(parseClamdReply("")).toBe("error");
    expect(parseClamdReply("stream: OK and more")).toBe("error");
  });
});

describe("ClamAvScanner", () => {
  it("sends the whole file and reports clean", async () => {
    const stub = await stubClamd(() => "stream: OK");
    const scanner = new ClamAvScanner({
      host: "127.0.0.1",
      port: stub.port,
      open: async () => bytes("hello ", "world")(),
    });
    expect(await scanner.scan({ storageKey: "kyc/2026/a.pdf" })).toEqual({ status: "clean" });
    expect(Buffer.concat(stub.received).toString()).toBe("hello world");
  });

  it("reports infected when clamd names a signature", async () => {
    const stub = await stubClamd(() => "stream: Eicar-Test-Signature FOUND");
    const scanner = new ClamAvScanner({
      host: "127.0.0.1",
      port: stub.port,
      open: async () => bytes("X")(),
    });
    expect(await scanner.scan({ storageKey: "kyc/2026/a.pdf" })).toEqual({ status: "infected" });
  });

  it("splits a large file into chunks and still sends every byte", async () => {
    const stub = await stubClamd(() => "stream: OK");
    const big = Buffer.alloc(200_000, 7);
    const scanner = new ClamAvScanner({
      host: "127.0.0.1",
      port: stub.port,
      open: async () =>
        (async function* () {
          yield big;
        })(),
    });
    expect((await scanner.scan({ storageKey: "kyc/2026/a.pdf" })).status).toBe("clean");
    expect(Buffer.concat(stub.received).equals(big)).toBe(true);
  });

  it("reports error, never clean, when clamd drops the connection, errors or is not there", async () => {
    const dropped = await stubClamd(() => null);
    const make = (port: number) =>
      new ClamAvScanner({
        host: "127.0.0.1",
        port,
        open: async () => bytes("x")(),
        timeoutMs: 500,
      });
    expect((await make(dropped.port).scan({ storageKey: "k/1" })).status).toBe("error");
    const erroring = await stubClamd(() => "INSTREAM size limit exceeded. ERROR");
    expect((await make(erroring.port).scan({ storageKey: "k/1" })).status).toBe("error");
    expect((await make(1).scan({ storageKey: "k/1" })).status).toBe("error");
  });

  it("reports error when clamd never answers (timeout)", async () => {
    const silent = net.createServer(() => undefined);
    open.push(silent);
    await new Promise<void>((r) => silent.listen(0, "127.0.0.1", r));
    const port = (silent.address() as net.AddressInfo).port;
    const scanner = new ClamAvScanner({
      host: "127.0.0.1",
      port,
      open: async () => bytes("x")(),
      timeoutMs: 200,
    });
    expect((await scanner.scan({ storageKey: "k/1" })).status).toBe("error");
  });

  it("a stored file that cannot be opened is an outage, not a verdict", async () => {
    const scanner = new ClamAvScanner({
      host: "127.0.0.1",
      port: 1,
      open: async () => {
        throw new Error("no such key");
      },
    });
    await expect(scanner.scan({ storageKey: "k/1" })).rejects.toMatchObject({
      kind: "unavailable",
    });
  });
});
