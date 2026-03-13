import { ChildProcess } from "child_process";

export interface AgentResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface AgentRunOptions {
  appendSystemPrompt?: string;
  loopMaxMinutes?: number;
  passthrough?: string[];
  progressFilePath?: string;
}

export interface AgentHandle {
  child: ChildProcess;
  result: Promise<AgentResult>;
}

export interface Agent {
  readonly name: string;

  run(prompt: string, options?: AgentRunOptions): AgentHandle;

  isAvailable(): Promise<boolean>;
}
