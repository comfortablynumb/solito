import { CliMessage } from "./events";
import { PARSE_PREVIEW_MAX_LENGTH } from "../constants";

export interface StreamParser {
  parseLine(line: string): CliMessage | null;
}

export interface ParserLogger {
  warn(message: string): void;
}

const defaultLogger: ParserLogger = {
  warn: (msg: string) => console.error(msg),
};

export class JsonStreamParser implements StreamParser {
  private readonly logger: ParserLogger;

  constructor(logger?: ParserLogger) {
    this.logger = logger ?? defaultLogger;
  }

  parseLine(line: string): CliMessage | null {
    const trimmed = line.trim();

    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed) as CliMessage;
    } catch {
      const preview = trimmed.length > PARSE_PREVIEW_MAX_LENGTH
        ? trimmed.slice(0, PARSE_PREVIEW_MAX_LENGTH) + "..."
        : trimmed;
      this.logger.warn(`[parser] failed to parse line: ${preview}`);
      return null;
    }
  }
}
