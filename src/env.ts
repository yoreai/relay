/**
 * Environment for children that are NOT the agent backend.
 *
 * Backends (`claude`, `cursor-agent`, `codex`) need the real environment —
 * delegated auth is relay's design and their credentials live there. Everything
 * else relay shells out to does not: `bash -lc <verify command>` and third-party
 * binaries picked off PATH like `bd` have no business seeing ANTHROPIC_API_KEY,
 * GITHUB_TOKEN or AWS credentials. Passing the full environment is what turns a
 * command-execution bug into a credential-loss bug, so the blast radius is
 * capped here rather than at each call site.
 *
 * One definition on purpose: two copies of an allowlist is how one of them
 * quietly grows.
 */
const TOOL_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "TMPDIR",
  "USER",
  "LOGNAME",
  "SHELL",
  "LANG",
  "LC_ALL",
  "TERM",
];

export function toolEnv(extra: Record<string, string> = {}): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of TOOL_ENV_ALLOWLIST) {
    const v = process.env[key];
    if (v !== undefined) env[key] = v;
  }
  return { ...env, ...extra };
}
