/** Shared spawn helper: every backend invocation gets a hard timeout so a
 * hung CLI (e.g. silently waiting on auth/network) fails over to the next
 * fallback backend instead of stalling the run forever. */

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

export function backendTimeoutMs(): number {
  const env = Number(process.env.RELAY_BACKEND_TIMEOUT_MS);
  return Number.isFinite(env) && env > 0 ? env : DEFAULT_TIMEOUT_MS;
}

export type CliResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
};

export async function runCli(
  cmd: string[],
  opts: { cwd?: string; timeoutMs?: number } = {},
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? backendTimeoutMs();
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    proc.kill();
  }, timeoutMs);

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  clearTimeout(timer);

  return {
    stdout,
    stderr: timedOut
      ? stderr + `\n[relay] backend timed out after ${timeoutMs}ms and was killed`
      : stderr,
    exitCode: timedOut && exitCode === 0 ? 124 : exitCode,
    timedOut,
  };
}
