import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The worker runs as plain Node ESM from an esbuild bundle that leaves packages external (pnpm
// build:worker). Vitest and Next.js both smooth over CommonJS packages, so a named import of one
// (agora-token, once) passes every test and then crashes the real worker at start. This builds the
// same way and loads the result in plain Node, which is what the container does.
const root = path.resolve(import.meta.dirname, "../..");
const out = path.join(root, "dist", "bundle-test");

/** Bundles one file as the worker build does, loads it in plain Node, and prints an expression. */
function loadInPlainNode(entry: string, name: string, expression: string): string {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const file = path.join(out, `${name}.mjs`);
  try {
    execFileSync(
      process.execPath,
      [
        path.join(root, "node_modules/esbuild/bin/esbuild"),
        path.join(root, entry),
        "--bundle",
        "--platform=node",
        "--format=esm",
        "--packages=external",
        `--outfile=${file}`,
        "--log-level=error",
      ],
      { cwd: root, stdio: "pipe" },
    );
    return execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `const m = await import(${JSON.stringify(`file:///${file.replaceAll("\\", "/")}`)}); console.log(${expression})`,
      ],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    ).trim();
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

describe("the worker bundle", () => {
  it("loads in plain Node and exposes a handler for every job it consumes", () => {
    const names = loadInPlainNode(
      "src/worker/handlers.ts",
      "handlers",
      "Object.keys(m.handlers).sort().join(',')",
    );
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

  it("the encryption set-up, with the AWS KMS client, loads in plain Node", () => {
    const type = loadInPlainNode(
      "src/lib/crypto/from-config.ts",
      "crypto",
      "typeof m.cryptoFromConfig",
    );
    expect(type).toBe("function");
  }, 60_000);

  it("the email adapter (nodemailer) loads in plain Node", () => {
    const type = loadInPlainNode(
      "src/lib/adapters/smtp-email.ts",
      "smtp",
      "typeof m.SmtpEmailProvider",
    );
    expect(type).toBe("function");
  }, 60_000);
});
