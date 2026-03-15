import { ChildProcess } from "child_process";
import * as childProcess from "child_process";

import { killProcessTree } from "./kill-process-tree";

jest.mock("child_process", () => ({
  execSync: jest.fn(),
}));

function createMockChild(overrides: Partial<ChildProcess> = {}): ChildProcess {
  return {
    pid: 1234,
    killed: false,
    kill: jest.fn(),
    ...overrides,
  } as unknown as ChildProcess;
}

describe("killProcessTree", () => {
  const originalPlatform = process.platform;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("does nothing when child is already killed", () => {
    const child = createMockChild({ killed: true });

    killProcessTree(child);

    expect(child.kill).not.toHaveBeenCalled();
    expect(childProcess.execSync).not.toHaveBeenCalled();
  });

  it("does nothing when child has no pid", () => {
    const child = createMockChild({ pid: undefined, killed: false });

    killProcessTree(child);

    expect(child.kill).not.toHaveBeenCalled();
  });

  it("uses taskkill on Windows", () => {
    // The IS_WINDOWS constant is set at module load time, so we need to
    // test this differently - we test the Windows path by mocking execSync
    // This test verifies the Windows-specific behavior when running on Windows
    // Since IS_WINDOWS is a const evaluated at module load, we test both paths
    // via the current platform
    const child = createMockChild();

    if (process.platform === "win32") {
      killProcessTree(child);
      expect(childProcess.execSync).toHaveBeenCalledWith(
        "taskkill /PID 1234 /T /F",
        expect.objectContaining({ stdio: "ignore" }),
      );
    } else {
      // On Unix, it uses process.kill with negative pid
      const processKillSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
      killProcessTree(child);
      expect(processKillSpy).toHaveBeenCalledWith(-1234, "SIGTERM");
    }
  });

  it("falls back to child.kill on error", () => {
    const child = createMockChild();

    if (process.platform === "win32") {
      (childProcess.execSync as jest.Mock).mockImplementation(() => {
        throw new Error("taskkill failed");
      });
      killProcessTree(child);
      expect(child.kill).toHaveBeenCalledWith("SIGKILL");
    } else {
      jest.spyOn(process, "kill").mockImplementation(() => {
        throw new Error("No such process");
      });
      killProcessTree(child);
      expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    }
  });
});
