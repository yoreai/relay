import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invalidateAuthCache, probeTools, runLogin } from "../src/probe.ts";

let prevXdg: string | undefined;

beforeEach(() => {
  prevXdg = process.env.XDG_DATA_HOME;
  process.env.XDG_DATA_HOME = mkdtempSync(join(tmpdir(), "relay-probe-"));
});

afterEach(() => {
  if (prevXdg === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = prevXdg;
});

describe("probe", () => {
  test(
    "reports all primary tools with plain-language summaries",
    async () => {
      const tools = await probeTools();
      const ids = tools.map((t) => t.id);
      expect(ids).toContain("cursor");
      expect(ids).toContain("claude");
      expect(ids).toContain("codex");
      for (const t of tools) {
        expect(t.summary.length).toBeGreaterThan(0);
      }
    },
    { timeout: 60_000 },
  );

  test(
    "auth results are cached to the data dir",
    async () => {
    const tools = await probeTools();
    // only tools whose CLI is present get auth-probed (and cached) —
    // on a bare CI runner that set is legitimately empty
    const present = tools.filter(
      (t) => t.cliPresent && ["cursor", "claude", "codex"].includes(t.id),
    );
    const cachePath = join(process.env.XDG_DATA_HOME!, "relay", "probe.json");
    const cache = existsSync(cachePath)
      ? (JSON.parse(readFileSync(cachePath, "utf8")) as Record<
          string,
          { ts: number }
        >)
      : {};
    expect(Object.keys(cache).length).toBe(present.length);
    for (const entry of Object.values(cache)) {
      expect(entry.ts).toBeGreaterThan(Date.now() - 120_000);
    }
    },
    { timeout: 60_000 },
  );

  test("second probe reuses cache (no fresh flag)", async () => {
    await probeTools();
    const t0 = Date.now();
    await probeTools();
    // cached probe must be near-instant (no model-call auth checks)
    expect(Date.now() - t0).toBeLessThan(1_500);
  });

  test("invalidateAuthCache clears entries", async () => {
    await probeTools();
    invalidateAuthCache();
    const cache = JSON.parse(
      readFileSync(
        join(process.env.XDG_DATA_HOME!, "relay", "probe.json"),
        "utf8",
      ),
    );
    expect(Object.keys(cache).length).toBe(0);
  });

  test("fresh probe scoped with `only` re-checks just that tool", async () => {
    // Fake binaries (invoked via the RELAY_*_BIN overrides) let us prove the
    // scoping without depending on which real CLIs happen to be installed.
    const dir = mkdtempSync(join(tmpdir(), "relay-probe-only-"));
    const callsFile = join(dir, "calls.log");
    const makeFakeBin = (name: string, stdout: string): string => {
      const p = join(dir, name);
      writeFileSync(p, `#!/bin/sh\necho ${name} >> "${callsFile}"\necho "${stdout}"\n`, {
        mode: 0o755,
      });
      return p;
    };
    const cursorBin = makeFakeBin("fake-cursor", "ok");
    const claudeBin = makeFakeBin("fake-claude", "ok");
    const codexBin = makeFakeBin("fake-codex", "logged in");

    const prev = {
      cursor: process.env.RELAY_CURSOR_BIN,
      claude: process.env.RELAY_CLAUDE_BIN,
      codex: process.env.RELAY_CODEX_BIN,
    };
    process.env.RELAY_CURSOR_BIN = cursorBin;
    process.env.RELAY_CLAUDE_BIN = claudeBin;
    process.env.RELAY_CODEX_BIN = codexBin;

    try {
      await probeTools({ fresh: true }); // warm the cache for all three
      writeFileSync(callsFile, "");

      await probeTools({ fresh: true, only: "codex" });

      const calls = readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean);
      expect(calls).toEqual(["fake-codex"]);
    } finally {
      for (const [k, v] of Object.entries(prev)) {
        const key = `RELAY_${k.toUpperCase()}_BIN`;
        if (v === undefined) delete process.env[key];
        else process.env[key] = v;
      }
    }
  });

  test("probing on a machine with zero CLIs still succeeds", async () => {
    // simulate a bare CI runner: PATH with no agent CLIs
    const prevPath = process.env.PATH;
    process.env.PATH = "/usr/bin:/bin";
    try {
      const tools = await probeTools({ fresh: true });
      for (const t of tools) {
        expect(t.cliPresent).toBe(false);
        expect(t.summary.length).toBeGreaterThan(0);
      }
    } finally {
      process.env.PATH = prevPath;
    }
  });
});

