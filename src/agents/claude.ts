import { Agent, AgentHandle, AgentRunOptions } from "./agent";
import { StreamingProcessSpawner } from "../process/streaming-spawner";
import { StreamParser } from "../stream/parser";
import { StreamFormatter } from "../stream/formatter";
import { commandExists } from "../util/command";
import { buildSystemPrompt } from "./prompt-builder";

export interface ClaudeAgentDeps {
  spawner: StreamingProcessSpawner;
  parser: StreamParser;
  formatter: StreamFormatter;
}

const DEFAULT_LOOP_MAX_MINUTES = 10;

export class ClaudeAgent implements Agent {
  readonly name = "claude";

  private readonly spawner: StreamingProcessSpawner;
  private readonly parser: StreamParser;
  private readonly formatter: StreamFormatter;

  constructor(deps: ClaudeAgentDeps) {
    this.spawner = deps.spawner;
    this.parser = deps.parser;
    this.formatter = deps.formatter;
  }

  run(prompt: string, options?: AgentRunOptions): AgentHandle {
    const args = this.buildArgs(prompt, options);

    const handle = this.spawner.spawn({
      command: "claude",
      args,
      onLine: (line) => this.handleLine(line),
    });

    return { child: handle.child, result: handle.result };
  }

  async isAvailable(): Promise<boolean> {
    return commandExists("claude");
  }

  private buildArgs(prompt: string, options?: AgentRunOptions): string[] {
    const systemPrompt = this.resolveSystemPrompt(prompt, options);

    const args = [
      "-p", prompt,
      "--output-format", "stream-json",
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

  private resolveSystemPrompt(prompt: string, options?: AgentRunOptions): string {
    const loopMaxMinutes = options?.loopMaxMinutes ?? DEFAULT_LOOP_MAX_MINUTES;

    return buildSystemPrompt({
      userPrompt: prompt,
      loopMaxMinutes,
      userSystemPrompt: options?.appendSystemPrompt,
      progressFilePath: options?.progressFilePath,
    });
  }

  private handleLine(line: string): void {
    const message = this.parser.parseLine(line);

    if (message) {
      this.formatter.format(message);
    }
  }
}
