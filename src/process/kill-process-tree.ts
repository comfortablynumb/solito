import { ChildProcess, execSync } from "child_process";

export function killProcessTree(child: ChildProcess): void {
  if (child.killed || !child.pid) {
    return;
  }

  if (process.platform === "win32") {
    killWindowsProcessTree(child);
    return;
  }

  killUnixProcessGroup(child);
}

function killWindowsProcessTree(child: ChildProcess): void {
  try {
    execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: "ignore", windowsHide: true });
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
