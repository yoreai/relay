/** Shared spawn helper: every backend invocation gets an inactivity timeout so a
 * hung CLI (e.g. silently waiting on auth/network) fails over to the next
 * fallback backend instead of stalling the run forever. The timer resets on
 * every stdout/stderr chunk — a working CLI that streams output can run longer
 * than the silence window; only total silence triggers a kill. */

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

function createInactivityTimer(
  timeoutMs: number,
  onTimeout: () => void,
): { reset: () => void; clear: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const reset = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(onTimeout, timeoutMs);
  };

  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  reset();
  return { reset, clear };
}

async function drain(
  stream: ReadableStream<Uint8Array>,
  onChunk?: (chunk: string) => void,
  onActivity?: () => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const bytes of stream) {
    const chunk = decoder.decode(bytes, { stream: true });
    out += chunk;
    onChunk?.(chunk);
    onActivity?.();
  }
  out += decoder.decode();
  return out;
}

export async function runCli(
  cmd: string[],
  opts: {
    cwd?: string;
    timeoutMs?: number;
    /** overrides the default env (which tags the child RELAY_WORKER=1) */
    env?: Record<string, string | undefined>;
    /** called with each chunk of stdout/stderr as it arrives, for live streaming */
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  } = {},
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? backendTimeoutMs();
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd,
    stdout: "pipe",
    stderr: "pipe",
    // RELAY_WORKER marks the child (and anything it spawns, incl. MCP servers)
    // so relay_run / the relay CLI can hard-refuse recursive delegation.
    // Callers that aren't dispatching backend work (e.g. a login command)
    // can pass their own `env` to skip this tag.
    env: opts.env ?? { ...process.env, RELAY_WORKER: "1" },
  });

  let timedOut = false;
  const inactivity = createInactivityTimer(timeoutMs, () => {
    timedOut = true;
    proc.kill();
  });
  const resetInactivity = () => inactivity.reset();

  const [stdout, stderr, exitCode] = await Promise.all([
    drain(proc.stdout, opts.onStdout, resetInactivity),
    drain(proc.stderr, opts.onStderr, resetInactivity),
    proc.exited,
  ]);
  inactivity.clear();

  return {
    stdout,
    stderr: timedOut
      ? stderr +
        `\n[relay] backend produced no output for ${timeoutMs}ms and was killed (set RELAY_BACKEND_TIMEOUT_MS to raise the limit)`
      : stderr,
    exitCode: timedOut && exitCode === 0 ? 124 : exitCode,
    timedOut,
  };
}
