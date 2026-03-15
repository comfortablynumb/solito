import { ChildProcess } from "child_process";
import { SpawnResult } from "./spawner";

export type StdinMode = "inherit" | "ignore" | "pipe";

export interface StreamingSpawnOptions {
  command: string;
  args: string[];
  onLine: (line: string) => void;
  stdinMode?: StdinMode;
}

export interface StreamingSpawnHandle {
  child: ChildProcess;
  result: Promise<SpawnResult>;
}

export interface StreamingProcessSpawner {
  spawn(options: StreamingSpawnOptions): StreamingSpawnHandle;
}
