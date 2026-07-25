import { describe, expect, test } from "bun:test";
import { containsSecret, redactSecrets } from "../src/redact.ts";
import { errorExcerpt } from "../src/run.ts";

/**
 * Fixtures are assembled from parts rather than written out whole: a literal
 * that matches a vendor token shape trips GitHub's push protection even when
 * it's obvious test junk, and a security test that can't be pushed is worse
 * than an ugly one.
 */
const fake = (prefix: string, body: string) => prefix + body;

describe("redactSecrets", () => {
  test("strips vendor key formats a backend might echo", () => {
    const cases = [
      `Error: invalid key ${fake("sk-ant-", "api03-AbCdEf0123456789xyz")}`,
      `using ${fake("ghp", "_AbCdEf0123456789AbCdEf0123456789")}`,
      `token=${fake("github", "_pat_11ABCDEFG0123456789_abcdefghijklmnop")}`,
      `aws ${fake("AKIA", "IOSFODNN7EXAMPLE")} denied`,
      `Authorization: ${fake("Bearer ", "abcdefghijklmnopqrstuvwxyz012345")}`,
      `slack ${fake("xox", "b-123456789012-abcdefghijklmnop")}`,
      `gcp ${fake("AIza", "SyA0123456789abcdefghijklmnopqrstu")}`,
    ];
    for (const c of cases) {
      const out = redactSecrets(c);
      expect(out).toContain("[redacted");
      expect(containsSecret(c)).toBe(true);
    }
  });

  test("keeps the variable name but drops the value", () => {
    const out = redactSecrets('ANTHROPIC_API_KEY="hunter2hunter2"');
    expect(out).toContain("ANTHROPIC_API_KEY");
    expect(out).not.toContain("hunter2hunter2");
  });

  test("redacts a private key block whole", () => {
    const pem =
      "-----BEGIN OPENSSH PRIVATE KEY-----\nabc123\ndef456\n-----END OPENSSH PRIVATE KEY-----";
    const out = redactSecrets(`key was:\n${pem}\ndone`);
    expect(out).not.toContain("abc123");
    expect(out).toContain("done");
  });

  test("leaves ordinary backend output alone", () => {
    const plain = "3 tests failed in src/route.ts:42 — expected tree, got worktree";
    expect(redactSecrets(plain)).toBe(plain);
    expect(containsSecret(plain)).toBe(false);
  });
});

describe("errorExcerpt", () => {
  // This excerpt is persisted to events/<run_id>.jsonl, and an auth failure
  // that echoes the key is exactly the kind of line that lands in the tail.
  test("scrubs before the excerpt is persisted", () => {
    const out = errorExcerpt(
      `starting\nError: invalid key ${fake("sk-ant-", "api03-AbCdEf0123456789xyz")}\nexiting 1`,
    );
    expect(out).not.toContain("api03-AbCdEf");
    expect(out).toContain("[redacted:anthropic-key]");
    expect(out).toContain("exiting 1");
  });

  test("still trims to the length budget", () => {
    const out = errorExcerpt("x".repeat(500), 100);
    expect(out.length).toBeLessThanOrEqual(101);
  });
});
