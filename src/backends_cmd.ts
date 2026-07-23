import { installedBackends } from "./backends/index.ts";
import { KNOWN_BACKENDS } from "./backends/index.ts";
import { disabledBackends, setBackendEnabled } from "./settings.ts";

export type BackendChoice = {
  backend: string;
  installed: boolean;
  enabled: boolean;
};

export function listBackendChoices(): BackendChoice[] {
  const installed = installedBackends();
  const disabled = disabledBackends();
  return KNOWN_BACKENDS.filter((b) => b !== "fake").map((backend) => ({
    backend,
    installed: installed.has(backend),
    enabled: !disabled.has(backend),
  }));
}

export function formatBackends(): string {
  const lines = ["backends relay may route work to:", ""];
  for (const c of listBackendChoices()) {
    const mark = !c.installed ? "·" : c.enabled ? "✓" : "✗";
    const note = !c.installed
      ? "not installed"
      : c.enabled
        ? "enabled"
        : "disabled by you";
    lines.push(`  ${mark} ${c.backend.padEnd(8)} ${note}`);
  }
  lines.push("");
  lines.push("change: relay backends enable|disable <tool>");
  return lines.join("\n");
}

/** `relay backends [enable|disable <tool>]` */
export function runBackendsCommand(rest: string[]): string {
  const [action, tool] = rest;
  if (!action) return formatBackends();
  if ((action !== "enable" && action !== "disable") || !tool) {
    return "usage: relay backends [enable|disable <tool>]";
  }
  const known = KNOWN_BACKENDS.filter((b) => b !== "fake");
  if (!known.includes(tool as (typeof known)[number])) {
    return `unknown backend "${tool}". Known: ${known.join(", ")}`;
  }
  const disabled = setBackendEnabled(tool, action === "enable");
  return (
    `${action === "enable" ? "✓ enabled" : "· disabled"} ${tool}` +
    (disabled.length ? `\ndisabled: ${disabled.join(", ")}` : "\nall installed backends enabled") +
    "\n\n" +
    formatBackends()
  );
}
