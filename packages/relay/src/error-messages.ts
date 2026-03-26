interface TranslatedError {
  /** Friendly message for the user */
  message: string;
  /** Original raw error (present only when translation was applied) */
  detail?: string;
}

const ERROR_PATTERNS: Array<{ pattern: RegExp; template: string }> = [
  {
    pattern: /missing scope:\s*(\S+)/i,
    template: "The agent doesn't have permission to do this. An admin needs to grant the '$1' scope.",
  },
  {
    pattern: /ENOENT/,
    template: "The agent's CLI tool isn't installed on this machine.",
  },
  {
    pattern: /OpenClaw response timed out/i,
    template: "OpenClaw took too long to respond. The task may have been too complex.",
  },
  {
    pattern: /OpenClaw gateway not connected/i,
    template: "Lost connection to the OpenClaw gateway. It may have restarted.",
  },
  {
    pattern: /connection timeout/i,
    template: "Couldn't reach the agent's backend service. It may be down or unreachable.",
  },
  {
    pattern: /ECONNREFUSED/,
    template: "Connection refused. The agent's backend isn't running.",
  },
  {
    pattern: /not logged in/i,
    template: "Claude CLI is not logged in. Run 'claude' and complete the login flow.",
  },
  {
    pattern: /claude exited with code/i,
    template: "Claude encountered an error. Check that the Claude CLI is authenticated and working.",
  },
  {
    pattern: /rate limit/i,
    template: "The agent hit a rate limit. Wait a moment and try again.",
  },
  {
    pattern: /\b(?:auth|unauthorized|forbidden)\b/i,
    template: "Authentication failed. Check the agent's API key or token.",
  },
];

export function translateError(raw: string): TranslatedError {
  if (!raw) return { message: raw };

  for (const { pattern, template } of ERROR_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const message = template.replace(/\$(\d+)/g, (_, i) => match[Number(i)] ?? "");
      return { message, detail: raw };
    }
  }

  return { message: raw };
}
