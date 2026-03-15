import { Agent } from "./agent";
import { ClaudeAgent } from "./claude";
import { CodexAgent } from "./codex";
import { DefaultProcessSpawner } from "../process/default-spawner";
import { DefaultStreamingSpawner } from "../process/default-streaming-spawner";
import { JsonStreamParser } from "../stream/parser";
import { ConsoleStreamFormatter } from "../stream/formatter";
import { TerminalMarkdownRenderer } from "../stream/markdown-renderer";
import { ConsoleLogger } from "../util/logger";

export interface GetAgentOptions {
  verbose?: boolean;
}

export type AgentFactory = (options?: GetAgentOptions) => Agent;

const factories = new Map<string, AgentFactory>();

export function registerAgent(name: string, factory: AgentFactory): void {
  factories.set(name, factory);
}

export function getAgent(name: string, options?: GetAgentOptions): Agent {
  const factory = factories.get(name);

  if (!factory) {
    const available = listAgentNames().join(", ");
    throw new Error(`Unknown agent "${name}". Available agents: ${available}`);
  }

  return factory(options);
}

export function listAgentNames(): string[] {
  return Array.from(factories.keys());
}

export function stdoutWrite(text: string): boolean {
  return process.stdout.write(text);
}

function registerBuiltinAgents(): void {
  const processSpawner = new DefaultProcessSpawner();
  const streamingSpawner = new DefaultStreamingSpawner();
  const stdoutOutput = { write: stdoutWrite };

  const markdownRenderer = new TerminalMarkdownRenderer();

  registerAgent("claude", (options) =>
    new ClaudeAgent({
      spawner: streamingSpawner,
      parser: new JsonStreamParser(),
      formatter: new ConsoleStreamFormatter({
        output: stdoutOutput,
        verbose: options?.verbose,
        markdownRenderer,
      }),
      verbose: options?.verbose,
      logger: new ConsoleLogger(),
    }),
  );

  registerAgent("codex", () => new CodexAgent(processSpawner));
}

registerBuiltinAgents();
