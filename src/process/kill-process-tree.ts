import { ChildProcess, execSync } from "child_process";

const IS_WINDOWS = process.platform === "win32";

export function killProcessTree(child: ChildProcess): void {
  if (child.killed || !child.pid) {
    return;
  }

  if (IS_WINDOWS) {
    killWindowsProcessTree(child);
    return;
  }

  killUnixProcessGroup(child);
}

function killWindowsProcessTree(child: ChildProcess): void {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore" });
  } catch {
    child.kill("SIGKILL");
  }
}

function killUnixProcessGroup(child: ChildProcess): void {
  try {
    process.kill(-child.pid!, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
}
