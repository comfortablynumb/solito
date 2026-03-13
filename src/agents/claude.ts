import { ChildProcess } from "child_process";
import { Agent, AgentHandle, AgentRunOptions } from "./agent";
import { StreamingProcessSpawner } from "../process/streaming-spawner";
import { StreamParser } from "../stream/parser";
import { StreamFormatter } from "../stream/formatter";
import { Logger } from "../util/logger";
import { commandExists } from "../util/command";
import { buildSystemPrompt } from "./prompt-builder";

export interface ClaudeAgentDeps {
  spawner: StreamingProcessSpawner;
  parser: StreamParser;
  formatter: StreamFormatter;
  verbose?: boolean;
  logger?: Logger;
}

const DEFAULT_LOOP_MAX_MINUTES = 10;

export class ClaudeAgent implements Agent {
  readonly name = "claude";

  private readonly spawner: StreamingProcessSpawner;
  private readonly parser: StreamParser;
  private readonly formatter: StreamFormatter;
  private readonly verbose: boolean;
  private readonly logger: Logger | null;

  constructor(deps: ClaudeAgentDeps) {
    this.spawner = deps.spawner;
    this.parser = deps.parser;
    this.formatter = deps.formatter;
    this.verbose = deps.verbose ?? false;
    this.logger = deps.logger ?? null;
  }

  run(prompt: string, options?: AgentRunOptions): AgentHandle {
    const args = this.buildArgs(prompt, options);

    this.logCommand(args);

    const handle = this.spawner.spawn({
      command: "claude",
      args,
      onLine: (line) => this.handleLine(line),
      stdinMode: "pipe",
    });

    this.sendInitialPrompt(handle.child, prompt);

    return { child: handle.child, result: handle.result };
  }

  async isAvailable(): Promise<boolean> {
    return commandExists("claude");
  }

  private buildArgs(prompt: string, options?: AgentRunOptions): string[] {
    const systemPrompt = this.resolveSystemPrompt(prompt, options);

    const args = [
      "--print",
      "--output-format", "stream-json",
      "--input-format", "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--dangerously-skip-permissions",
    ];

    if (systemPrompt) {
      args.push("--append-system-prompt", systemPrompt);
    }

    if (options?.passthrough?.length) {
      args.push(...options.passthrough);
    }

    return args;
  }

  private sendInitialPrompt(child: ChildProcess, prompt: string): void {
    if (!child.stdin) {
      return;
    }

    const message = JSON.stringify({
      type: "user",
      message: { role: "user", content: prompt },
    });

    if (this.verbose && this.logger) {
      this.logger.info(`[stdin] ${message}`);
    }

    child.stdin.write(message + "\n");
  }

  private resolveSystemPrompt(prompt: string, options?: AgentRunOptions): string {
    const loopMaxMinutes = options?.loopMaxMinutes ?? DEFAULT_LOOP_MAX_MINUTES;

    return buildSystemPrompt({
      userPrompt: prompt,
      loopMaxMinutes,
      userSystemPrompt: options?.appendSystemPrompt,
      progressFilePath: options?.progressFilePath,
    });
  }

  private logCommand(args: string[]): void {
    if (!this.verbose || !this.logger) {
      return;
    }

    const displayArgs = redactLongArgs(args);
    this.logger.info(`> claude ${displayArgs.join(" ")}`);
  }

  private handleLine(line: string): void {
    if (this.verbose && this.logger) {
      this.logger.info(line);
    }

    const message = this.parser.parseLine(line);

    if (message) {
      this.formatter.format(message);
    }
  }
}

const MAX_ARG_DISPLAY_LENGTH = 80;
const LONG_ARG_FLAGS = new Set(["--append-system-prompt"]);

function redactLongArgs(args: string[]): string[] {
  const result: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (LONG_ARG_FLAGS.has(arg) && i + 1 < args.length) {
      result.push(arg);
      const value = args[i + 1];
      const truncated = value.length > MAX_ARG_DISPLAY_LENGTH
        ? `"${value.slice(0, MAX_ARG_DISPLAY_LENGTH)}..."`
        : `"${value}"`;
      result.push(truncated);
      i++;
      continue;
    }

    result.push(arg.includes(" ") ? `"${arg}"` : arg);
  }

  return result;
}
