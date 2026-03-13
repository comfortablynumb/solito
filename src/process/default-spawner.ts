import { spawn } from "child_process";
import { ProcessSpawner, SpawnHandle } from "./spawner";
import { OutputBuffer } from "./output-buffer";

export class DefaultProcessSpawner implements ProcessSpawner {
  spawn(command: string, args: string[]): SpawnHandle {
    const child = spawn(command, args, {
      stdio: ["inherit", "pipe", "pipe"],
    });

    const result = new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
      const stdout = new OutputBuffer();
      const stderr = new OutputBuffer();

      child.stdout!.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout.append(text);
        process.stdout.write(text);
      });

      child.stderr!.on("data", (data: Buffer) => {
        const text = data.toString();
        stderr.append(text);
        process.stderr.write(text);
      });

      child.on("error", (err) => {
        reject(new Error(`Failed to start "${command}": ${err.message}`));
      });

      child.on("close", (exitCode) => {
        resolve({
          exitCode: exitCode ?? 1,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      });
    });

    return { child, result };
  }
}
