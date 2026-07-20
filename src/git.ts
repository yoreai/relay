import { existsSync } from "node:fs";
import { join } from "node:path";

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
  const out = await runGit(cwd, ["status", "--porcelain"]);
  if (!out) return [];
  return out
    .split("\n")
    .map((line) => line.slice(3).trim())
    .filter(Boolean);
}

export async function createWorktree(
  cwd: string,
  branch: string,
): Promise<string> {
  const root = (await gitRoot(cwd)) ?? cwd;
  const dest = join(root, ".relay", "worktrees", branch);
  await Bun.$`mkdir -p ${join(root, ".relay", "worktrees")}`.quiet();
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
  return stdout.trim();
}

async function runGitCode(cwd: string, args: string[]): Promise<number> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return await proc.exited;
}
