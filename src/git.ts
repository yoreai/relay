import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
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

export async function createWorktree(
  cwd: string,
  branch: string,
): Promise<string> {
  const root = (await gitRoot(cwd)) ?? cwd;
  const dest = join(root, ".relay", "worktrees", branch);
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

export async function maybeOpenDraftPr(
  cwd: string,
  title: string,
  body: string,
): Promise<string | null> {
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

async function runGit(cwd: string, args: string[]): Promise<string> {
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
