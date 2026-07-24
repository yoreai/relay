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

/** Collects streamed text where the caller can still read it if we stop waiting. */
type Sink = { text: string };

async function drain(
  stream: ReadableStream<Uint8Array>,
  sink: Sink,
  onChunk?: (chunk: string) => void,
  onActivity?: () => void,
): Promise<void> {
  const decoder = new TextDecoder();
  for await (const bytes of stream) {
    const chunk = decoder.decode(bytes, { stream: true });
    sink.text += chunk;
    onChunk?.(chunk);
    onActivity?.();
  }
  sink.text += decoder.decode();
}

/**
 * Backend CLIs leave helper processes behind (cursor-agent keeps a
 * `worker-server`), and those inherit the stdout/stderr pipes. Waiting for the
 * streams to close then waits on the orphan, not the run — a kill can look like
 * a hang forever. Once the child itself is gone, reading gets a short grace
 * period and then we move on with whatever arrived.
 */
const POST_EXIT_DRAIN_MS = 2_000;

/** A cancellable ceiling: left pending it would delay every run's exit by 2s. */
function graceTimer(ms: number): { reached: Promise<void>; cancel: () => void } {
  let cancel = () => {};
  const reached = new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    cancel = () => clearTimeout(t);
  });
  return { reached, cancel };
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

  const out: Sink = { text: "" };
  const err: Sink = { text: "" };
  // Started eagerly so the child never blocks on a full pipe while we await it.
  let drained = false;
  const drains = Promise.all([
    drain(proc.stdout, out, opts.onStdout, resetInactivity),
    drain(proc.stderr, err, opts.onStderr, resetInactivity),
  ])
    .then(() => {
      drained = true;
    })
    .catch(() => {
      // a stream error still leaves whatever arrived in the sinks
    });

  const exitCode = await proc.exited;
  const grace = graceTimer(POST_EXIT_DRAIN_MS);
  await Promise.race([drains, grace.reached]);
  grace.cancel();
  inactivity.clear();

  const notes = [
    timedOut
      ? `[relay] backend produced no output for ${timeoutMs}ms and was killed (set RELAY_BACKEND_TIMEOUT_MS to raise the limit)`
      : "",
    drained
      ? ""
      : `[relay] stopped reading output ${POST_EXIT_DRAIN_MS}ms after the backend exited — a leftover child process still held the pipe open, so this output may be truncated`,
  ].filter(Boolean);

  return {
    stdout: out.text,
    stderr: notes.length ? [err.text, ...notes].join("\n") : err.text,
    exitCode: timedOut && exitCode === 0 ? 124 : exitCode,
    timedOut,
  };
}
