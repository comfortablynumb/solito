import { execFile } from "child_process";

export function commandExists(command: string): Promise<boolean> {
  const isWindows = process.platform === "win32";
  const checkCmd = isWindows ? "where" : "which";

  return new Promise((resolve) => {
    execFile(checkCmd, [command], (error) => {
      resolve(!error);
    });
  });
}
