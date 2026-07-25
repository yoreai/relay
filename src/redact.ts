/**
 * Secret scrubbing for anything relay persists or hands to another agent.
 *
 * Backend CLIs print whatever they print — an auth failure that echoes the key,
 * the output of a command that read a `.env`. relay writes failure excerpts to
 * `events/<run_id>.jsonl` and returns an output tail over MCP, where the calling
 * agent stores it in its own transcript. Neither sink can promise the text is
 * clean, so both get scrubbed on the way out.
 *
 * This is defense in depth, not a guarantee: pattern matching cannot recognize
 * every credential, so nothing here licenses widening what relay captures.
 */

type Rule = { name: string; re: RegExp };

/**
 * Ordered longest-prefix-first: a vendor-specific rule should win over the
 * generic assignment rule so the label in the placeholder stays informative.
 */
const RULES: Rule[] = [
  { name: "anthropic-key", re: /\bsk-ant-[A-Za-z0-9._-]{8,}/g },
  { name: "openai-key", re: /\bsk-(?:proj-)?[A-Za-z0-9]{16,}/g },
  { name: "github-token", re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{16,}/g },
  { name: "github-pat", re: /\bgithub_pat_[A-Za-z0-9_]{20,}/g },
  { name: "slack-token", re: /\bxox[abposr]-[A-Za-z0-9-]{8,}/g },
  { name: "google-key", re: /\bAIza[A-Za-z0-9_-]{20,}/g },
  { name: "aws-key-id", re: /\b(?:AKIA|ASIA)[A-Z0-9]{12,}/g },
  { name: "private-key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: "jwt", re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { name: "bearer", re: /\b[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/g },
  // KEY=value / "api_key": "value" for names that advertise themselves
  {
    name: "secret-assignment",
    re: /\b([A-Za-z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|ACCESS_?KEY|CREDENTIAL)[A-Za-z0-9_]*)\b(\s*[:=]\s*"?)([^\s"',]{6,})/gi,
  },
];

export function redactSecrets(text: string): string {
  if (!text) return text;
  let out = text;
  for (const rule of RULES) {
    out = rule.name === "secret-assignment"
      ? out.replace(rule.re, (_m, key, sep) => `${key}${sep}[redacted]`)
      : out.replace(rule.re, `[redacted:${rule.name}]`);
  }
  return out;
}

/** true when scrubbing changed the text — for telling the user it happened. */
export function containsSecret(text: string): boolean {
  return redactSecrets(text) !== text;
}
