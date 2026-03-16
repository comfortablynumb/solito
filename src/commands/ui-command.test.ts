import { executeUiCommand, ignoreStopError } from "./ui-command";
import { createMockFileSystem } from "../test/mock-filesystem";
import { createMockLogger } from "../test/mock-logger";

describe("ignoreStopError", () => {
  it("does nothing when called", () => {
    expect(() => ignoreStopError()).not.toThrow();
  });

  it("returns undefined", () => {
    expect(ignoreStopError()).toBeUndefined();
  });
});

describe("executeUiCommand", () => {
  it("starts server and exits immediately on SIGINT", async () => {
    const logger = createMockLogger();
    const filesystem = createMockFileSystem();
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);

    executeUiCommand({
      host: "127.0.0.1",
      port: 0,
      cwd: "/project",
      filesystem,
      logger,
    });

    // Wait for server to start
    await new Promise((r) => setTimeout(r, 100));

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("Solardi UI running"));

    // Trigger shutdown — should exit immediately
    process.emit("SIGINT", "SIGINT");

    await new Promise((r) => setTimeout(r, 50));

    expect(logger.info).toHaveBeenCalledWith("Shutting down Solardi UI...");
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });

  it("shuts down on SIGTERM", async () => {
    const logger = createMockLogger();
    const filesystem = createMockFileSystem();
    const mockExit = jest.spyOn(process, "exit").mockImplementation(() => undefined as never);

    executeUiCommand({
      host: "127.0.0.1",
      port: 0,
      cwd: "/project",
      filesystem,
      logger,
    });

    await new Promise((r) => setTimeout(r, 100));

    process.emit("SIGTERM", "SIGTERM");

    await new Promise((r) => setTimeout(r, 50));

    expect(logger.info).toHaveBeenCalledWith("Shutting down Solardi UI...");
    expect(mockExit).toHaveBeenCalledWith(0);

    mockExit.mockRestore();
  });
});
