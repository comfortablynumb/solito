import { Agent, AgentHandle, AgentRunOptions } from "./agent";
import { ProcessSpawner } from "../process/spawner";
import { commandExists } from "../util/command";

export class CodexAgent implements Agent {
  readonly name = "codex";

  constructor(private readonly spawner: ProcessSpawner) {}

  run(prompt: string, options?: AgentRunOptions): AgentHandle {
    const args = ["--prompt", prompt];

    if (options?.passthrough?.length) {
      args.push(...options.passthrough);
    }

    const handle = this.spawner.spawn("codex", args);
    return { ...handle, iterationComplete: { value: false }, exitRequested: { value: false } };
  }

  async isAvailable(): Promise<boolean> {
    return commandExists("codex");
  }
}
