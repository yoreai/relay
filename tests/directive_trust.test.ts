import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadDirectiveWithSource } from "../src/directive.ts";
import { findDirectivePath } from "../src/paths.ts";

/**
 * A directive decides which vendor runs, how much of the repo ships to it,
 * whether edits land in the working tree or an auto-pushed branch, and which
 * verify commands execute. Whoever commits a file to a cloned repo does not get
 * to decide those for the person running relay.
 */

function directive(opts: { lane?: string; write?: string; autonomy?: string } = {}): string {
  return `version: 1
baseline: opus-5
tiers:
  work: { backend: cursor, model: composer-2.5 }
lanes:
  - name: ${opts.lane ?? "quickfix"}
    match: { verbs: [fix] }
    tier: work
    write: ${opts.write ?? "tree"}
${opts.autonomy ? `    autonomy: ${opts.autonomy}\n` : ""}default_lane: ${opts.lane ?? "quickfix"}
`;
}

function repoWith(text: string, at = "router.yaml"): string {
  const cwd = mkdtempSync(join(tmpdir(), "relay-trust-repo-"));
  const path = join(cwd, at);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return cwd;
}

function userConfigWith(text: string): string {
  const configHome = mkdtempSync(join(tmpdir(), "relay-trust-cfg-"));
  mkdirSync(join(configHome, "relay"), { recursive: true });
  writeFileSync(join(configHome, "relay", "router.yaml"), text);
  return configHome;
}

function withConfigHome<T>(configHome: string | undefined, fn: () => T): T {
  const previous = process.env.XDG_CONFIG_HOME;
  if (configHome) process.env.XDG_CONFIG_HOME = configHome;
  else delete process.env.XDG_CONFIG_HOME;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = previous;
  }
}

describe("directive precedence", () => {
  test("the user's own config outranks a repo-committed directive", () => {
    const cwd = repoWith(directive({ lane: "repo-chose-this" }));
    const configHome = userConfigWith(directive({ lane: "user-chose-this" }));
    withConfigHome(configHome, () => {
      const loaded = loadDirectiveWithSource(cwd);
      expect(loaded.repoLocal).toBe(false);
      expect(loaded.directive.lanes[0]?.name).toBe("user-chose-this");
      expect(findDirectivePath(cwd)).toBe(join(configHome, "relay", "router.yaml"));
    });
  });

  test("a repo directive still governs a user who has no config of their own", () => {
    const cwd = repoWith(directive({ lane: "repo-chose-this" }));
    withConfigHome(mkdtempSync(join(tmpdir(), "relay-trust-empty-")), () => {
      const loaded = loadDirectiveWithSource(cwd);
      expect(loaded.repoLocal).toBe(true);
      expect(loaded.directive.lanes[0]?.name).toBe("repo-chose-this");
    });
  });
});

describe("permission grants a repo cannot make", () => {
  const cases = [
    { at: "router.yaml" },
    { at: ".relay/router.yaml" },
  ];

  for (const { at } of cases) {
    test(`${at}: write: worktree is downgraded to the working tree`, () => {
      const cwd = repoWith(directive({ write: "worktree" }), at);
      withConfigHome(mkdtempSync(join(tmpdir(), "relay-trust-empty-")), () => {
        const loaded = loadDirectiveWithSource(cwd);
        expect(loaded.repoLocal).toBe(true);
        expect(loaded.clampedWrites).toEqual(["quickfix"]);
        // the branch/commit/push/PR path spends the user's git credentials
        expect(loaded.directive.lanes[0]?.write).toBe("tree");
      });
    });
  }

  test("both grants are clamped together, and reported separately", () => {
    const cwd = repoWith(directive({ write: "worktree", autonomy: "full" }));
    withConfigHome(mkdtempSync(join(tmpdir(), "relay-trust-empty-")), () => {
      const loaded = loadDirectiveWithSource(cwd);
      expect(loaded.clampedLanes).toEqual(["quickfix"]);
      expect(loaded.clampedWrites).toEqual(["quickfix"]);
      expect(loaded.directive.lanes[0]?.autonomy).toBe("safe");
      expect(loaded.directive.lanes[0]?.write).toBe("tree");
    });
  });

  test("the user's own config keeps both", () => {
    const configHome = userConfigWith(directive({ write: "worktree", autonomy: "full" }));
    const cwd = mkdtempSync(join(tmpdir(), "relay-trust-plain-"));
    withConfigHome(configHome, () => {
      const loaded = loadDirectiveWithSource(cwd);
      expect(loaded.repoLocal).toBe(false);
      expect(loaded.clampedWrites).toEqual([]);
      expect(loaded.directive.lanes[0]?.write).toBe("worktree");
      expect(loaded.directive.lanes[0]?.autonomy).toBe("full");
    });
  });
});
