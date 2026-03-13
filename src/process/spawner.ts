import { ChildProcess } from "child_process";

export interface SpawnResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SpawnHandle {
  child: ChildProcess;
  result: Promise<SpawnResult>;
}

export interface ProcessSpawner {
  spawn(command: string, args: string[]): SpawnHandle;
}
