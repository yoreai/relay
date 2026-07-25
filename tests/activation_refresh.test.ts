import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACTIVATION_BLOCK, refreshActivationHints } from "../src/activation.ts";

/**
 * Hint files are the only channel relay controls that every host re-reads
 * fresh each session, and they ship their wording with the binary — so an
 * upgrade has to update them. The hard part is restraint: an upgrade must not
 * install relay into hosts the user never set up, or resurrect hints they
 * removed.
 */

/** Bun's os.homedir() ignores $HOME, so the home dir is passed in. */
function fakeHome(): string {
  return mkdtempSync(join(tmpdir(), "relay-home-"));
}

const OLD_BLOCK =
  "<!-- BEGIN RELAY ACTIVATION (managed by `relay setup`) -->\n" +
  "Ancient wording from a relay two versions ago.\n" +
  "<!-- END RELAY ACTIVATION -->\n";

describe("refreshActivationHints", () => {
  test("brings an out-of-date cursor rule up to this version", () => {
    const home = fakeHome();
    const rule = join(home, ".cursor", "rules", "relay.mdc");
    mkdirSync(join(home, ".cursor", "rules"), { recursive: true });
    writeFileSync(rule, `---\nalwaysApply: true\n---\n\n${OLD_BLOCK}`);

    expect(refreshActivationHints(home)).toEqual([rule]);
    expect(readFileSync(rule, "utf8")).toContain(ACTIVATION_BLOCK);
  });

  test("refreshes a memory-file block without disturbing the rest of the file", () => {
    const home = fakeHome();
    const claude = join(home, ".claude", "CLAUDE.md");
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(claude, `# My instructions\n\nAlways use tabs.\n\n${OLD_BLOCK}`);

    expect(refreshActivationHints(home)).toEqual([claude]);
    const after = readFileSync(claude, "utf8");
    expect(after).toContain("Always use tabs.");
    expect(after).toContain(ACTIVATION_BLOCK);
    expect(after).not.toContain("Ancient wording");
    // the user's file was backed up before relay rewrote it
    expect(existsSync(`${claude}.relay-bak`)).toBe(true);
  });

  test("does not install into hosts the user never set up", () => {
    const home = fakeHome();
    expect(refreshActivationHints(home)).toEqual([]);
    expect(existsSync(join(home, ".cursor", "rules", "relay.mdc"))).toBe(false);
    expect(existsSync(join(home, ".claude", "CLAUDE.md"))).toBe(false);
    expect(existsSync(join(home, ".codex", "AGENTS.md"))).toBe(false);
  });

  test("leaves a memory file that carries no relay block completely alone", () => {
    const home = fakeHome();
    const codex = join(home, ".codex", "AGENTS.md");
    mkdirSync(join(home, ".codex"), { recursive: true });
    const original = "# my agents file\n\nnothing to do with relay\n";
    writeFileSync(codex, original);

    expect(refreshActivationHints(home)).toEqual([]);
    expect(readFileSync(codex, "utf8")).toBe(original);
    expect(existsSync(`${codex}.relay-bak`)).toBe(false);
  });

  test("is a no-op once current — no rewrite, no backup churn", () => {
    const home = fakeHome();
    const codex = join(home, ".codex", "AGENTS.md");
    mkdirSync(join(home, ".codex"), { recursive: true });
    writeFileSync(codex, OLD_BLOCK);

    expect(refreshActivationHints(home)).toEqual([codex]);
    expect(refreshActivationHints(home)).toEqual([]);
  });
});
