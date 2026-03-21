const COLORS = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  gray: "\x1b[90m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

export function statusIcon(status: string): string {
  switch (status) {
    case "online":
    case "completed":
      return `${COLORS.green}\u25cf${COLORS.reset}`;
    case "offline":
    case "failed":
      return `${COLORS.red}\u25cf${COLORS.reset}`;
    case "working":
      return `${COLORS.yellow}\u25cf${COLORS.reset}`;
    default:
      return `${COLORS.gray}\u25cf${COLORS.reset}`;
  }
}

export function formatTable(headers: string[], rows: string[][]): string {
  const allRows = [headers, ...rows];
  const colWidths = headers.map((_, i) =>
    Math.max(...allRows.map((row) => stripAnsi(row[i] ?? "").length))
  );

  const headerLine = headers.map((h, i) => h.padEnd(colWidths[i])).join("  ");
  const separator = colWidths.map((w) => "\u2500".repeat(w)).join("\u2500\u2500");
  const bodyLines = rows.map((row) =>
    row.map((cell, i) => {
      const stripped = stripAnsi(cell);
      const padding = colWidths[i] - stripped.length;
      return cell + " ".repeat(Math.max(0, padding));
    }).join("  ")
  );

  return [
    `${COLORS.bold}${headerLine}${COLORS.reset}`,
    `${COLORS.gray}${separator}${COLORS.reset}`,
    ...bodyLines,
  ].join("\n");
}

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
