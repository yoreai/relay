import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
} from "node:fs";
import { join } from "node:path";

/** Keep relay's worktree scratch space out of `git status` noise — local
 * exclude, so nothing lands in the user's tracked .gitignore. */
function excludeRelayDir(root: string): void {
  try {
    const infoDir = join(root, ".git", "info");
    const excludePath = join(infoDir, "exclude");
    const current = existsSync(excludePath)
      ? readFileSync(excludePath, "utf8")
      : "";
    if (/^\.relay\/$/m.test(current)) return;
    mkdirSync(infoDir, { recursive: true });
    appendFileSync(
      excludePath,
      `${current.endsWith("\n") || !current ? "" : "\n"}.relay/\n`,
    );
  } catch {
    // cosmetic — never fail a run over exclude bookkeeping
  }
}

export async function gitRoot(cwd: string): Promise<string | null> {
  const out = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  return out || null;
}

export async function stagePaths(cwd: string, paths: string[]): Promise<void> {
  if (paths.length === 0) {
    // stage all tracked modifications in the worktree
    await runGit(cwd, ["add", "-u"]);
    await runGit(cwd, ["add", "-A"]);
    return;
  }
  await runGit(cwd, ["add", "--", ...paths]);
}

export async function listChangedFiles(cwd: string): Promise<string[]> {
  // NUL-separated output: no quoting, and no leading-space ambiguity that
  // a trim() would corrupt (` M file` → `M file` → wrong slice).
  const out = await runGitRaw(cwd, ["status", "--porcelain", "-z"]);
  if (!out) return [];
  const fields = out.split("\0").filter(Boolean);
  const paths: string[] = [];
  for (let i = 0; i < fields.length; i++) {
    const entry = fields[i]!;
    paths.push(entry.slice(3));
    // rename/copy entries are "XY new\0old" — skip the origin-path field
    if (entry[0] === "R" || entry[0] === "C") i++;
  }
  return paths.filter(Boolean);
}

/**
 * Remove `dir` and any now-empty ancestors. `stopAt` is exclusive and is never
 * itself removed, which is what keeps this from ever walking up to the repo root.
 */
function removeEmptyDirsUpTo(dir: string, stopAt: string): void {
  let current = dir;
  while (
    current !== stopAt &&
    current.startsWith(stopAt) &&
    existsSync(current)
  ) {
    try {
      if (readdirSync(current).length > 0) return;
      rmdirSync(current);
    } catch {
      return;
    }
    current = join(current, "..");
  }
}

/**
 * Drop worktree registrations whose directories are gone, then sweep up the
 * empty scaffolding underneath. relay branches contain a slash
 * (`relay/build-x`), so `git worktree remove` leaves an empty `relay/` behind —
 * harmless, but it reads as a stray "relay inside relay" folder in the user's
 * tree. Cosmetic bookkeeping only: never throws.
 */
export async function pruneWorktrees(cwd: string): Promise<void> {
  try {
    const root = (await gitRoot(cwd)) ?? cwd;
    await runGitCode(root, ["worktree", "prune"]);
    const relayDir = join(root, ".relay");
    const base = join(relayDir, "worktrees");
    if (existsSync(base)) {
      for (const entry of readdirSync(base)) {
        removeEmptyDirsUpTo(join(base, entry), base);
      }
    }
    removeEmptyDirsUpTo(base, relayDir);
    removeEmptyDirsUpTo(relayDir, root);
  } catch {
    // cosmetic — never fail a run over directory bookkeeping
  }
}

export async function createWorktree(
  cwd: string,
  branch: string,
): Promise<string> {
  const root = (await gitRoot(cwd)) ?? cwd;
  const dest = join(root, ".relay", "worktrees", branch);
  // self-healing: clear out anything a previous run's `git worktree remove`
  // left behind before we add to it
  await pruneWorktrees(root);
  await Bun.$`mkdir -p ${join(root, ".relay", "worktrees")}`.quiet();
  excludeRelayDir(root);
  // create branch from HEAD if needed, then worktree
  const existing = await runGit(root, ["rev-parse", "--verify", branch]);
  if (!existing) {
    await runGit(root, ["branch", branch]);
  }
  if (!existsSync(dest)) {
    const code = await runGitCode(root, ["worktree", "add", dest, branch]);
    if (code !== 0) {
      throw new Error(`failed to create worktree at ${dest}`);
    }
  }
  return dest;
}

/**
 * Commit staged changes (worktree lanes only — the lane's write mode is the
 * user's consent to commit on a relay/* branch). Falls back to a relay
 * identity when the repo has none configured. Returns the short hash.
 */
export async function commitStaged(
  cwd: string,
  message: string,
): Promise<string | null> {
  const tryCommit = (extra: string[]) =>
    runGitCode(cwd, [...extra, "commit", "-m", message]);
  let code = await tryCommit([]);
  if (code !== 0) {
    code = await tryCommit([
      "-c",
      "user.name=relay",
      "-c",
      "user.email=relay@localhost",
    ]);
  }
  if (code !== 0) return null;
  return (await runGit(cwd, ["rev-parse", "--short", "HEAD"])) || null;
}

export async function maybeOpenDraftPr(
  cwd: string,
  title: string,
  body: string,
): Promise<string | null> {
  // gh can't open a PR for a branch that only exists locally, and headless gh
  // won't push one. Pushing the relay/* branch is consent-implied by choosing
  // a walkaway lane (it never touches the user's own branches); if the push
  // fails (no remote, no access), there is no PR to open — return null.
  const branch = await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.startsWith("relay/")) return null;
  const pushed = await runGitCode(cwd, ["push", "-u", "origin", branch]);
  if (pushed !== 0) return null;
  const proc = Bun.spawn(
    ["gh", "pr", "create", "--draft", "--title", title, "--body", body],
    { cwd, stdout: "pipe", stderr: "pipe" },
  );
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) return null;
  return (stdout || stderr).trim() || null;
}

export async function runGit(cwd: string, args: string[]): Promise<string> {
  return (await runGitRaw(cwd, args)).trim();
}

/** Like runGit but preserves the exact stdout — porcelain formats are position-sensitive. */
async function runGitRaw(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, code] = await Promise.all([
    new Response(proc.stdout).text(),
    proc.exited,
  ]);
  if (code !== 0) return "";
  return stdout;
}

async function runGitCode(cwd: string, args: string[]): Promise<number> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return await proc.exited;
}
