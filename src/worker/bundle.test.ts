import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The worker runs as plain Node ESM from an esbuild bundle that leaves packages external (pnpm
// build:worker). Vitest and Next.js both smooth over CommonJS packages, so a named import of one
// (agora-token, once) passes every test and then crashes the real worker at start. This builds the
// handlers the same way and loads them in plain Node, which is what the container does.
const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "dist", "bundle-test");

describe("the worker bundle", () => {
  it("loads in plain Node and exposes a handler for every job it consumes", () => {
    rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    const file = path.join(out, "handlers.mjs");
    execFileSync(
      process.execPath,
      [
        path.join(root, "node_modules/esbuild/bin/esbuild"),
        path.join(root, "src/worker/handlers.ts"),
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        `--outfile=${file}`,
        "--log-level=error",
      ],
      { cwd: root, stdio: "pipe" },
    );
    const names = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(`file:///${file.replaceAll("\\", "/")}`)}); console.log(Object.keys(m.handlers).sort().join(","))`,
      ],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    ).trim();
    rmSync(out, { recursive: true, force: true });
    for (const queue of [
      "file.scan",
      "invoice.render_pdf",
      "payment.reconcile",
      "payment.webhook.process",
      "recording.store",
      "retention.purge",
    ]) {
      expect(names.split(","), queue).toContain(queue);
    }
  }, 60_000);
});
