import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleContext } from "../src/context/assemble.ts";
import { briefFromTask } from "../src/brief.ts";

/**
 * Named files are read and embedded in the prompt, then shipped to whichever
 * backend model runs. The list arrives from an MCP caller — another agent, which
 * may itself be prompt-injected — so an unchecked path turns "add context" into
 * "read any file this user can read and exfiltrate it as prompt tokens."
 */
describe("named file containment", () => {
  function repo(): { cwd: string; outsideName: string } {
    const root = mkdtempSync(join(tmpdir(), "relay-contain-"));
    const cwd = join(root, "repo");
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, "inside.txt"), "INSIDE_MARKER");
    writeFileSync(join(root, "secrets.env"), "OUTSIDE_MARKER");
    return { cwd, outsideName: "../secrets.env" };
  }

  test("reads a file inside the repo", async () => {
    const { cwd } = repo();
    const out = await assembleContext(briefFromTask("t"), {
      cwd,
      budgetChars: 10_000,
      namedFiles: ["inside.txt"],
    });
    expect(out).toContain("INSIDE_MARKER");
  });

  test("refuses to escape the repo with ../", async () => {
    const { cwd, outsideName } = repo();
    const out = await assembleContext(briefFromTask("t"), {
      cwd,
      budgetChars: 10_000,
      namedFiles: [outsideName],
    });
    expect(out).not.toContain("OUTSIDE_MARKER");
  });

  test("refuses an absolute path outside the repo", async () => {
    const { cwd } = repo();
    const out = await assembleContext(briefFromTask("t"), {
      cwd,
      budgetChars: 10_000,
      namedFiles: ["/etc/hosts", "/etc/passwd"],
    });
    expect(out).not.toContain("root:");
  });

  test("a contained file survives alongside a rejected one", async () => {
    const { cwd, outsideName } = repo();
    const out = await assembleContext(briefFromTask("t"), {
      cwd,
      budgetChars: 10_000,
      namedFiles: [outsideName, "inside.txt"],
    });
    expect(out).toContain("INSIDE_MARKER");
    expect(out).not.toContain("OUTSIDE_MARKER");
  });
});