describe("runLogin", () => {
  // Captures writes instead of letting them hit the real fds, so the test
  // doesn't spew fake login output into the test runner's own console.
  function captureWrites() {
    const stderr: string[] = [];
    const stdout: string[] = [];
    const origErr = process.stderr.write.bind(process.stderr);
    const origOut = process.stdout.write.bind(process.stdout);
    process.stderr.write = ((chunk: unknown) => {
      stderr.push(String(chunk));
      return true;
    }) as typeof process.stderr.write;
    process.stdout.write = ((chunk: unknown) => {
      stdout.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    return {
      stderr,
      stdout,
      restore: () => {
        process.stderr.write = origErr;
        process.stdout.write = origOut;
      },
    };
  }

  function makeFakeCursorBin(dir: string, name: string, script: string): string {
    const p = join(dir, name);
    writeFileSync(p, script, { mode: 0o755 });
    return p;
  }

  let prevCursorBin: string | undefined;

  beforeEach(() => {
    prevCursorBin = process.env.RELAY_CURSOR_BIN;
  });

  afterEach(() => {
    if (prevCursorBin === undefined) delete process.env.RELAY_CURSOR_BIN;
    else process.env.RELAY_CURSOR_BIN = prevCursorBin;
  });

  test("stream:true echoes the login command's output live to stderr, never stdout", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-login-ok-"));
    process.env.RELAY_CURSOR_BIN = makeFakeCursorBin(
      dir,
      "fake-cursor",
      [
        "#!/bin/sh",
        'if [ "$1" = "login" ]; then',
        '  echo "opening your browser..."',
        '  echo "If your browser did not open, use this link: https://example.com/auth/xyz"',
        "  exit 0",
        "fi",
        "echo ok",
      ].join("\n"),
    );

    const cap = captureWrites();
    try {
      const result = await runLogin("cursor", { stream: true });
      expect(result.ok).toBe(true);
      expect(cap.stderr.join("")).toContain(
        "If your browser did not open, use this link",
      );
      expect(cap.stdout.join("")).toBe("");
    } finally {
      cap.restore();
    }
  });

  test("streaming is opt-in: without stream:true, nothing is echoed live", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-login-default-"));
    process.env.RELAY_CURSOR_BIN = makeFakeCursorBin(
      dir,
      "fake-cursor",
      [
        "#!/bin/sh",
        'if [ "$1" = "login" ]; then',
        '  echo "If your browser did not open, use this link: https://example.com/auth/xyz"',
        "  exit 0",
        "fi",
        "echo ok",
      ].join("\n"),
    );

    const cap = captureWrites();
    try {
      const result = await runLogin("cursor");
      expect(result.ok).toBe(true);
      expect(cap.stderr.join("")).toBe("");
      expect(cap.stdout.join("")).toBe("");
    } finally {
      cap.restore();
    }
  });

  test("bounded timeout: still visible live, still reports a browser-finish hint", async () => {
    const dir = mkdtempSync(join(tmpdir(), "relay-login-timeout-"));
    process.env.RELAY_CURSOR_BIN = makeFakeCursorBin(
      dir,
      "fake-cursor",
      [
        "#!/bin/sh",
        'if [ "$1" = "login" ]; then',
        '  echo "If your browser did not open, use this link: https://example.com/auth/xyz"',
        // exec so the timeout kill hits the sleeping process itself — a
        // forked sleep would keep the stdout pipe open past the kill and
        // stall the output drain until the sleep finishes on its own.
        "  exec sleep 5",
        "fi",
        'echo "authentication required"',
        "exit 1",
      ].join("\n"),
    );

    const cap = captureWrites();
    try {
      const result = await runLogin("cursor", { stream: true, timeoutMs: 300 });
      expect(result.ok).toBe(false);
      expect(result.message).toContain("timed out waiting");
      expect(result.message).toContain("finish it in the browser");
      // the fallback link must have reached stderr WHILE the process was
      // still running — not just recovered from a dead process after kill.
      expect(cap.stderr.join("")).toContain(
        "If your browser did not open, use this link",
      );
      expect(cap.stdout.join("")).toBe("");
    } finally {
      cap.restore();
    }
  });
});
