export const PARSE_PREVIEW_MAX_LENGTH = 80;
export const SEPARATOR = "─".repeat(40);

export const ICONS = {
  ANSWER: "💬",
  THINK: "💭",
  TOOL: "⚡",
  USER: "👤",
  TIME: "🕐",
  LOOP: "🔄",
  WARNING: "⚠️",
  STOP: "🛑",
} as const;

export const ANSI = {
  RESET: "\x1b[0m",
  DIM: "\x1b[2m",
  BOLD: "\x1b[1m",
  CYAN: "\x1b[36m",
  YELLOW: "\x1b[33m",
  RED: "\x1b[31m",
  GREEN: "\x1b[32m",
} as const;
