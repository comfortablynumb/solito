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
    Object.defineProperty(process, "platform", { value: "win32" });
    const child = createMockChild();

    killProcessTree(child);

    expect(childProcess.execSync).toHaveBeenCalledWith(
      "taskkill /PID 1234 /T /F",
      expect.objectContaining({ stdio: "ignore" }),
    );
  });

  it("falls back to child.kill(SIGKILL) when taskkill fails on Windows", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    (childProcess.execSync as jest.Mock).mockImplementation(() => {
      throw new Error("taskkill failed");
    });
    const child = createMockChild();

    killProcessTree(child);

    expect(child.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("uses process.kill with negative pid on Unix", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    const processKillSpy = jest.spyOn(process, "kill").mockImplementation(() => true);
    const child = createMockChild();

    killProcessTree(child);

    expect(processKillSpy).toHaveBeenCalledWith(-1234, "SIGTERM");
  });

  it("falls back to child.kill(SIGTERM) when process.kill fails on Unix", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    jest.spyOn(process, "kill").mockImplementation(() => {
      throw new Error("No such process");
    });
    const child = createMockChild();

    killProcessTree(child);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
