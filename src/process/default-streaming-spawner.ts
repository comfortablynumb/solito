import { spawn } from "child_process";
import { StreamingProcessSpawner, StreamingSpawnHandle, StreamingSpawnOptions } from "./streaming-spawner";
import { OutputBuffer } from "./output-buffer";

export class DefaultStreamingSpawner implements StreamingProcessSpawner {
  spawn(options: StreamingSpawnOptions): StreamingSpawnHandle {
    const { command, args, onLine, inheritStdin } = options;
    const stdin = inheritStdin ? "inherit" as const : "ignore" as const;

    const child = spawn(command, args, {
      stdio: [stdin, "pipe", "pipe"],
    });

    const result = new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve, reject) => {
      const stdout = new OutputBuffer();
      const stderr = new OutputBuffer();
      let lineBuffer = "";

      child.stdout!.on("data", (data: Buffer) => {
        const text = data.toString();
        stdout.append(text);
        lineBuffer += text;
        lineBuffer = this.processBuffer(lineBuffer, onLine);
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
        this.flushBuffer(lineBuffer, onLine);
        resolve({
          exitCode: exitCode ?? 1,
          stdout: stdout.toString(),
          stderr: stderr.toString(),
        });
      });
    });

    return { child, result };
  }

  private processBuffer(buffer: string, onLine: (line: string) => void): string {
    const lines = buffer.split("\n");
    const remaining = lines.pop() ?? "";

    for (const line of lines) {
      onLine(line);
    }

    return remaining;
  }

  private flushBuffer(buffer: string, onLine: (line: string) => void): void {
    if (buffer.length > 0) {
      onLine(buffer);
    }
  }
}
